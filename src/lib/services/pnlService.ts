import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PNLSummary,
  PNLChartPoint,
  PNLCalendarDay,
  PNLCalendarMonth,
  Trade,
  PeriodType,
  Result,
  TradeSegment,
  DashboardOverview,
  Exchange,
  AssetDistributionSummary,
} from '@/lib/types'
import { getTradesForPNL, getTrades, getTradeTotals } from '@/lib/db/tradesDb'
import { calculatePNLSummary, buildPNLTimeSeries, buildPNLCalendarDays, buildPNLCalendarMonths, getDateRangeForPeriod } from '@/lib/engines/pnlEngine'

type GetTradesOptions = {
  page: number
  limit: number
  exchangeAccountId?: string
  exchange?: Exchange
  symbol?: string
  segment?: TradeSegment
  executedOnly?: boolean
}

type TradesResult = {
  trades: Trade[]
  total: number
}

function mapSegmentToTradeType(segment: TradeSegment): 'spot' | 'futures' | undefined {
  if (segment === 'all') return undefined
  return segment
}

function getWindowStartDate(days: number): Date {
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setDate(now.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return start
}

function getWindowEndDate(): Date {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return end
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function aggregateDailyPnl(trades: Trade[], startMs?: number): Map<string, number> {
  const dailyPnl = new Map<string, number>()

  for (const trade of trades) {
    if (trade.realized_pnl === null) continue

    const tradedMs = new Date(trade.traded_at).getTime()
    if (startMs !== undefined && tradedMs < startMs) continue

    const pnl = Number(trade.realized_pnl)
    if (!Number.isFinite(pnl)) continue

    const dateKey = toDateKey(new Date(trade.traded_at))
    const current = dailyPnl.get(dateKey) ?? 0
    dailyPnl.set(dateKey, current + pnl)
  }

  return dailyPnl
}

function sumPnlFromDate(trades: Trade[], startDate: Date): number {
  const startMs = startDate.getTime()
  const total = trades.reduce((sum, trade) => {
    const pnl = trade.realized_pnl
    if (pnl === null) return sum

    const numericPnl = Number(pnl)
    if (!Number.isFinite(numericPnl)) return sum

    const tradedMs = new Date(trade.traded_at).getTime()
    if (tradedMs < startMs) return sum
    return sum + numericPnl
  }, 0)

  return parseFloat(total.toFixed(8))
}

function sumPnl(trades: Trade[]): number {
  const total = trades.reduce((sum, trade) => {
    if (trade.realized_pnl === null) return sum

    const pnl = Number(trade.realized_pnl)
    if (!Number.isFinite(pnl)) return sum
    return sum + pnl
  }, 0)

  return parseFloat(total.toFixed(8))
}

function isExecutedTrade(trade: Trade): boolean {
  return trade.quantity > 0 && trade.price > 0
}

function sumVolumeByDays(trades: Trade[], days: number): number {
  const startDate = getWindowStartDate(days)
  const startMs = startDate.getTime()

  const total = trades.reduce((sum, trade) => {
    if (!isExecutedTrade(trade)) return sum
    const tradedMs = new Date(trade.traded_at).getTime()
    if (tradedMs < startMs) return sum
    return sum + trade.quantity * trade.price
  }, 0)

  return parseFloat(total.toFixed(8))
}

function calculateWinRateByDays(trades: Trade[], days: number): number {
  const startDate = getWindowStartDate(days)
  const startMs = startDate.getTime()
  const dailyPnl = aggregateDailyPnl(trades, startMs)

  let winDays = 0
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + offset)
    const pnl = dailyPnl.get(toDateKey(date)) ?? 0
    if (pnl > 0) {
      winDays += 1
    }
  }

  return parseFloat(((winDays / days) * 100).toFixed(2))
}

