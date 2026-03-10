# Fixes & Improvements — aiTrackProfit

**Generated:** 2026-03-07  
**Sources:** reviewer.md · security.md · pnl-calculation-agent.md · exchange-integration-agent.md

---

## CRITICAL — Must Fix Before Production

These issues will cause incorrect behavior, security vulnerabilities, or data loss in production.

---

### FIX-01 — Implement FIFO spot PNL algorithm

**File:** `src/lib/engines/pnlEngine.ts`  
**Report:** [pnl-engine-review.md](pnl-engine-review.md)

Spot trades have `realized_pnl = null` from all exchange adapters. The engine only sums  
non-null `realized_pnl` values, so spot PNL is always zero for pure spot traders.

**Action:** Implement FIFO cost-basis matching per the algorithm in `agents/pnl-calculation-agent.md`.  
Merge FIFO-computed PNL for spot trades with exchange-provided PNL for futures trades  
before computing the summary.

---

### FIX-02 — Fix demo trade close balance calculation

**File:** `src/lib/services/demoService.ts`  
**Report:** [pnl-engine-review.md](pnl-engine-review.md)

```typescript
// WRONG — uses exitPrice, over-credits by ~(exitPrice - entryPrice) * quantity
const returnedAmount = trade.side === 'buy'
  ? trade.quantity * exitPrice + realizedPnl
  : trade.quantity * trade.entry_price + realizedPnl

// CORRECT
const returnedAmount = trade.quantity * trade.entry_price + realizedPnl
```

Both sides should use `trade.entry_price + realizedPnl` (principal + profit/loss).

---

### FIX-03 — Add passphrase field to OKX and Bitget adapters

**Files:** `src/lib/adapters/okxAdapter.ts`, `src/lib/adapters/bitgetAdapter.ts`,  
`src/lib/validators/exchange.ts`, `src/app/api/exchange/connect/route.ts`  
**Report:** [security.md](security.md)

Empty string passphrases cause authentication failures with real OKX/Bitget API keys.

**Actions:**
1. Add `passphrase?: string` to `ConnectExchangeSchema` with conditional requirement for OKX and Bitget.
2. Pass `passphrase` through `connectExchange()` → service → adapter.
3. Update `buildHeaders` in both adapters to accept and include the passphrase.
4. Update the `ExchangeAdapter` interface if needed, or add passphrase handling as adapter-specific.

---

### FIX-04 — Fix Bybit HMAC signature

**File:** `src/lib/adapters/bybitAdapter.ts`  
**Report:** exchange-integration-agent.md

Bybit v5 API signature spec: `timestamp + apiKey + recvWindow + queryString`  
Current implementation: `timestamp + queryString` — missing `apiKey` and `recvWindow`.

```typescript
// WRONG
function sign(params: string, secret: string, timestamp: number): string {
  const message = `${timestamp}${params}`
  return createHmac('sha256', secret).update(message).digest('hex')
}

// CORRECT
function sign(params: string, secret: string, timestamp: number, apiKey: string, recvWindow: number): string {
  const message = `${timestamp}${apiKey}${recvWindow}${params}`
  return createHmac('sha256', secret).update(message).digest('hex')
}
```

Update `buildHeaders` to pass `apiKey` and `RECV_WINDOW` to the sign function.

---

### FIX-05 — Fix Binance spot trades endpoint (missing required `symbol` parameter)

**File:** `src/lib/adapters/binanceAdapter.ts`  
**Report:** [performance.md](performance.md)

`/api/v3/myTrades` requires a `symbol` parameter per Binance API docs.  
Without it, the endpoint returns 400 and `fetchSpotTrades` silently returns `[]` for all users.

**Action:** Binance requires fetching per-symbol. Implement symbol-by-symbol pagination:  
1. Fetch account information to get a list of non-zero assets.
2. Iterate over active trading pairs and fetch trades per symbol.
3. Or document this as a known limitation and use `/api/v3/allOrders` instead.

---

### FIX-06 — Remove dead `prevCount` DB query in `syncExchangeAccount`

**File:** `src/lib/services/exchangeService.ts`  
**Report:** [architecture.md](architecture.md), [performance.md](performance.md)

```typescript
// DELETE this line — prevCount is never used
const prevCount = await getTradeCount(serviceSupabase, exchangeAccountId)
```

The `new_trades` value in `SyncResult` already comes from `upsertTrades()`.  
This wastes one DB round trip on every sync.

---

### FIX-07 — Fix date bucketing to use UTC in PNL engine

**File:** `src/lib/engines/pnlEngine.ts`  
**Report:** [pnl-engine-review.md](pnl-engine-review.md)

```typescript
// WRONG — server local time
const year = date.getFullYear()
const month = String(date.getMonth() + 1).padStart(2, '0')
const day = String(date.getDate()).padStart(2, '0')

// CORRECT — UTC
const year = date.getUTCFullYear()
const month = String(date.getUTCMonth() + 1).padStart(2, '0')
const day = String(date.getUTCDate()).padStart(2, '0')
```

