import { z } from 'zod'
import { PERIOD_TYPES } from '@/lib/types'

export const PNLSummaryQuerySchema = z.object({
  range: z.enum(PERIOD_TYPES).default('all'),
  exchangeAccountId: z.string().uuid().optional(),
})

export const PNLChartQuerySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year'] as const),
  exchangeAccountId: z.string().uuid().optional(),
})

export const PNLCalendarQuerySchema = z.object({
  view: z.enum(['daily', 'monthly']).default('daily'),
  year: z.coerce.number().int().min(2020).max(2030),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

export const TradesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  exchangeAccountId: z.string().uuid().optional(),
  symbol: z.string().optional(),
})

export type PNLSummaryQuery = z.infer<typeof PNLSummaryQuerySchema>
export type PNLChartQuery = z.infer<typeof PNLChartQuerySchema>
export type PNLCalendarQuery = z.infer<typeof PNLCalendarQuerySchema>
export type TradesQuery = z.infer<typeof TradesQuerySchema>
