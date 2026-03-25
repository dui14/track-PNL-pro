# Exchange Endpoint Fixes (2026-03-24)

## Scope

Updated exchange integration to align endpoint usage and signature headers for Binance, OKX, Bybit, and Bitget in the backend adapter layer.

## Changes

1. Added missing runtime dependency for exchange debug route:
- Installed `undici` for `ProxyAgent` usage in `src/app/api/exchange/debug/verify/route.ts`.

2. Bybit adapter header alignment:
- Added `X-BAPI-SIGN-TYPE: 2` in signed request headers.
- File: `src/lib/adapters/bybitAdapter.ts`.

3. Bitget endpoint alignment to v2 for account and market price:
- Changed balance endpoint from `/api/spot/v1/account/assets` to `/api/v2/spot/account/assets`.
- Changed ticker endpoint from `/api/spot/v1/market/ticker` to `/api/v2/spot/market/tickers`.
- Added tolerant payload parsing for v2 response variants (`data[]`, `data.list[]`, object payload).
- File: `src/lib/adapters/bitgetAdapter.ts`.

## Validation

1. Build and type check:
- Command: `pnpm build` (run in `src/`)
- Result: Passed.

2. Exchange debug script with live credentials:
- Command: `node scripts/debug-exchange-apis.cjs` (run in `src/`)
- Result: `allPassed: true`
- Exchanges verified:
  - Binance: account + futures endpoints OK
  - OKX: balance + bills-archive endpoints OK
  - Bybit: wallet-balance + execution endpoints OK
  - Bitget: spot account + spot fills + futures fill-history endpoints OK

## Notes

- Existing lint warnings unrelated to this change remain in UI/API files and do not block build.
- Changes were limited to infrastructure adapter behavior and dependency resolution.
