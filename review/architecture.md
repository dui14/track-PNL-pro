# Architecture Review — aiTrackProfit

**Agent:** reviewer.md  
**Date:** 2026-03-07  
**Status:** NEEDS CHANGES

---

## Review Summary

Codebase follows the four-layer architecture (Presentation / Application / Domain / Infrastructure) with good separation of concerns overall. However, critical gaps exist in the Presentation layer (no real data fetching on the dashboard), dead code in the service layer, and some layer boundary violations.

---

## 1. Next.js Structure

### Positive Observations
- Route grouping `(app)/` and `(auth)/` correctly separates authenticated and public routes.
- Middleware at `src/middleware.ts` covers all protected routes and API paths.
- API routes follow the standard convention: auth check → Zod validation → service call → `ApiResponse<T>` envelope.
- `createSupabaseServerClient` and `createSupabaseServiceClient` correctly isolated in `lib/db/supabase-server.ts`.

### Issues

**CRITICAL — Dashboard page uses 100% hardcoded mock data**

File: `src/app/(app)/dashboard/page.tsx`

The dashboard `DashboardPage` is a Server Component but does not call any API or server action.  
All values (`$142,580.42`, `72.4%`, etc.) are hardcoded strings passed directly to `StatCard`.  
`PNLChart`, `AssetDistribution`, and `RecentTradesTable` are rendered without any real data.

```tsx
// CURRENT (broken)
<StatCard title="Total Portfolio Value" value="$142,580.42" ... />
<PNLChart />

// EXPECTED
const summary = await fetchPNLSummary(supabase, user.id, 'all')
<StatCard title="Total Portfolio Value" value={formatCurrency(summary.total_pnl)} ... />
<PNLChart userId={user.id} />
```

**Missing `loading.tsx` and `error.tsx` per route**

No async boundaries are defined. Any slow data fetch will block the page without a loading UI.  
No `error.tsx` files means unhandled errors will surface as a generic Next.js 500 page.

Required files:
- `src/app/(app)/dashboard/loading.tsx`
- `src/app/(app)/dashboard/error.tsx`
- (same pattern for exchange, demo-trading, ai-assistant, profile)

---

## 2. Component Architecture

### Positive Observations
- Feature components are correctly placed in `src/components/features/`.
- Layout components (`AppSidebar`, `AppHeader`) are isolated in `src/components/layout/`.
- `'use client'` directive presence not confirmed in components — Server Component default is likely being respected.

### Issues

**`pnlDb.ts` snapshot functions are never used**

`src/lib/db/pnlDb.ts` exports `getPNLSnapshot`, `upsertPNLSnapshot`, `getPNLTimeSeries`  
but `src/lib/services/pnlService.ts` bypasses the snapshot store entirely, re-computing PNL  
by fetching raw trades on every request. The `pnl_snapshots` table is never written to.

This means:
- Every PNL summary request triggers a full trade scan.
- Incremental snapshot caching (the purpose of `pnl_snapshots`) is non-functional.

**Dynamic imports inside service functions**

`src/lib/services/exchangeService.ts` and `src/lib/services/profileService.ts` use  
dynamic `await import(...)` inside function bodies to get the service Supabase client:

```typescript
// exchangeService.ts (lines ~50, ~85)
const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()
```

This pattern bypasses static analysis, adds latency on every call, and is unnecessary since  
`createSupabaseServiceClient` is a synchronous factory. Should be a top-level import.

**`profileService.ts` creates two redundant service clients**

```typescript
const serviceClient = createSupabaseServiceClient()
// ... upload avatar ...
const userClient = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()
await updateUser(userClient, userId, { avatar_url: avatarUrl })
```

`serviceClient` and `userClient` are identical. This should be a single client reused.

---

## 3. Layer Separation

### Positive Observations
- Services do not import from components — no upward layer violations.
- DB modules (`tradesDb.ts`, `exchangeDb.ts`, etc.) only call Supabase — no business logic.
- Engines (`pnlEngine.ts`, `demoEngine.ts`) are pure functions with no I/O.

### Issues

**`exchangeService.ts` — unused `prevCount` variable**

```typescript
const prevCount = await getTradeCount(serviceSupabase, exchangeAccountId)
// prevCount is declared but never referenced again
```

This wastes a database round-trip on every sync. Either use it to compute `new_trades`  
correctly, or remove it. Currently `new_trades` in `SyncResult` is set directly from  
`upsertTrades()` return value, making `prevCount` dead code.

---

## 4. TypeScript Quality

### Positive Observations
- `Result<T, E>` type pattern used consistently in services and domain layer.
- `ApiResponse<T>` envelope used on all API routes.
- `EXCHANGES` and `PERIOD_TYPES` are `as const` tuples — no enums.

### Issues

**Unsafe type casts throughout DB layer**

Multiple places cast Supabase query results directly without runtime validation:

```typescript
return data as ExchangeAccount          // usersDb.ts, exchangeDb.ts
return (data ?? []) as Trade[]          // tradesDb.ts
return data as unknown as Trade[]       // tradesDb.ts (join query)
```

These casts will silently pass wrong shapes if the schema changes. Should use Zod parsing  
or at minimum a typed select column list.

**`ExchangeAdapter` interface uses `SupabaseClient` indirection**

`exchangeFactory.ts` defines `ExchangeAdapter` with raw `apiKey`/`apiSecret` string params,  
but the calling code in `exchangeService.ts` decrypts them first. The interface should document  
that these parameters expect decrypted plaintext values.

---

## 5. API Contract Compliance

### Positive Observations
- All routes return `{ success, data, error }` envelope.
- HTTP status codes are mapped correctly (401 UNAUTHORIZED, 409 CONFLICT, 502 for exchange failures).
- Zod validation errors return 400 consistently.

### Issues

**`/api/pnl/summary` error returns 500 for all service failures**

```typescript
if (!result.success) {
  return NextResponse.json({ ... error: result.error }, { status: 500 })
}
```

The service layer can return meaningful errors (`NOT_FOUND`, etc.) that should map to  
non-500 status codes. A status map like other routes is needed.

---

## Critical Issues (must fix before merge)

| # | Location | Issue |
|---|---|---|
| 1 | `src/app/(app)/dashboard/page.tsx` | Dashboard renders 100% mock data — no real API calls |
| 2 | `src/lib/services/exchangeService.ts` | `prevCount` unused — wastes DB query |
| 3 | `src/lib/services/exchangeService.ts` | Dynamic `await import()` should be top-level import |
| 4 | `src/lib/services/profileService.ts` | Two redundant service client instances |
| 5 | `src/lib/services/pnlService.ts` | `pnl_snapshots` table never written — snapshot caching broken |

## Suggestions

- Add `loading.tsx` and `error.tsx` for all `(app)` routes.
- Add server-side data fetching to `DashboardPage` using `createSupabaseServerClient`.
- Integrate `pnlDb.upsertPNLSnapshot` into `pnlService.fetchPNLSummary` after calculation.
- Replace dynamic imports with top-level imports in service files.
- Add Zod parsing at DB layer boundaries, or at minimum type-safe select column lists.
