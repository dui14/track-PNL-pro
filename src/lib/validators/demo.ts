import { z } from 'zod'

export const PlaceDemoOrderSchema = z
  .object({
    symbol: z.string().min(1).toUpperCase(),
    side: z.enum(['buy', 'sell']),
    orderType: z.enum(['market', 'limit']),
    quantity: z.number().positive().nullable().optional(),
    price: z.number().positive().nullable().optional(),
    marketPrice: z.number().positive().nullable().optional(),
    leverage: z.number().int().min(1).max(125),
    marginMode: z.enum(['cross', 'isolated']),
    initialMargin: z.number().positive(),
    takeProfit: z.number().positive().nullable().optional(),
    stopLoss: z.number().positive().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.orderType === 'limit' && !data.price) return false
      if (data.orderType === 'market' && !data.marketPrice) return false
      return true
    },
    { message: 'Invalid order payload' }
  )

export const CloseDemoOrderSchema = z.object({
  tradeId: z.string().uuid(),
  exitPrice: z.number().positive(),
  closeQuantity: z.number().positive().optional(),
})

export const DemoOrdersQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
})

export type PlaceDemoOrderInput = z.infer<typeof PlaceDemoOrderSchema>
export type CloseDemoOrderInput = z.infer<typeof CloseDemoOrderSchema>
export type DemoOrdersQuery = z.infer<typeof DemoOrdersQuerySchema>
