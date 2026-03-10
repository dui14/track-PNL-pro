import type { SupabaseClient } from '@supabase/supabase-js'
import type { PNLSummary, PNLChartPoint, PNLCalendarDay, PNLCalendarMonth, Trade, PeriodType, Result } from '@/lib/types'
import { getTradesForPNL, getTrades } from '@/lib/db/tradesDb'
import { calculatePNLSummary, buildPNLTimeSeries, buildPNLCalendarDays, buildPNLCalendarMonths, getDateRangeForPeriod } from '@/lib/engines/pnlEngine'

type GetTradesOptions = {
  page: number
  limit: number
  exchangeAccountId?: string
  symbol?: string
}

type TradesResult = {
  trades: Trade[]
  total: number
}

export async function fetchPNLSummary(
  supabase: SupabaseClient,
  userId: string,
  range: PeriodType,
  exchangeAccountId?: string
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
  })

  const summary = calculatePNLSummary(trades, range)
  return { success: true, data: summary }
}

export async function fetchPNLChart(
  supabase: SupabaseClient,
  userId: string,
  range: 'day' | 'week' | 'month' | 'year',
  exchangeAccountId?: string
): Promise<Result<PNLChartPoint[]>> {
  const { startDate, endDate } = getDateRangeForPeriod(range)

  const trades = await getTradesForPNL(supabase, userId, {
    startDate,
    endDate,
    exchangeAccountId,
  })

  const chartData = buildPNLTimeSeries(trades, range)
  return { success: true, data: chartData }
}

export async function fetchPaginatedTrades(
  supabase: SupabaseClient,
  userId: string,
  options: GetTradesOptions
): Promise<Result<TradesResult>> {
  const { trades, total } = await getTrades(supabase, userId, options)
  return { success: true, data: { trades, total } }
}

export async function fetchPNLCalendar(
  supabase: SupabaseClient,
  userId: string,
  view: 'daily' | 'monthly',
  year: number,
  month?: number
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

  const trades = await getTradesForPNL(supabase, userId, { startDate, endDate })

  if (view === 'daily' && month) {
    return { success: true, data: buildPNLCalendarDays(trades, year, month) }
  }
  return { success: true, data: buildPNLCalendarMonths(trades, year) }
}