Also update `getWeekStart` to use UTC day.

---

### FIX-08 — Fix dynamic imports in service files

**Files:** `src/lib/services/exchangeService.ts`, `src/lib/services/profileService.ts`  
**Report:** [architecture.md](architecture.md)

Replace dynamic inline imports with top-level static imports:

```typescript
// REMOVE from function bodies
const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()

// ADD at top of file
import { createSupabaseServiceClient } from '@/lib/db/supabase-server'
```

Remove the second redundant client creation in `profileService.uploadAvatar`:  
reuse `serviceClient` instead of creating `userClient`.

---

### FIX-09 — Replace `select('*')` in `getTradesForPNL`

**File:** `src/lib/db/tradesDb.ts`  
**Report:** [performance.md](performance.md)

```typescript
// WRONG — loads raw_data (large JSON) for every trade
let query = supabase.from('trades').select('*')

// CORRECT
let query = supabase
  .from('trades')
  .select('id, symbol, side, quantity, price, fee, realized_pnl, trade_type, traded_at')
```

---

### FIX-10 — Fix `getDateRangeForPeriod` mutation of `now`

**File:** `src/lib/engines/pnlEngine.ts`  
**Report:** [pnl-engine-review.md](pnl-engine-review.md)

```typescript
// WRONG — mutates now in each branch
const now = new Date()
const endDate = now.toISOString()
startDate = new Date(now.setDate(now.getDate() - 7)).toISOString()

// CORRECT — clone now before mutation
const now = new Date()
const endDate = now.toISOString()
const start = new Date(now)
start.setUTCDate(start.getUTCDate() - 7)
startDate = start.toISOString()
```

---

## HIGH — Should Fix Before First Release

---

### IMP-01 — Build real data fetching on the dashboard page

**File:** `src/app/(app)/dashboard/page.tsx`  
**Report:** [architecture.md](architecture.md)

The dashboard renders 100% hardcoded mock values. Replace with actual server-side data fetching:

```typescript
export default async function DashboardPage(): Promise<React.JSX.Element> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [summary, chartData, trades] = await Promise.all([
    fetchPNLSummary(supabase, user.id, 'month'),
    fetchPNLChart(supabase, user.id, 'month'),
    fetchPaginatedTrades(supabase, user.id, { page: 1, limit: 10 }),
  ])

  return <DashboardView summary={summary.data} chartData={chartData.data} trades={trades.data} />
}
```

---

### IMP-02 — Add server-side rate limiting

**Files:** `src/app/api/exchange/sync/route.ts`, `src/app/api/ai/chat/route.ts`, `src/app/api/exchange/connect/route.ts`  
**Report:** [security.md](security.md)

Implement Redis-based rate limiting (Upstash or Vercel KV).  
Required limits per `agents/security.md`:

| Route | Limit |
|---|---|
| `POST /api/exchange/sync` | 1 per exchange per 5 min |
| `POST /api/ai/chat` | 20 per hour |
| `POST /api/exchange/connect` | 10 per hour |

---

### IMP-03 — Add pagination to exchange adapters

**Files:** All adapter files  
**Report:** [performance.md](performance.md)

Bybit, OKX, Bitget, and MEXC only fetch the first page of results.  
Users with more trades than the per-page limit will silently get incomplete syncs.

Implement cursor-based pagination loops in `fetchTrades()` for each adapter:
- Bybit: `cursor` pagination in v5 API
- OKX: `before`/`after` pagination
- Bitget: `idLessThan` cursor
- Binance: `fromId` pagination

---

### IMP-04 — Add 5xx retry logic to adapters

**Files:** All adapter files  
**Report:** [performance.md](performance.md)

```typescript
// CURRENT
if (response.status === 429 && attempt < 4) { ... }

// ADD
if ((response.status === 429 || response.status >= 500) && attempt < 3) { ... }
```

---

### IMP-05 — Connect PNL snapshot caching

**File:** `src/lib/services/pnlService.ts`  
**Report:** [performance.md](performance.md), [pnl-engine-review.md](pnl-engine-review.md)

After computing `calculatePNLSummary`, persist the result to `pnl_snapshots` via  
`pnlDb.upsertPNLSnapshot()`. Read from snapshot first and skip re-computation if  
the snapshot is fresher than the TTL (5 min for `day`, 1 hour for `month`/`year`).

---

### IMP-06 — Fix AI conversation history size

**File:** `src/lib/services/aiService.ts`  
**Report:** [performance.md](performance.md)

```typescript
// Limit to last 20 messages to prevent unbounded token usage
const recentHistory = history.slice(-20)
const messages = [systemPrompt, ...recentHistory.filter(m => m.role !== 'system').map(...)]
```

---

### IMP-07 — Add `loading.tsx` and `error.tsx` to all routes

**Files:** `src/app/(app)/dashboard/`, `src/app/(app)/exchange/`, etc.  
**Report:** [architecture.md](architecture.md)

