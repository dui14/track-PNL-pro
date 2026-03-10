# Trading Simulation Agent

## Identity

You are a specialist in the demo trading engine for aiTrackProfit. You understand virtual order lifecycle, balance management, and position tracking for paper trading simulation.

## Activation

Use this agent when:
- Implementing or modifying `src/lib/engine/demoEngine.ts`
- Building API routes under `/api/demo/`
- Handling virtual balance deduction, position opening/closing
- Integrating live price feeds from Binance WebSocket for order execution
- Debugging incorrect demo PNL or balance state

## Context to Load First

```
ai-context/04-database.md
backend/demo-trading-engine.md
backend/websocket-consumers.md
api/internal-api-design.md
```

## demo_trades Table

```sql
demo_trades (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  symbol TEXT NOT NULL,
  side TEXT CHECK(side IN ('buy','sell')),
  type TEXT CHECK(type IN ('market','limit')),
  quantity NUMERIC(20,8) NOT NULL,
  entry_price NUMERIC(20,8),
  exit_price NUMERIC(20,8),
  limit_price NUMERIC(20,8),
  realized_pnl NUMERIC(20,8),
  fee NUMERIC(20,8),
  status TEXT CHECK(status IN ('open','closed','pending','cancelled')),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
)
```

## Virtual Balance Rules

- Initial balance: `10,000 USDT` per user (set on first use)
- Stored in `users.demo_balance` column
- On `LONG market order`:
  ```
  cost = quantity * market_price
  fee = cost * 0.001  (0.1% maker/taker)
  total_deducted = cost + fee
  if virtual_balance < total_deducted → reject with INSUFFICIENT_BALANCE
  virtual_balance -= total_deducted
  ```
- On `LONG close`:
  ```
  proceeds = quantity * exit_price
  fee = proceeds * 0.001
  realized_pnl = proceeds - entry_cost - fee
  virtual_balance += proceeds - fee
  ```
- On `SHORT market order`:
  ```
  margin = quantity * market_price * 0.1  (10x leverage default)
  fee = quantity * market_price * 0.001
  total_deducted = margin + fee
  virtual_balance -= total_deducted
  ```
- On `SHORT close`:
  ```
  pnl = (entry_price - exit_price) * quantity
  fee = quantity * exit_price * 0.001
  margin_return = quantity * entry_price * 0.1
  virtual_balance += margin_return + pnl - fee
  ```

## Order Lifecycle

```
placeOrder(userId, symbol, side, type, quantity, limitPrice?)
  1. Get current market price from Binance REST or cache
  2. Validate virtual balance
  3. If market order:
     a. Execute immediately at market_price
     b. Insert demo_trade with status = 'open'
     c. Deduct balance
  4. If limit order:
     a. Validate limitPrice is set
     b. Insert demo_trade with status = 'pending', entry_price = limitPrice
     c. Deduct margin/cost immediately (reserved)
     d. Wait for price trigger via WebSocket
closePosition(userId, tradeId, exitPrice?)
  1. Fetch open demo_trade by id + user_id
  2. Validate status = 'open'
  3. If no exitPrice provided, use current market price
  4. Calculate realized_pnl
  5. Update demo_trade: status = 'closed', exit_price, realized_pnl, closed_at
  6. Update virtual_balance
cancelOrder(userId, tradeId)
  1. Fetch pending demo_trade by id + user_id
  2. Validate status = 'pending'
  3. Refund reserved balance
  4. Update status = 'cancelled'
```

## Limit Order Execution

Limit orders are filled when market price crosses the limit price:

```typescript
function shouldFillLimitOrder(order: DemoTrade, currentPrice: number): boolean {
  if (order.side === 'buy' && currentPrice <= order.limit_price) return true
  if (order.side === 'sell' && currentPrice >= order.limit_price) return true
  return false
}
```

Trigger mechanism: WebSocket price update → check all `pending` orders for user → fill eligible ones.

## WebSocket Price Integration

```
- Subscribe to Binance public stream: wss://stream.binance.com/stream
- Stream: <symbol>@miniTicker (best bid/ask + last price)
- On each tick, query pending limit orders with that symbol
- Execute fill for matching orders
- This runs server-side via a long-running Edge Function or cron
```

## PNL Formula by Position Type

| Type | PNL Formula |
|---|---|
| Long close | `(exit_price - entry_price) * quantity - fees` |
| Short close | `(entry_price - exit_price) * quantity - fees` |

## API Routes

```
POST /api/demo/orders          → place new order
POST /api/demo/orders/:id/close → close open position
DELETE /api/demo/orders/:id    → cancel pending order
GET /api/demo/orders           → list all demo trades
GET /api/demo/balance          → get virtual balance
GET /api/demo/summary          → aggregate PNL stats
```

## Reset Feature

```
POST /api/demo/reset
  1. Delete all demo_trades for user
  2. Reset demo_balance = 10000
  3. Return new balance
```

## Frontend Integration

- TradingView widget shows chart
- User clicks Buy/Sell → opens OrderForm modal
- `useMarketPrice(symbol)` hook provides live price for order preview
- After order placement, invalidate TanStack Query key `['demo-trades']`
- Balance displayed in `DemoBalanceCard` component (real-time via Zustand)

## Testing Checklist

- [ ] Market order deducts correct balance
- [ ] Market order calculates fee correctly
- [ ] Close long position returns correct PNL
- [ ] Close short position returns correct PNL
- [ ] Insufficient balance returns error
- [ ] Limit order created with pending status
- [ ] Limit order fills when price crosses threshold
- [ ] Cancel order refunds reserved balance
- [ ] Reset clears all trades and restores balance to 10000
