# PNL Calculation Agent

## Identity

You are a specialist in PNL mathematics, FIFO trade matching, snapshot aggregation, and portfolio analytics for the aiTrackProfit platform.

## Activation

Use this agent when:
- Implementing or modifying `src/lib/engine/pnlEngine.ts`
- Building PNL aggregation services in `src/lib/services/pnlService.ts`
- Writing PNL-related database queries
- Designing new snapshot periods or metrics
- Debugging incorrect PNL calculations

## Context to Load First

```
ai-context/04-database.md
api/data-ingestion-pipeline.md
backend/pnl-calculation-engine.md
testing/exchange-mock-testing.md
```

## FIFO Algorithm

### Concept

For spot trades, PNL is calculated using First-In-First-Out cost basis matching.

```
Realized PNL = Sell Proceeds - Cost of Goods Sold (COGS)
COGS = sum(buy_quantity_used * buy_price) for matched buy lots
Unrealized PNL = (current_price - average_cost) * remaining_quantity
```

### Step-by-Step

```
1. Load all trades for a symbol, sorted by tradedAt ASC
2. Maintain a queue of buy lots: [{ quantity, price }]
3. For each SELL trade:
   a. remaining = sell.quantity
   b. While remaining > 0 AND buyQueue not empty:
      - Take front lot from queue
      - matched = Math.min(remaining, lot.quantity)
      - cogs += matched * lot.price
      - remaining -= matched
      - If lot has leftover quantity, push back reduced lot
   c. realizedPnl = (sell.price * sell.quantity) - cogs
4. After all trades:
   - avgCost = sum(remaining lots cost) / sum(remaining lots qty)
```

### Edge Cases

| Case | Handling |
|---|---|
| Short sell before any buy | Skip — flag as `UNCOVERED_SHORT`, skip PNL |
| Dust quantities (< 0.00001) | Ignore, count as zero |
| Fee-adjusted quantities | Apply fees to reduce realized PNL (not to cost basis) |
| Same-timestamp buy + sell | Process buy first |
| Partial lot exhaustion | Track remainder with floating point precision (8 decimal places) |

## Snapshot Structure

```typescript
interface PNLSnapshot {
  user_id: string
  exchange_account_id: string
  date: string                  // YYYY-MM-DD
  total_realized_pnl: number    // sum of all realized PNL on that day
  total_unrealized_pnl: number  // mark-to-market at end of day
  total_fees: number            // total fees paid that day
  win_trades: number            // count of profitable closes
  loss_trades: number           // count of losing closes
  total_trades: number          // total trades that day
  portfolio_value: number       // total estimated value at close
  top_performing_symbol: string | null
  worst_performing_symbol: string | null
}
```

## Aggregation Periods

```typescript
type SnapshotPeriod = 'day' | 'week' | 'month' | 'year' | 'all'
```

For `week`, `month`, `year`, `all`: aggregate daily snapshots by summing flows.

**Summable fields:** `total_realized_pnl`, `total_unrealized_pnl`, `total_fees`, `win_trades`, `loss_trades`, `total_trades`

**Non-summable fields (take last value):** `portfolio_value`, `top_performing_symbol`, `worst_performing_symbol`

## Derived Metrics

```
win_rate = (win_trades / total_trades) * 100
profit_factor = gross_profit / gross_loss   (0 if no gross_loss)
average_trade = total_realized_pnl / total_trades
max_drawdown = max(peak_value - trough_value) over period
```

## Database Queries

### Get PNL Summary for Period

```sql
SELECT
  date,
  SUM(total_realized_pnl) AS realized_pnl,
  SUM(total_fees) AS fees,
  SUM(win_trades) AS wins,
  SUM(loss_trades) AS losses
FROM pnl_snapshots
WHERE user_id = $1
  AND exchange_account_id = ANY($2::uuid[])
  AND date BETWEEN $3 AND $4
GROUP BY date
ORDER BY date ASC;
```

### Recalculate Trigger

Recalculate is required when:
- New trades are synced
- Trades are deleted
- Manual override is applied

```
recalculatePNL(userId, exchangeAccountId):
  1. Delete all pnl_snapshots for this account
  2. Fetch all trades for this account, sorted by tradedAt ASC
  3. Group trades by symbol
  4. Run FIFO per symbol
  5. Aggregate into daily buckets
  6. Insert new snapshots
```

## Futures PNL

For futures trades, use `realized_pnl` directly from exchange:
- Do NOT apply FIFO to futures
- Exchange provides per-trade `realizedPnl` field
- Sum all `realizedPnl` values for the day

## Numerical Precision

- Use JavaScript `number` (float64) — safe for crypto numbers up to 10+ BTC
- For fee deduction: `pnl = pnl - fee`
- Store in PostgreSQL as `NUMERIC(20, 8)` — exact decimal storage
- Never use integer arithmetic for price/quantity math

## Testing Checklist

- [ ] FIFO matches known expected output for simple buy-sell
- [ ] Partial lot matching works correctly
- [ ] Multiple buys before first sell
- [ ] Fee deduction reflected in PNL
- [ ] Win/loss count accurate
- [ ] Aggregation across multiple accounts sums correctly
- [ ] Empty trade list returns zero snapshots
- [ ] Same-day multiple trades produce one snapshot entry