Required for proper Next.js App Router async streaming and error boundaries.

---

### IMP-08 — Atomize demo balance updates

**File:** `src/lib/services/demoService.ts`  
**Report:** [pnl-engine-review.md](pnl-engine-review.md)

Create a Supabase RPC function to atomically deduct/credit balance:

```sql
CREATE OR REPLACE FUNCTION deduct_demo_balance(p_user_id uuid, p_amount numeric)
RETURNS numeric LANGUAGE plpgsql AS $$
DECLARE v_balance numeric;
BEGIN
  UPDATE users SET demo_balance = demo_balance - p_amount
  WHERE id = p_user_id AND demo_balance >= p_amount
  RETURNING demo_balance INTO v_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  RETURN v_balance;
END;
$$;
```

---

## MEDIUM — Code Quality & Hardening

---

### IMP-09 — Fix `year` period to use YTD

**File:** `src/lib/engines/pnlEngine.ts`

Change `year` from "last 365 days" to "January 1 of current year to today".

---

### IMP-10 — Add security headers to `next.config.ts`

**File:** `src/next.config.ts`  
**Report:** [security.md](security.md)

Add CSP, X-Frame-Options, X-Content-Type-Options, HSTS, and Referrer-Policy headers.

---

### IMP-11 — Add API key format validation per exchange

**File:** `src/lib/validators/exchange.ts`  
**Report:** [security.md](security.md)

Add per-exchange length and character class validation to prevent garbage credentials  
from reaching exchange API key validation endpoints.

---

### IMP-12 — Eliminate N+1 query in `getConversationMessages`

**File:** `src/lib/db/chatDb.ts`  
**Report:** [performance.md](performance.md)

Remove the inner `getConversationById` call. Ownership is already enforced by RLS.  
The caller (`aiService`) has already verified ownership before calling this function.

---

### IMP-13 — Fix OKX symbol normalization

**File:** `src/lib/adapters/okxAdapter.ts`

```typescript
// WRONG — only removes first dash
symbol: t.instId.replace('-', '')  // BTC-USDT-SWAP → BTCUSDT-SWAP

// CORRECT — remove all dashes
symbol: t.instId.split('-').slice(0, 2).join('')  // BTC-USDT → BTCUSDT
```

---

### IMP-14 — Add `symbol` field max length to trade query validator

**File:** `src/lib/validators/pnl.ts`  
**Report:** [security.md](security.md)

```typescript
symbol: z.string().max(20).optional()
```

---

### IMP-15 — Add `/api/pnl/summary` error status mapping

**File:** `src/app/api/pnl/summary/route.ts`

```typescript
// CURRENT — all service errors return 500
return NextResponse.json(..., { status: 500 })

// BETTER — add status map
const statusMap: Record<string, number> = { NOT_FOUND: 404, UNAUTHORIZED: 401 }
return NextResponse.json(..., { status: statusMap[result.error] ?? 500 })
```

---

## Summary Table

| ID | Severity | Category | File |
|---|---|---|---|
| FIX-01 | CRITICAL | PNL | `pnlEngine.ts` |
| FIX-02 | CRITICAL | Demo | `demoService.ts` |
| FIX-03 | CRITICAL | Security | `okxAdapter.ts`, `bitgetAdapter.ts`, `validators/exchange.ts` |
| FIX-04 | CRITICAL | Exchange | `bybitAdapter.ts` |
| FIX-05 | CRITICAL | Exchange | `binanceAdapter.ts` |
| FIX-06 | HIGH | Performance | `exchangeService.ts` |
| FIX-07 | HIGH | PNL | `pnlEngine.ts` |
| FIX-08 | HIGH | Architecture | `exchangeService.ts`, `profileService.ts` |
| FIX-09 | HIGH | Performance | `tradesDb.ts` |
| FIX-10 | HIGH | PNL | `pnlEngine.ts` |
| IMP-01 | HIGH | Dashboard | `dashboard/page.tsx` |
| IMP-02 | HIGH | Security | API routes |
| IMP-03 | HIGH | Exchange | All adapters |
| IMP-04 | HIGH | Exchange | All adapters |
| IMP-05 | HIGH | Performance | `pnlService.ts` |
| IMP-06 | HIGH | Performance | `aiService.ts` |
| IMP-07 | HIGH | Frontend | `(app)/**/loading.tsx` |
| IMP-08 | HIGH | Demo | `demoService.ts` |
| IMP-09 | MEDIUM | PNL | `pnlEngine.ts` |
| IMP-10 | MEDIUM | Security | `next.config.ts` |
| IMP-11 | MEDIUM | Security | `validators/exchange.ts` |
| IMP-12 | MEDIUM | Performance | `chatDb.ts` |
| IMP-13 | MEDIUM | Exchange | `okxAdapter.ts` |
| IMP-14 | MEDIUM | Security | `validators/pnl.ts` |
| IMP-15 | MEDIUM | API | `pnl/summary/route.ts` |
