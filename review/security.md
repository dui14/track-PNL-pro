# Security Review — aiTrackProfit

**Agent:** security.md  
**Date:** 2026-03-07  
**Status:** BLOCKED — critical authentication failures in exchange adapters

---

## Review Summary

Core security architecture is sound: AES-256-GCM encryption for API keys, JWT authentication on every route, Supabase RLS as the database security boundary, and no plaintext secrets in frontend bundles. However, two exchange adapters contain identity-breaking defects, API-level rate limiting is absent, and two adapters ship non-functional authentication due to missing passphrase fields.

---

## 1. API Key Protection

### Positive Observations
- `src/lib/adapters/encryption.ts` correctly implements AES-256-GCM with a 96-bit random IV per encryption.
- Auth tag (16 bytes) is appended to ciphertext and stripped on decryption — integrity guaranteed.
- `ENCRYPTION_MASTER_KEY` is accessed via `process.env` server-side only — never exposed to client.
- API key values are never returned in any API response (`exchange_accounts` selects exclude encrypted fields).
- `api_keys` table is accessed exclusively through `createSupabaseServiceClient` (service role) — anon client cannot reach it.
- Withdrawal permission is explicitly checked and rejected in `BinanceAdapter.validateApiKey`:

```typescript
if (data.canWithdraw) {
  console.error('[BinanceAdapter] API key has withdrawal permission - rejected')
  return false
}
```

### Issues

**SECURITY BLOCK — OKX adapter sends empty passphrase**

File: `src/lib/adapters/okxAdapter.ts`

```typescript
'OK-ACCESS-PASSPHRASE': '',
```

OKX API requires a passphrase for all authenticated endpoints. Sending an empty string will  
cause `validateApiKey` to fail for any key protected by a passphrase (the standard).  
More critically, an empty passphrase means the current `validateApiKey` might return `true`  
for OKX demo/test keys or orphaned keys with no passphrase — falsely storing invalid credentials.  
The `ConnectExchangeSchema` has no `passphrase` field, so this is architecturally incomplete.

**SECURITY BLOCK — Bitget adapter sends empty passphrase**

File: `src/lib/adapters/bitgetAdapter.ts`

```typescript
'ACCESS-PASSPHRASE': '',
```

Bitget also requires a passphrase for API authentication. Same risk as OKX above.

**Fix required:** Add `passphrase` field to `ConnectExchangeSchema` with a conditional:  
`passphrase` required when `exchange` is `okx` or `bitget`, optional otherwise.

---

## 2. Authentication Security

### Positive Observations
- All 10 API routes check `supabase.auth.getUser()` at the top before any business logic.
- Middleware protects all `/api/exchange`, `/api/pnl`, `/api/demo`, `/api/ai`, `/api/profile` routes.
- User IDs come exclusively from `supabase.auth.getUser()` — never from request body or query params.
- All DB queries that are user-scoped include `.eq('user_id', userId)`.

### Issues

**No server-side rate limiting on critical endpoints**

The security spec defines the following rate limits, none of which are implemented:

| Endpoint | Required Limit | Implemented |
|---|---|---|
| `POST /api/exchange/sync` | 1 per exchange per 5 min | No |
| `POST /api/ai/chat` | 20 messages per hour | No |
| `POST /api/exchange/connect` | 10 attempts per hour | No |
| General API | 100 req per minute | No |

Only Supabase Auth's built-in login rate limiting is active. A user can repeatedly call  
`POST /api/exchange/sync` to exhaust the exchange API's rate limits and hammer the DB.  
Similarly, `POST /api/ai/chat` has no token/request cap, allowing unlimited OpenAI spend.

**No Content Security Policy (CSP) headers**

`next.config.ts` does not configure security headers (CSP, X-Frame-Options, HSTS, etc.)  
as required by the security spec. Any third-party script injection vulnerability would have  
no browser-level mitigation.

---

## 3. Input Validation

### Positive Observations
- Every API route uses `SomeSchema.safeParse()` before processing input.
- `ChatMessageSchema` caps message length at 4000 characters.
- File upload in `profileService.uploadAvatar` validates MIME type server-side with an allowlist and enforces a 2MB max.
- Exchange name validated as enum via `z.enum(EXCHANGES)` — no free-text exchange names.

### Issues

**API key format not validated on connect**

