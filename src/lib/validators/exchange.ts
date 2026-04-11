import { z } from 'zod'
import { EXCHANGES } from '@/lib/types'

export const ConnectExchangeSchema = z.object({
  exchange: z.enum(EXCHANGES),
  apiKey: z.string().trim().min(10).max(512).refine((value) => !/\s/.test(value), {
    message: 'API_KEY_INVALID',
  }),
  apiSecret: z.string().trim().min(10).max(512).refine((value) => !/\s/.test(value), {
    message: 'API_SECRET_INVALID',
  }),
  passphrase: z.string().trim().min(1).max(100).optional(),
  proxy: z.string().trim().min(3).max(1024).refine((value) => !/\s/.test(value), {
    message: 'PROXY_INVALID',
  }).optional(),
  label: z.string().trim().min(1).max(50).optional(),
}).superRefine((data, ctx) => {
  if ((data.exchange === 'okx' || data.exchange === 'bitget') && !data.passphrase) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PASSPHRASE_REQUIRED',
      path: ['passphrase'],
    })
  }
})

export const SyncExchangeSchema = z.object({
  exchangeAccountId: z.string().uuid(),
})

export const UpdateExchangeActiveSchema = z.object({
  is_active: z.boolean(),
})

export const UpdateExchangeKeysSchema = z.object({
  apiKey: z.string().trim().min(10).max(512).refine((value) => !/\s/.test(value), {
    message: 'API_KEY_INVALID',
  }),
  apiSecret: z.string().trim().min(10).max(512).refine((value) => !/\s/.test(value), {
    message: 'API_SECRET_INVALID',
  }),
  passphrase: z.string().trim().min(1).max(100).optional(),
  proxy: z.string().trim().min(3).max(1024).refine((value) => !/\s/.test(value), {
    message: 'PROXY_INVALID',
  }).optional(),
  label: z.string().max(50).nullable().optional(),
})

export type ConnectExchangeInput = z.infer<typeof ConnectExchangeSchema>
export type SyncExchangeInput = z.infer<typeof SyncExchangeSchema>
export type UpdateExchangeActiveInput = z.infer<typeof UpdateExchangeActiveSchema>
export type UpdateExchangeKeysInput = z.infer<typeof UpdateExchangeKeysSchema>
