import type { SupabaseClient } from '@supabase/supabase-js'
import type { PNLSummary, PNLChartPoint, PNLCalendarDay, PNLCalendarMonth, Trade, PeriodType, Result, TradeSegment, DashboardOverview } from '@/lib/types'
import { getTradesForPNL, getTrades, getTradeTotals } from '@/lib/db/tradesDb'
import { calculatePNLSummary, buildPNLTimeSeries, buildPNLCalendarDays, buildPNLCalendarMonths, getDateRangeForPeriod } from '@/lib/engines/pnlEngine'

type GetTradesOptions = {
  page: number
  limit: number
  exchangeAccountId?: string
  symbol?: string
  segment?: TradeSegment
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

function sumPnlFromDate(trades: Trade[], startDate: Date): number {
  const startMs = startDate.getTime()
  const total = trades.reduce((sum, trade) => {
    const pnl = trade.realized_pnl
    if (pnl === null) return sum
    const tradedMs = new Date(trade.traded_at).getTime()
    if (tradedMs < startMs) return sum
    return sum + Number(pnl)
  }, 0)

  return parseFloat(total.toFixed(8))
}

function calculateWinRateByDays(trades: Trade[], days: number): number {
  const startDate = getWindowStartDate(days)
  const pnlByDay = new Map<string, number>()

  for (const trade of trades) {
    if (trade.realized_pnl === null) continue
    const tradedAt = new Date(trade.traded_at)
    if (tradedAt < startDate) continue
    const dayKey = tradedAt.toISOString().slice(0, 10)
    const existing = pnlByDay.get(dayKey) ?? 0
    pnlByDay.set(dayKey, existing + Number(trade.realized_pnl))
  }

  let winDays = 0
  for (let i = 0; i < days; i++) {
    const day = new Date(startDate)
    day.setDate(startDate.getDate() + i)
    const key = day.toISOString().slice(0, 10)
    const pnl = pnlByDay.get(key) ?? 0
    if (pnl > 0) winDays += 1
  }

  return parseFloat(((winDays / days) * 100).toFixed(2))
}

export async function fetchPNLSummary(
  supabase: SupabaseClient,
  userId: string,
  range: PeriodType,
  exchangeAccountId?: string,
  segment: TradeSegment = 'all'
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
  segment: TradeSegment = 'all'
): Promise<Result<PNLChartPoint[]>> {
  const { startDate, endDate } = getDateRangeForPeriod(range)

  const trades = await getTradesForPNL(supabase, userId, {
    startDate,
    endDate,
    exchangeAccountId,
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
  segment: TradeSegment = 'all'
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
  segment: TradeSegment
): Promise<Result<DashboardOverview>> {
  const tradeType = mapSegmentToTradeType(segment)
  const rangeStart90 = getWindowStartDate(90).toISOString()
  const nowIso = new Date().toISOString()

  const [recentTrades, totals] = await Promise.all([
    getTradesForPNL(supabase, userId, {
      startDate: rangeStart90,
      endDate: nowIso,
      tradeType,
    }),
    getTradeTotals(supabase, userId, { tradeType }),
  ])

  const overview: DashboardOverview = {
    pnl: {
      today: sumPnlFromDate(recentTrades, getWindowStartDate(1)),
      d7: sumPnlFromDate(recentTrades, getWindowStartDate(7)),
      d30: sumPnlFromDate(recentTrades, getWindowStartDate(30)),
      d90: sumPnlFromDate(recentTrades, getWindowStartDate(90)),
    },
    winRate: {
      d7: calculateWinRateByDays(recentTrades, 7),
      d30: calculateWinRateByDays(recentTrades, 30),
      d90: calculateWinRateByDays(recentTrades, 90),
    },
    totalTrades: {
      count: totals.count,
      volumeUsd: totals.volumeUsd,
    },
  }

  return { success: true, data: overview }
}