`ConnectExchangeSchema` only checks `min(1)` for `apiKey` and `apiSecret`:

```typescript
apiKey: z.string().min(1).trim(),
apiSecret: z.string().min(1).trim(),
```

A single character passes validation. Known exchange key formats:
- Binance: 64-char alphanumeric
- OKX: 36-char UUID-like
- Bybit: 18-char alphanumeric

Adding `.min(N).max(N)` or regex patterns per exchange would prevent garbage submissions  
from reaching the credential validation endpoint.

**`symbol` field in trade queries not sanitized**

`TradesQuerySchema` allows `symbol: z.string().optional()` with no length cap or character  
class restriction. This value is passed directly to `.ilike('symbol', `%${options.symbol}%`)`.  
While Supabase parameterized queries prevent SQL injection, an extremely long symbol string  
could cause performance issues. Add `.max(20)` constraint.

---

## 4. Database Security

### Positive Observations
- All DB query functions include `user_id` filter in addition to relying on RLS.
- `deleteExchangeAccount` checks both `id = accountId AND user_id = userId`.
- `closeDemoTrade` checks `status = 'open'` preventing double-close attacks.
- Service role client used exclusively for `api_keys` table access.

### Issues

**`getTradesForPNL` selects all columns including `raw_data`**

```typescript
let query = supabase.from('trades').select('*')
```

`raw_data` contains the full raw exchange API response per trade — potentially large JSON.  
For a user with thousands of trades, loading all raw data into server memory for every  
PNL calculation is a memory and performance risk. Only PNL-relevant columns should be selected:  
`id, symbol, side, quantity, price, fee, realized_pnl, trade_type, traded_at`.

---

## 5. OWASP Top 10 Assessment

| Risk | Finding | Status |
|---|---|---|
| A01 Broken Access Control | All routes check auth + user_id in queries | PASS |
| A02 Cryptographic Failure | AES-256-GCM with random IV, correct key derivation | PASS |
| A03 Injection | Parameterized queries, Zod validation | PASS |
| A04 Insecure Design | Withdrawal permission rejected on Binance; missing on OKX/Bitget due to passphrase bug | PARTIAL |
| A05 Security Misconfiguration | No CSP headers, no rate limiting | FAIL |
| A06 Vulnerable Components | Not assessed (pnpm audit not run) | UNKNOWN |
| A07 Auth Failures | Supabase Auth with JWT; no custom JWT | PASS |
| A08 Software Integrity | Lock file present | PASS |
| A09 Logging Failures | Errors logged without API key values; no audit log | PARTIAL |
| A10 SSRF | All exchange URLs hardcoded, no user-controlled URLs | PASS |

---

## Security Block Criteria — Verdict

| Criterion | Status |
|---|---|
| Plaintext API key in code or logs | PASS — never logged |
| Auth check missing in any API route | PASS — all routes protected |
| SQL via string concatenation | PASS — parameterized queries only |
| User resource ownership not verified | PASS — user_id filters present |
| Secrets with `NEXT_PUBLIC_` prefix | PASS — only Supabase URL/anon key (expected) |
| **OKX passphrase field empty** | **BLOCKED** |
| **Bitget passphrase field empty** | **BLOCKED** |

---

## Critical Issues (must fix before merge)

| # | Location | Issue |
|---|---|---|
| 1 | `src/lib/adapters/okxAdapter.ts` | Empty passphrase — OKX auth broken, invalid keys may pass |
| 2 | `src/lib/adapters/bitgetAdapter.ts` | Empty passphrase — Bitget auth broken |
| 3 | `src/lib/validators/exchange.ts` | `ConnectExchangeSchema` missing `passphrase` field for OKX/Bitget |
| 4 | `src/app/api/exchange/connect/route.ts` | Passphrase not forwarded to `connectExchange()` |

## Suggestions

- Implement rate limiting middleware (Upstash Redis or Vercel Edge rate limit).
- Add CSP, X-Frame-Options, and HSTS headers to `next.config.ts`.
- Add per-exchange API key format validation in `ConnectExchangeSchema`.
- Add `.max(20)` to `symbol` filter in `TradesQuerySchema`.
- Replace `select('*')` in `getTradesForPNL` with explicit column list.
- Run `pnpm audit` and enable Dependabot on the repository.
- Add an audit log for key events: exchange connect, API key change, sync trigger.