function calculateAllTimeWinRate(trades: Trade[]): number {
  const dailyPnl = aggregateDailyPnl(trades)
  if (dailyPnl.size === 0) {
    return 0
  }

  const winDays = Array.from(dailyPnl.values()).filter((pnl) => pnl > 0).length
  return parseFloat(((winDays / dailyPnl.size) * 100).toFixed(2))
}

function extractBaseAssetFromSymbol(symbol: string): string | null {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9_]/g, '')
  if (!normalized) return null

  const head = normalized.split('_')[0]
  const withoutContractSuffix = head.replace(/(UMCBL|DMCBL|CMCBL|USDTFUTURES|COINFUTURES|USDCFUTURES)$/g, '')
  const quoteSuffixes = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH']

  for (const suffix of quoteSuffixes) {
    if (withoutContractSuffix.endsWith(suffix) && withoutContractSuffix.length > suffix.length) {
      return withoutContractSuffix.slice(0, -suffix.length)
    }
  }

  return withoutContractSuffix || null
}

export async function fetchPNLSummary(
  supabase: SupabaseClient,
  userId: string,
  range: PeriodType,
  exchangeAccountId?: string,
  segment: TradeSegment = 'all',
  exchange?: Exchange
): Promise<Result<PNLSummary>> {
  let startDate: string | undefined
  let endDate: string | undefined

  if (range !== 'all') {
    const dateRange = getDateRangeForPeriod(range as 'day' | 'week' | 'month' | 'year')
    startDate = dateRange.startDate
    endDate = dateRange.endDate
  }

  const trades = await getTradesForPNL(supabase, userId, {
    startDate,
    endDate,
    exchangeAccountId,
    exchange,
    tradeType: mapSegmentToTradeType(segment),
  })

  const summary = calculatePNLSummary(trades, range)
  return { success: true, data: summary }
}

export async function fetchPNLChart(
  supabase: SupabaseClient,
  userId: string,
  range: 'day' | 'week' | 'month' | 'year',
  exchangeAccountId?: string,
  segment: TradeSegment = 'all',
  exchange?: Exchange
): Promise<Result<PNLChartPoint[]>> {
  const { startDate, endDate } = getDateRangeForPeriod(range)

  const trades = await getTradesForPNL(supabase, userId, {
    startDate,
    endDate,
    exchangeAccountId,
    exchange,
    tradeType: mapSegmentToTradeType(segment),
  })

  const chartData = buildPNLTimeSeries(trades, range)
  return { success: true, data: chartData }
}

export async function fetchPaginatedTrades(
  supabase: SupabaseClient,
  userId: string,
  options: GetTradesOptions
): Promise<Result<TradesResult>> {
  const { trades, total } = await getTrades(supabase, userId, {
    ...options,
    tradeType: mapSegmentToTradeType(options.segment ?? 'all'),
  })
  return { success: true, data: { trades, total } }
}

export async function fetchPNLCalendar(
  supabase: SupabaseClient,
  userId: string,
  view: 'daily' | 'monthly',
  year: number,
  month?: number,
  segment: TradeSegment = 'all',
  exchange?: Exchange
): Promise<Result<PNLCalendarDay[] | PNLCalendarMonth[]>> {
  let startDate: string
  let endDate: string

  if (view === 'daily' && month) {
    startDate = new Date(year, month - 1, 1).toISOString()
    endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString()
  } else {
    startDate = new Date(year, 0, 1).toISOString()
    endDate = new Date(year, 11, 31, 23, 59, 59, 999).toISOString()
  }

  const trades = await getTradesForPNL(supabase, userId, {
    startDate,
    endDate,
    exchange,
    tradeType: mapSegmentToTradeType(segment),
  })

  if (view === 'daily' && month) {
    return { success: true, data: buildPNLCalendarDays(trades, year, month) }
  }
  return { success: true, data: buildPNLCalendarMonths(trades, year) }
}

