import { z } from 'zod'

const SupportedDebugExchangeSchema = z.enum(['binance', 'okx', 'bybit', 'bitget', 'gateio'])

export const ExchangeDebugVerifySchema = z.object({
  exchange: SupportedDebugExchangeSchema,
  baseUrl: z.string().trim().url().optional(),
  apiKey: z.string().trim().min(6).max(512),
  apiSecret: z.string().trim().min(6).max(512),
  passphrase: z.string().trim().min(1).max(100).optional(),
  recvWindow: z.number().int().min(1000).max(60000).optional(),
  ccy: z.string().trim().min(1).max(20).optional(),
  accountType: z.string().trim().min(1).max(20).optional(),
  productType: z.string().trim().min(1).max(20).optional(),
})

export type ExchangeDebugVerifyInput = z.infer<typeof ExchangeDebugVerifySchema>
