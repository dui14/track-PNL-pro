# Performance Review — aiTrackProfit

**Agent:** reviewer.md  
**Date:** 2026-03-07

---

## Review Summary

The biggest performance risks are: unbounded trade fetches in PNL calculations, no snapshot caching layer, an unlimited AI chat history sent to LLM on every message, and static mock data on the dashboard hiding a real data fetch architecture that hasn't been built yet. Exchange adapter pagination is incomplete on several connectors.

---

## 1. Frontend Performance

### Positive Observations
- App Router default is Server Components — avoids unnecessary client-side hydration.
- Tailwind CSS is production-purged — no dead CSS shipped.
- No identified uses of `useEffect` for server data.

### Issues

**Dashboard Page — no real data fetching**

All four `StatCard` values, `PNLChart`, `AssetDistribution`, and `RecentTradesTable` are  
rendered with hardcoded strings. When real data fetching is added, the dashboard will trigger  
multiple sequential server calls unless properly parallelized with `Promise.all`.

Recommended pattern when implementing real data fetching:

```typescript
// src/app/(app)/dashboard/page.tsx
const [summary, chartData, trades] = await Promise.all([
  fetchPNLSummary(supabase, user.id, 'month'),
  fetchPNLChart(supabase, user.id, 'month'),
  fetchPaginatedTrades(supabase, user.id, { page: 1, limit: 10 }),
])
```

**No `Suspense` boundaries or `loading.tsx` files**

Without async boundaries, the entire page blocks until data is ready.  
Granular Suspense would allow the stats to load independently of the chart.

**AI chat — full conversation history sent to LLM on every message**

File: `src/lib/services/aiService.ts`

```typescript
const history = await getConversationMessages(supabase, conversation.id, userId)
const messages = [systemPrompt, ...history]
```

For a long conversation (100+ messages), the full history is sent to OpenAI on every request.  
This has two impacts:
1. **Latency** — large payloads increase request time.
2. **Cost** — tokens grow unboundedly; no context window management.

Fix: limit history to the last N messages (e.g., last 20):

```typescript
const history = await getConversationMessages(supabase, conversation.id, userId)
const recentHistory = history.slice(-20)
```

For long-term context, implement a summarization strategy.

---

## 2. Backend / API Performance

### Issues

**`getTradesForPNL` — unbounded full table scan with `select('*')`**

File: `src/lib/db/tradesDb.ts`

```typescript
let query = supabase.from('trades').select('*').eq('user_id', userId)
```

For a user with 10,000+ trades and the `all` period range, this fetches the entire trade  
history including `raw_data` (full raw exchange JSON per trade). This is the dominant  
performance bottleneck in the application.

Issues:
- `raw_data` can be hundreds of kilobytes per trade.
- No index hint for `(user_id, traded_at)` is visible; depends on Supabase query planner.
- No pagination — all trades loaded into server memory.

Fix:
```typescript
// Select only PNL-relevant columns
let query = supabase
  .from('trades')
  .select('id, symbol, side, quantity, price, fee, realized_pnl, trade_type, traded_at')
  .eq('user_id', userId)
```

Also ensure a composite index exists: `(user_id, traded_at)` and `(user_id, exchange_account_id, traded_at)`.

**`pnl_snapshots` table is never written — every PNL request re-computes from raw trades**

`pnlDb.ts` provides `upsertPNLSnapshot` but `pnlService.ts` never calls it.  
Every call to `GET /api/pnl/summary` or `GET /api/pnl/chart` triggers a full trade scan  
and engine computation. Snapshot caching was designed to avoid this.

Recommended fix: after computing in `fetchPNLSummary`, persist to `pnl_snapshots`.  
Subsequent calls can read from the snapshot if it was calculated within a TTL (e.g., 5 min for `day`, 1 hour for `month`).

**N+1 pattern in `getConversationMessages`**

File: `src/lib/db/chatDb.ts`

```typescript
export async function getConversationMessages(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<ChatMessage[]> {
  const conversation = await getConversationById(supabase, conversationId, userId) // query 1
  if (!conversation) return []
  const { data } = await supabase.from('chat_messages')... // query 2
}
```