export async function fetchDashboardOverview(
  supabase: SupabaseClient,
  userId: string,
  segment: TradeSegment,
  exchange?: Exchange
): Promise<Result<DashboardOverview>> {
  const tradeType = mapSegmentToTradeType(segment)
  const rangeStartYear = getWindowStartDate(365).toISOString()
  const rangeEndIso = getWindowEndDate().toISOString()

  const [yearTrades, allTrades, totals] = await Promise.all([
    getTradesForPNL(supabase, userId, {
      startDate: rangeStartYear,
      endDate: rangeEndIso,
      exchange,
      tradeType,
    }),
    getTradesForPNL(supabase, userId, {
      endDate: rangeEndIso,
      exchange,
      tradeType,
    }),
    getTradeTotals(supabase, userId, {
      tradeType,
      exchange,
      executedOnly: true,
    }),
  ])

  const overview: DashboardOverview = {
    pnl: {
      today: sumPnlFromDate(yearTrades, getWindowStartDate(1)),
      d7: sumPnlFromDate(yearTrades, getWindowStartDate(7)),
      d30: sumPnlFromDate(yearTrades, getWindowStartDate(30)),
      d90: sumPnlFromDate(yearTrades, getWindowStartDate(90)),
      year: sumPnl(yearTrades),
      all: sumPnl(allTrades),
    },
    winRate: {
      d7: calculateWinRateByDays(yearTrades, 7),
      d30: calculateWinRateByDays(yearTrades, 30),
      d90: calculateWinRateByDays(yearTrades, 90),
      all: calculateAllTimeWinRate(allTrades),
    },
    totalTrades: {
      count: totals.count,
      volumeUsd: totals.volumeUsd,
      volumeUsdD7: sumVolumeByDays(yearTrades, 7),
      volumeUsdD30: sumVolumeByDays(yearTrades, 30),
      volumeUsdD90: sumVolumeByDays(yearTrades, 90),
      volumeUsdAll: totals.volumeUsd,
    },
  }

  return { success: true, data: overview }
}

export async function fetchAssetDistribution(
  supabase: SupabaseClient,
  userId: string,
  segment: TradeSegment = 'all',
  exchange?: Exchange
): Promise<Result<AssetDistributionSummary>> {
  const tradeType = mapSegmentToTradeType(segment)
  const trades = await getTradesForPNL(supabase, userId, {
    exchange,
    tradeType,
    executedOnly: true,
  })

  const buckets = new Map<string, { exchange: Exchange; asset: string; quantity: number; lastPrice: number }>()

  for (const trade of trades) {
    const tradeExchange = (trade as Trade & { exchange?: Exchange }).exchange
    if (!tradeExchange) continue

    const asset = extractBaseAssetFromSymbol(trade.symbol)
    if (!asset) continue

    const signedQuantity = trade.side === 'buy' ? trade.quantity : -trade.quantity
    const key = `${tradeExchange}:${asset}`
    const current = buckets.get(key) ?? {
      exchange: tradeExchange,
      asset,
      quantity: 0,
      lastPrice: 0,
    }

    current.quantity += signedQuantity
    if (Number.isFinite(trade.price) && trade.price > 0) {
      current.lastPrice = trade.price
    }

    buckets.set(key, current)
  }

  const rows = Array.from(buckets.values())
    .map((item) => {
      const quantity = Math.abs(item.quantity)
      const usdValue = quantity * item.lastPrice
      return {
        exchange: item.exchange,
        asset: item.asset,
        quantity,
        usdValue,
      }
    })
    .filter((item) => item.quantity > 0 && item.usdValue > 0)
    .sort((a, b) => b.usdValue - a.usdValue)

  const totalUsdRaw = rows.reduce((sum, item) => sum + item.usdValue, 0)
  const totalUsd = parseFloat(totalUsdRaw.toFixed(8))

  const items = rows.map((item) => ({
    ...item,
    ratio: totalUsdRaw > 0 ? parseFloat((item.usdValue / totalUsdRaw).toFixed(8)) : 0,
  }))

  return {
    success: true,
    data: {
      totalUsd,
      items,
    },
  }
}
