# PNL Engine Review — aiTrackProfit

**Agent:** pnl-calculation-agent.md  
**Date:** 2026-03-07  
**Status:** BLOCKED — core FIFO algorithm not implemented; critical calculation bug in demo engine

---

## Review Summary

The PNL engine (`src/lib/engines/pnlEngine.ts`) is missing the foundational FIFO cost-basis matching algorithm for spot trades. It only sums pre-computed `realized_pnl` values from the exchange (which exist only for futures trades). Spot trading PNL — the primary use case for most users — produces zero results. Additionally, `demoService.ts` contains a confirmed arithmetic bug in the balance restoration calculation.

---

## 1. FIFO Algorithm — Not Implemented

### Specification (from `agents/pnl-calculation-agent.md`)

> For spot trades, PNL is calculated using First-In-First-Out cost basis matching.  
> `Realized PNL = Sell Proceeds - COGS`  
> `COGS = sum(buy_quantity_used * buy_price) for matched buy lots`

### Current Implementation

```typescript
// src/lib/engines/pnlEngine.ts
export function calculatePNLSummary(trades: Trade[], period: PeriodType): PNLSummary {
  const tradesWithPNL = trades.filter((t) => t.realized_pnl !== null)
  // Only trades with realized_pnl != null are counted
}
```

**Problem:** All spot trades from Binance, MEXC, Bybit, Bitget, and OKX spot endpoints  
have `realized_pnl: null` because spot exchanges do not calculate PNL per-fill.  
Only futures/perpetual trades carry an exchange-provided `realized_pnl`.

**Impact:** A user with 500 spot trades and 0 futures trades will see:
- `total_pnl: 0`
- `win_rate: 0`
- `trade_count: 500` (from `trades.length`)
- `win_count: 0`, `loss_count: 0`

This is misleading — the system shows a non-zero `trade_count` but zero PNL/win-rate,  
implying the user broke even on 500 trades.

### Required Implementation

```typescript
type BuyLot = { quantity: number; price: number }

export function calculateFIFOPNL(trades: Trade[]): Map<string, number> {
  const spotTrades = trades
    .filter((t) => t.trade_type === 'spot')
    .sort((a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime())

  const buyQueues = new Map<string, BuyLot[]>()
  const realizedPnlByTradeId = new Map<string, number>()

  for (const trade of spotTrades) {
    const symbol = trade.symbol

    if (trade.side === 'buy') {
      if (!buyQueues.has(symbol)) buyQueues.set(symbol, [])
      buyQueues.get(symbol)!.push({ quantity: trade.quantity, price: trade.price })
      continue
    }

    // SELL: match against buy queue
    const queue = buyQueues.get(symbol) ?? []
    let remaining = trade.quantity
    let cogs = 0

    if (queue.length === 0) {
      // UNCOVERED_SHORT — skip, flag as null
      continue
    }

    while (remaining > 0.00001 && queue.length > 0) {
      const lot = queue[0]
      const matched = Math.min(remaining, lot.quantity)
      cogs += matched * lot.price
      remaining -= matched
      lot.quantity -= matched
      if (lot.quantity < 0.00001) queue.shift()
    }

    const proceeds = trade.price * trade.quantity
    const fee = trade.fee ?? 0
    const pnl = proceeds - cogs - fee
    realizedPnlByTradeId.set(trade.id, parseFloat(pnl.toFixed(8)))
  }

  return realizedPnlByTradeId
}
```

`calculatePNLSummary` should call `calculateFIFOPNL` for spot trades and merge  
those results with the exchange-provided `realized_pnl` for futures trades before  
computing totals.

---

## 2. `calculatePNLSummary` — `trade_count` Mismatch

### Current Code

```typescript
return {
  total_pnl: ...,
  trade_count: trades.length,      // includes trades with realized_pnl = null
  win_count: winCount,             // only counts trades with realized_pnl != null
  loss_count: lossCount,
  ...
}
```

`trade_count = 500`, but `win_count + loss_count = 0` — numerically inconsistent.

After FIFO is implemented, this will resolve naturally since all spot sells will have a  
computed `realized_pnl`. However, uncovered shorts should be explicitly excluded from  
all four counts rather than contributing to `trade_count` only.

---

## 3. `buildPNLTimeSeries` — Date Grouping Uses Local Time

```typescript
function formatDateKey(date: Date, range): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  ...
}
```

`Date.getFullYear()`, `getMonth()`, `getDate()` use the **server's local timezone**, not UTC.  
If the server runs in UTC+0 and the user is in UTC+9, trades made at 23:00 UTC on  
2026-03-06 will appear as 2026-03-07 (next day) in their chart — incorrect date bucketing.

Fix:

```typescript
function formatDateKey(date: Date, range): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  ...
}
```

Or pass a user timezone parameter and use `Intl.DateTimeFormat` for local-time bucketing.

---

## 4. `getDateRangeForPeriod` — Mutates Shared `now` Object

```typescript
const now = new Date()
const endDate = now.toISOString()        // captured before mutation

case 'week':
  startDate = new Date(now.setDate(now.getDate() - 7)).toISOString() // mutates now
```

