import { z } from 'zod'

export const PlaceDemoOrderSchema = z
  .object({
    symbol: z.string().min(1).toUpperCase(),
    side: z.enum(['buy', 'sell']),
    orderType: z.enum(['market', 'limit']),
    quantity: z.number().positive(),
    price: z.number().positive().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.orderType === 'limit' && !data.price) return false
      return true
    },
    { message: 'Price is required for limit orders' }
  )

export const CloseDemoOrderSchema = z.object({
  tradeId: z.string().uuid(),
  exitPrice: z.number().positive(),
})

export const DemoOrdersQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
})

export type PlaceDemoOrderInput = z.infer<typeof PlaceDemoOrderSchema>
export type CloseDemoOrderInput = z.infer<typeof CloseDemoOrderSchema>
export type DemoOrdersQuery = z.infer<typeof DemoOrdersQuerySchema>
