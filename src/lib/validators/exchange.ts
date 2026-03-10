import { z } from 'zod'
import { EXCHANGES } from '@/lib/types'

export const ConnectExchangeSchema = z.object({
  exchange: z.enum(EXCHANGES),
  apiKey: z.string().min(1).trim(),
  apiSecret: z.string().min(1).trim(),
  label: z.string().min(1).max(100).optional(),
})

export const SyncExchangeSchema = z.object({
  exchangeAccountId: z.string().uuid(),
})

export const UpdateExchangeActiveSchema = z.object({
  is_active: z.boolean(),
})

export const UpdateExchangeKeysSchema = z.object({
  apiKey: z.string().min(1).trim(),
  apiSecret: z.string().min(1).trim(),
  label: z.string().max(100).nullable().optional(),
})

export type ConnectExchangeInput = z.infer<typeof ConnectExchangeSchema>
export type SyncExchangeInput = z.infer<typeof SyncExchangeSchema>
export type UpdateExchangeActiveInput = z.infer<typeof UpdateExchangeActiveSchema>
export type UpdateExchangeKeysInput = z.infer<typeof UpdateExchangeKeysSchema>
