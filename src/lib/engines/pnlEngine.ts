import type { Trade, PNLSummary, PNLChartPoint, PNLCalendarDay, PNLCalendarMonth, PeriodType } from '@/lib/types'

export function calculatePNLSummary(trades: Trade[], period: PeriodType): PNLSummary {
  if (trades.length === 0) {
    return {
      total_pnl: 0,
      win_rate: 0,
      trade_count: 0,
      win_count: 0,
      loss_count: 0,
      best_trade: null,
      worst_trade: null,
      period,
    }
  }

  const tradesWithPNL = trades.filter((t) => t.realized_pnl !== null)

  let totalPnl = 0
  let winCount = 0
  let lossCount = 0
  let bestTrade: number | null = null
  let worstTrade: number | null = null

  for (const trade of tradesWithPNL) {
    const pnl = Number(trade.realized_pnl)
    totalPnl += pnl

    if (pnl > 0) {
      winCount++
      if (bestTrade === null || pnl > bestTrade) bestTrade = pnl
    } else if (pnl < 0) {
      lossCount++
      if (worstTrade === null || pnl < worstTrade) worstTrade = pnl
    }
  }

  const totalWithPNL = winCount + lossCount
  const winRate = totalWithPNL > 0 ? (winCount / totalWithPNL) * 100 : 0

  return {
    total_pnl: parseFloat(totalPnl.toFixed(8)),
    win_rate: parseFloat(winRate.toFixed(2)),
    trade_count: trades.length,
    win_count: winCount,
    loss_count: lossCount,
    best_trade: bestTrade !== null ? parseFloat(bestTrade.toFixed(8)) : null,
    worst_trade: worstTrade !== null ? parseFloat(worstTrade.toFixed(8)) : null,
    period,
  }
}

export function buildPNLTimeSeries(
  trades: Trade[],
  range: 'day' | 'week' | 'month' | 'year'
): PNLChartPoint[] {
  const tradesWithPNL = trades.filter((t) => t.realized_pnl !== null)

  const buckets = buildBuckets(range)
  const grouped = new Map<string, number>(buckets.map((bucket) => [bucket, 0]))

  for (const trade of tradesWithPNL) {
    const key = toBucketKey(new Date(trade.traded_at), range)
    if (!grouped.has(key)) continue
    const existing = grouped.get(key) ?? 0
    grouped.set(key, existing + Number(trade.realized_pnl))
  }

  let cumulative = 0
  const points: PNLChartPoint[] = []

  for (const bucket of buckets) {
    const pnl = grouped.get(bucket) ?? 0
    cumulative += pnl
    points.push({
      date: bucket,
      pnl: parseFloat(pnl.toFixed(8)),
      cumulative_pnl: parseFloat(cumulative.toFixed(8)),
    })
  }

  return points
}

function toBucketKey(date: Date, range: 'day' | 'week' | 'month' | 'year'): string {
  if (range === 'day') {
    return formatHourKey(date)
  }

  if (range === 'year') {
    return formatMonthKey(date)
  }

  return formatDayKey(date)
}

function buildBuckets(range: 'day' | 'week' | 'month' | 'year'): string[] {
  const now = new Date()

  if (range === 'day') {
    const buckets: string[] = []
    for (let i = 23; i >= 0; i -= 1) {
      const d = new Date(now)
      d.setHours(now.getHours() - i, 0, 0, 0)
      buckets.push(formatHourKey(d))
    }
    return buckets
  }

  if (range === 'year') {
    const buckets: string[] = []
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push(formatMonthKey(d))
    }
    return buckets
  }

  const windowDays = range === 'week' ? 7 : 30
  const buckets: string[] = []
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    d.setHours(0, 0, 0, 0)
    buckets.push(formatDayKey(d))
  }
  return buckets
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatMonthKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${year}-${month}`
}

function formatHourKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:00`
}

export function buildPNLCalendarDays(trades: Trade[], year: number, month: number): PNLCalendarDay[] {
  const tradesWithPNL = trades.filter((t) => t.realized_pnl !== null)
  const grouped = new Map<string, { pnl: number; count: number }>()

  for (const trade of tradesWithPNL) {
    const d = new Date(trade.traded_at)
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const existing = grouped.get(dateKey) ?? { pnl: 0, count: 0 }
    grouped.set(dateKey, { pnl: existing.pnl + Number(trade.realized_pnl), count: existing.count + 1 })
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const result: PNLCalendarDay[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const data = grouped.get(dateKey)
    result.push({
      date: dateKey,
      pnl: data ? parseFloat(data.pnl.toFixed(4)) : 0,
      tradeCount: data?.count ?? 0,
    })
  }

  return result
}

export function buildPNLCalendarMonths(trades: Trade[], year: number): PNLCalendarMonth[] {
  const tradesWithPNL = trades.filter((t) => t.realized_pnl !== null)
  const grouped = new Map<number, { pnl: number; count: number }>()

  for (const trade of tradesWithPNL) {
    const d = new Date(trade.traded_at)
    if (d.getFullYear() !== year) continue
    const m = d.getMonth() + 1
    const existing = grouped.get(m) ?? { pnl: 0, count: 0 }
    grouped.set(m, { pnl: existing.pnl + Number(trade.realized_pnl), count: existing.count + 1 })
  }

  const result: PNLCalendarMonth[] = []
  for (let m = 1; m <= 12; m++) {
    const data = grouped.get(m)
    result.push({
      year,
      month: m,
      pnl: data ? parseFloat(data.pnl.toFixed(4)) : 0,
      tradeCount: data?.count ?? 0,
    })
  }

  return result
}

export function getDateRangeForPeriod(range: 'day' | 'week' | 'month' | 'year'): {
  startDate: string
  endDate: string
} {
  const now = new Date()
  const endDate = now.toISOString()

  let startDate: string
  switch (range) {
    case 'day':
      startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString()
      break
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7)).toISOString()
      break
    case 'month':
      startDate = new Date(now.setDate(now.getDate() - 30)).toISOString()
      break
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString()
      break
  }

  return { startDate, endDate }
}
