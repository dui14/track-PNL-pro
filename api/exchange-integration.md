# Exchange API Integration

## Overview

aiTrackProfit integrates with 5 centralized exchanges via their REST APIs to fetch trade history and account balances. All integrations use read-only API keys — withdrawal and trading permissions are never requested.

## Exchange Adapter Interface

All exchange connectors implement a common interface:

```typescript
interface ExchangeAdapter {
  readonly exchange: ExchangeName

  validateCredentials(apiKey: string, apiSecret: string): Promise<Result<boolean, string>>
  fetchTrades(apiKey: string, apiSecret: string, options: FetchTradesOptions): Promise<Result<NormalizedTrade[], string>>
  fetchBalance(apiKey: string, apiSecret: string): Promise<Result<ExchangeBalance, string>>
}

type FetchTradesOptions = {
  symbol?: string
  startTime?: number
  endTime?: number
  limit?: number
}

type NormalizedTrade = {
  externalId: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  fee: number
  feeCurrency: string
  realizedPnl: number | null
  tradeType: 'spot' | 'futures' | 'margin'
  tradedAt: Date
  rawData: Record<string, unknown>
}

type ExchangeBalance = {
  exchange: ExchangeName
  assets: Array<{
    asset: string
    free: number
    locked: number
    usdValue: number
  }>
  totalUsdValue: number
}
```

## Supported Exchanges

### Binance

Base URLs:
- Spot: `https://api.binance.com`
- Futures: `https://fapi.binance.com`

Authentication: HMAC-SHA256 signature
- Add `timestamp` parameter (Unix ms)
- Sign the full query string
- Pass signature as `signature` parameter
- Pass API key in `X-MBX-APIKEY` header

Key endpoints:
```
GET /fapi/v1/income           <- Futures PnL-ready (realized pnl, funding, commission)
GET /fapi/v1/userTrades       <- Futures trade fallback (7 ngay moi request)
GET /api/v3/myTrades          <- Spot trade history
GET /api/v3/account           <- Spot balances
GET /fapi/v2/account          <- Futures account + balances
GET /api/v3/ping              <- Validate credentials
```

Sync notes:
- Uu tien `/fapi/v1/income` cho futures de lay du lieu PnL da tinh san.
- Spot `myTrades` can chia nho theo time window va tinh PnL thu cong.
- Futures `userTrades` chi dung fallback khi income khong tra ve.

Rate limits:
- 1200 request weight per minute
- Weight header: `X-MBX-USED-WEIGHT-1M`
- On 429: wait for `Retry-After` header duration

### OKX

Base URL: `https://www.okx.com`

Authentication: HMAC-SHA256 signature
- Header-based auth: `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`, `OK-ACCESS-PASSPHRASE`
- Sign: `timestamp + method + requestPath + body`

Key endpoints:
```
GET /api/v5/account/bills          <- Bills gan nhat (phi, funding context)
GET /api/v5/trade/fills-history    <- Spot fills history
GET /api/v5/account/balance        <- Account balance
GET /api/v5/account/config         <- Validate credentials
```

Sync notes:
- Bills co fee day du nhung truong pnl thuong khong dung de tong hop closed pnl chi tiet.
- Can ket hop fills hoac tu tinh PnL tu giao dich.
- Auth bat buoc key + secret + passphrase voi chu ky base64 HMAC SHA256.

Rate limits: 20 requests per 2 seconds per endpoint

### Bybit

Base URL: `https://api.bybit.com`

Authentication: HMAC-SHA256
- Sign: `timestamp + apiKey + recvWindow + queryString`
- Headers: `X-BAPI-API-KEY`, `X-BAPI-SIGN`, `X-BAPI-TIMESTAMP`, `X-BAPI-RECV-WINDOW`

Key endpoints:
```
GET /v5/execution/list    <- Trade history (spot + futures)
GET /v5/account/wallet-balance <- Balance
GET /v5/user/query-api    <- Validate API key
```

### Bitget

Base URL: `https://api.bitget.com`

Authentication: HMAC-SHA256
- Headers: `ACCESS-KEY`, `ACCESS-SIGN`, `ACCESS-TIMESTAMP`, `ACCESS-PASSPHRASE`
- Sign: `timestamp + method + requestPath + body`

Key endpoints:
```
GET /api/v2/spot/trade/fills          <- Spot trade history
GET /api/v2/mix/order/fill-history    <- Futures trade history
GET /api/v2/spot/account/assets       <- Spot balance
```

### MEXC

Base URL: `https://api.mexc.com`

Authentication: HMAC-SHA256 (similar to Binance)
- Query param: `signature`
- Header: `X-MEXC-APIKEY`

Key endpoints:
```
GET /api/v3/myTrades      <- Spot trade history
GET /api/v3/account       <- Account balance
GET /api/v3/ping          <- Connectivity test
```

## Signature Generation

All exchanges use HMAC-SHA256. Generic utility:

```typescript
import { createHmac } from 'crypto'

function signRequest(secret: string, payload: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
}
```

## Rate Limiting Strategy

Implement a per-exchange rate limiter using a token bucket algorithm:

```
Each exchange has a token bucket:
- Capacity: max requests per window
- Refill rate: tokens per millisecond
- On each request: consume 1 token
- If bucket empty: wait until next refill
```

Implementation location: `src/lib/adapters/rateLimiter.ts`

Never hammer exchange APIs — always check remaining quota before batch imports.

## Error Handling

Exchange API errors must be caught and normalized:

```typescript
type ExchangeError =
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'EXCHANGE_UNAVAILABLE'
  | 'INVALID_SYMBOL'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'UNKNOWN'
```

HTTP status codes to handle:
- `401`: Invalid API key → `INVALID_CREDENTIALS`
- `403`: Insufficient permissions → `INSUFFICIENT_PERMISSIONS`
- `429`: Rate limited → `RATE_LIMITED` + implement backoff
- `5xx`: Exchange down → `EXCHANGE_UNAVAILABLE` + retry up to 3 times

## Data Normalization

Each exchange returns trades in different formats. Normalize to `NormalizedTrade` before storage:

Key transformations:
- Convert timestamps to Date objects
- Normalize `side` to lowercase `buy` | `sell`
- Convert quantity and price to numbers (exchanges return strings)
- Calculate fees in USDT equivalent
- Store raw response in `rawData` JSONB for debugging

## Incremental Sync Strategy

To avoid refetching all historical trades on every sync:

1. On first sync: fetch all available history in paginated batches
2. On subsequent syncs: fetch trades since `last_synced` timestamp
3. Use `external_trade_id` unique constraint to prevent duplicates
4. Update `exchange_accounts.last_synced` after successful sync

```
First sync:
  while hasMore:
    trades = fetchTrades(from=0, limit=1000)
    upsert(trades)
    from = lastTradeTime

Incremental sync:
  trades = fetchTrades(from=lastSynced, limit=1000)
  upsert(trades)
```

## Security Requirements

- API keys are decrypted only inside Supabase Edge Functions or API routes
- Keys are NEVER logged, returned in responses, or stored in plaintext
- Validate API key format before accepting (length and character set checks)
- Test credentials by calling a low-risk endpoint before saving to DB
- Mark exchange_account as `is_active=false` on persistent auth failures
