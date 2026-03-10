# Demo Trading Engine

## Overview

The demo trading engine simulates paper trading using virtual balances. All demo orders are stored in the database and settled against real-time Binance prices.

## Demo Account

Each user starts with a virtual balance defined in `users.demo_balance` (default: 10,000 USDT).

Demo balances are not real money and cannot be transferred or withdrawn.

## Order Types Supported

| Type | Behavior |
|---|---|
| Market Buy | Fills immediately at current market price |
| Market Sell | Fills immediately at current market price |
| Limit Buy | Queues at specified price, fills when market reaches it |
| Limit Sell | Queues at specified price, fills when market reaches it |

## Demo Trading Engine Logic

```typescript
// src/lib/engines/demoTradingEngine.ts

type PlaceOrderInput = {
  userId: string
  symbol: string
  side: 'buy' | 'sell'
  orderType: 'market' | 'limit'
  quantity: number
  price?: number
  currentPrice: number
}

type DemoOrderResult = {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  entryPrice: number
  status: 'open' | 'closed'
  openedAt: Date
}

export async function placeDemo Order(input: PlaceOrderInput): Promise<Result<DemoOrderResult>> {
  const { userId, symbol, side, orderType, quantity, price, currentPrice } = input

  // Validate user has sufficient virtual balance
  const userResult = await usersDb.getById(userId)
  if (!userResult.success) return { success: false, error: 'USER_NOT_FOUND' }

  const user = userResult.data
  const entryPrice = orderType === 'market' ? currentPrice : (price ?? currentPrice)
  const orderCost = side === 'buy' ? quantity * entryPrice : 0

  if (side === 'buy' && user.demoBalance < orderCost) {
    return { success: false, error: 'INSUFFICIENT_DEMO_BALANCE' }
  }

  // Deduct balance for buy orders
  if (side === 'buy') {
    await usersDb.updateDemoBalance(userId, user.demoBalance - orderCost)
  }

  const order = await demoTradesDb.create({
    userId,
    symbol,
    side,
    orderType,
    quantity,
    entryPrice,
    status: 'open'
  })

  return { success: true, data: order }
}
```

## Close Order Logic

```typescript
type CloseOrderInput = {
  userId: string
  orderId: string
  exitPrice: number
}

export async function closeDemoOrder(input: CloseOrderInput): Promise<Result<{ realizedPnl: number }>> {
  const { userId, orderId, exitPrice } = input

  const orderResult = await demoTradesDb.getById(orderId, userId)
  if (!orderResult.success) return { success: false, error: 'ORDER_NOT_FOUND' }

  const order = orderResult.data
  if (order.status !== 'open') return { success: false, error: 'ORDER_NOT_OPEN' }

  let realizedPnl: number

  if (order.side === 'buy') {
    realizedPnl = (exitPrice - order.entryPrice) * order.quantity
  } else {
    realizedPnl = (order.entryPrice - exitPrice) * order.quantity
  }

  await demoTradesDb.close(orderId, { exitPrice, realizedPnl })

  // Return funds + PNL to demo balance (for buy orders)
  if (order.side === 'buy') {
    const userResult = await usersDb.getById(userId)
    if (userResult.success) {
      const returnAmount = order.quantity * exitPrice
      await usersDb.updateDemoBalance(userId, userResult.data.demoBalance + returnAmount)
    }
  }

  return { success: true, data: { realizedPnl } }
}
```

## PNL Calculation for Demo

```
Buy side:
  PNL = (exitPrice - entryPrice) × quantity

Sell side (short):
  PNL = (entryPrice - exitPrice) × quantity

Note: No fees applied to demo trades to simplify simulation.
```

## Limit Order Management

Limit orders are stored with `status = 'open'`. A background checker evaluates if limit orders should be filled:

```typescript
export async function processLimitOrders(currentPrices: Map<string, number>): Promise<void> {
  const openLimitOrders = await demoTradesDb.getOpenLimitOrders()

  for (const order of openLimitOrders) {
    const currentPrice = currentPrices.get(order.symbol)
    if (!currentPrice) continue

    const shouldFill =
      (order.side === 'buy' && currentPrice <= order.entryPrice) ||
      (order.side === 'sell' && currentPrice >= order.entryPrice)

    if (shouldFill) {
      await demoTradesDb.updateStatus(order.id, 'open')
    }
  }
}
```

In production, limit order processing is triggered by WebSocket price updates on the client. The client calls `/api/demo/order/:id/close` when the price threshold is crossed.

## Virtual Balance Rules

- Initial balance: 10,000 USDT (set on user creation)
- Balance decreases on buy order placement
- Balance increases on sell order fill (entry × quantity) + PNL
- Balance can reach 0 but not go negative
- Users can reset demo balance via profile settings (once per 24 hours)

## API Endpoint Handlers

### POST /api/demo/order

```typescript
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await req.json()
  const parsed = PlaceDemoOrderSchema.safeParse(body)
  if (!parsed.success) return validationError()

  const { symbol, side, orderType, quantity, price } = parsed.data

  // Fetch current price from Binance public API (no auth needed)
  const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol.toUpperCase()}`)
  const { price: currentPriceStr } = await priceResponse.json() as { price: string }
  const currentPrice = parseFloat(currentPriceStr)

  const result = await demoTradingEngine.placeDemoOrder({
    userId: user.id, symbol, side, orderType, quantity, price, currentPrice
  })

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
```