`now.setDate(...)` mutates `now` in-place. While `endDate` is captured before the mutation  
so this currently works, it is fragile. A future refactor that moves `endDate` after  
the switch block would silently produce wrong results.

Fix:

```typescript
const now = new Date()
const endDate = now.toISOString()

switch (range) {
  case 'week': {
    const start = new Date(now)
    start.setUTCDate(start.getUTCDate() - 7)
    startDate = start.toISOString()
    break
  }
  ...
}
```

---

## 5. `year` Period Definition

```typescript
case 'year':
  startDate = new Date(now.setFullYear(now.getFullYear() - 1)).toISOString()
```

This returns "last 365 days", not "current calendar year (YTD)".  
Users expect `year` to mean "from January 1 of this year to today" for PNL tracking.

Fix for YTD:

```typescript
case 'year': {
  const yearStart = new Date(now.getUTCFullYear(), 0, 1)
  startDate = yearStart.toISOString()
  break
}
```

---

## 6. Fee Handling in FIFO

The spec states:
> Fee-adjusted quantities: Apply fees to reduce realized PNL (not to cost basis)

Current `calculateDemoRealizedPNL` in `demoEngine.ts` correctly subtracts the exit fee:

```typescript
const exitFee = quantity * exitPrice * TAKER_FEE_RATE
return parseFloat((grossPNL - exitFee).toFixed(8))
```

However, the FIFO algorithm, once implemented, must:
1. NOT include entry fee in the buy lot price (fee is a separate cost).
2. Subtract entry fee + exit fee from realized PNL after COGS calculation.

---

## 7. Demo Engine — Critical Balance Calculation Bug

File: `src/lib/services/demoService.ts`

### The Bug

```typescript
// closeDemoOrder
const returnedAmount = trade.side === 'buy'
  ? trade.quantity * exitPrice + realizedPnl      // BUG: should be trade.entry_price
  : trade.quantity * trade.entry_price + realizedPnl
```

For a `buy` trade:  
- `realizedPnl = (exitPrice - entryPrice) * quantity - exitFee`
- `returnedAmount = quantity * exitPrice + (exitPrice - entryPrice) * quantity - exitFee`
- `= 2 * quantity * exitPrice - quantity * entryPrice - exitFee`

**Example:**  
Buy 1 BTC at $40,000. Balance deducted: $40,040 (principal + 0.1% fee).  
Close at $45,000. Expected balance return: ~$44,955.  
Actual return with bug: `1 * 45,000 + 4,955 = $49,955` — $5,000 over-credited.

**Fix:**

```typescript
const returnedAmount = trade.side === 'buy'
  ? trade.quantity * trade.entry_price + realizedPnl   // principal + profit
  : trade.quantity * trade.entry_price + realizedPnl
```

For buy: `40,000 + 4,955 = $44,955` — correct.

### Race Condition in Balance Update

`placeDemoOrder` and `closeDemoOrder` both use a read-modify-write pattern:

```typescript
const balance = await getUserDemoBalance(supabase, userId)  // read
await updateUserDemoBalance(supabase, userId, balance - cost) // write
```

Two simultaneous requests can both read the same balance and both subtract,  
resulting in a negative balance or effective double-spend.

Fix: Use a Supabase RPC with atomic update:

```sql
UPDATE users 
SET demo_balance = demo_balance - cost
WHERE id = user_id AND demo_balance >= cost
RETURNING demo_balance
```

Or use Supabase optimistic concurrency via version/updated_at checks.

---

## 8. Snapshot Integration — Not Connected

`pnlService.ts` computes results using `calculatePNLSummary` and `buildPNLTimeSeries`  
but never persists results to `pnl_snapshots`. The `pnlDb.ts` module with  
`upsertPNLSnapshot` exists but is not called.

This means:
- No historical snapshot data for charts in future periods.
- Every load recalculates from raw trades.
- The `PNLSnapshot` type (`total_pnl`, `win_count`, `loss_count`, etc.) is never populated.

---

## Critical Issues (must fix before merge)

| # | Location | Issue |
|---|---|---|
| 1 | `src/lib/engines/pnlEngine.ts` | FIFO algorithm absent — spot trade PNL always 0 |
| 2 | `src/lib/services/demoService.ts` | `closeDemoOrder` balance uses `exitPrice` instead of `entry_price` — over-credits balance |
| 3 | `src/lib/engines/pnlEngine.ts` | `trade_count` includes null-PNL trades; win/loss counts do not — inconsistent summary |
| 4 | `src/lib/engines/pnlEngine.ts` | Date grouping uses local time instead of UTC |
| 5 | `src/lib/services/demoService.ts` | Non-atomic balance read-modify-write — race condition |

## Suggestions

- Implement FIFO engine in `pnlEngine.ts` with the algorithm from `agents/pnl-calculation-agent.md`.
- Fix `year` period to use calendar YTD instead of rolling 365 days.
- Fix date bucketing to use UTC methods (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`).
- Use a copy of `now` instead of mutating in `getDateRangeForPeriod`.
- Connect `pnlService` to `pnlDb.upsertPNLSnapshot` after computing results.
- Move atomic balance update to a Supabase RPC to prevent race conditions.