`getConversationMessages` calls `getConversationById` before fetching messages — two round  
trips when one would suffice. The ownership check should be done via a join or via RLS  
rather than a preflight select. In `aiService.ts`, `getConversationMessages` is called after  
`getConversationById` has already been called — tripling the queries to 3 for a single chat turn.

---

## 3. Exchange Adapter Performance

### Issues

**No pagination on Bybit, OKX, Bitget, MEXC connectors**

| Adapter | Limit | Pagination |
|---|---|---|
| Binance spot | 1000 per request | No — single fetch |
| Binance futures | 1000 per request | No — single fetch |
| Bybit | 200 per request | No — single fetch |
| OKX | 100 per request | No — single fetch |
| Bitget | 100 per request | No — single fetch |
| MEXC | 1000 per request | No — single fetch |

A user with more than 200 Bybit trades or 100 OKX/Bitget trades will silently receive  
an incomplete sync. There is no error or warning.

Bybit supports cursor-based pagination via `cursor` parameter.  
OKX supports `before`/`after` parameters.  
Bitget supports `idLessThan` cursor.

**Retry logic is limited to HTTP 429 only**

All adapters implement `fetchWithRetry` that retries on status 429.  
No retry on 500, 502, 503 (transient server errors) — per-agent spec requires retry up to 3 times on 5xx.

```typescript
// Current
if (response.status === 429 && attempt < 4) { ... }

// Should also handle
if ((response.status === 429 || response.status >= 500) && attempt < 3) { ... }
```

**`syncExchangeAccount` makes a redundant DB query**

File: `src/lib/services/exchangeService.ts`

```typescript
const prevCount = await getTradeCount(serviceSupabase, exchangeAccountId)
// prevCount used nowhere after this line
```

This fires on every sync and wastes one DB round trip. Remove it.

---

## 4. Database Query Efficiency

| Query | Current | Recommendation |
|---|---|---|
| `getTradesForPNL` | `select('*')` — includes raw_data | Select only needed columns |
| `getTradesForPNL` (all period) | No date filter, full scan | Add date filter or paginated aggregation |
| `getConversationMessages` | Two queries (ownership + fetch) | Single query with RLS enforcement |
| PNL summary | Recomputed on every request | Cache in `pnl_snapshots` with TTL |

---

## 5. Memory Usage

**Floating point accumulation in `buildPNLTimeSeries`**

```typescript
cumulative += pnl
```

Floating point addition without rounding accumulates error over many trades.  
Final values are only rounded at output (`parseFloat(cumulative.toFixed(8))`),  
but intermediate accumulations carry rounding imprecision.

Use integer arithmetic (multiply by 1e8, sum as integers, divide at end) or  
a compensated summation (Kahan summation) for financial precision.

---

## Critical Issues (must fix before merge)

| # | Location | Issue |
|---|---|---|
| 1 | `src/lib/db/tradesDb.ts` | `select('*')` in `getTradesForPNL` fetches raw_data — memory risk |
| 2 | `src/lib/services/pnlService.ts` | No snapshot caching — full trade scan on every request |
| 3 | `src/lib/services/aiService.ts` | Unbounded conversation history sent to LLM |
| 4 | `src/lib/db/chatDb.ts` | N+1 queries in `getConversationMessages` |
| 5 | All exchange adapters | No pagination — incomplete syncs silently for large accounts |

## Suggestions

- Add `(user_id, traded_at)` and `(user_id, exchange_account_id, traded_at)` indexes to `trades` table.
- Implement snapshot write in `pnlService.fetchPNLSummary` with TTL-based invalidation.
- Limit AI chat history to last 20 messages with a summarization fallback.
- Add pagination to Bybit, OKX, Bitget, MEXC adapters.
- Remove the redundant `prevCount` DB query from `syncExchangeAccount`.
- Inline the ownership check in `getConversationMessages` to eliminate the extra query.
- Use `Promise.all` for parallel data fetching on the dashboard page.
