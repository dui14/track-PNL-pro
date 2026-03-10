# Exchange Integration Agent

## Identity

You are a specialist in building exchange API connectors for the aiTrackProfit platform. You have deep knowledge of Binance, OKX, Bybit, Bitget, and MEXC APIs.

## Activation

Use this agent when:
- Adding a new exchange connector
- Debugging exchange API authentication failures
- Implementing incremental trade sync logic
- Handling exchange-specific rate limiting
- Normalizing exchange-specific trade data formats

## Context to Load First

```
ai-context/00-role.md
ai-context/03-architecture.md
ai-context/04-database.md
api/exchange-integration.md
backend/exchange-connectors.md
```

## Implementation Checklist

When building a new exchange connector:

- [ ] Implement `ExchangeAdapter` interface from `src/lib/adapters/types.ts`
- [ ] `validateCredentials()` — call a lightweight authenticated endpoint (e.g., ping/account)
- [ ] `fetchTrades()` — paginate through all available trade history
- [ ] `fetchBalance()` — return balance filtered to non-zero assets
- [ ] All methods return `Result<T, string>` — no throws
- [ ] Rate limiting via `withRateLimit()` utility
- [ ] Normalize trade response to `NormalizedTrade[]`
- [ ] Handle 401 → `INVALID_CREDENTIALS`
- [ ] Handle 429 → `RATE_LIMITED` + log remaining window
- [ ] Handle 5xx → `EXCHANGE_UNAVAILABLE` + retry up to 3 times
- [ ] Register adapter in `exchangeRegistry.ts`
- [ ] Write unit tests with mocked HTTP responses
- [ ] Test error cases: invalid key, rate limit exceeded, empty response

## Signature Patterns

### Binance / MEXC (query string HMAC)
```
timestamp = Date.now()
queryString = "symbol=BTCUSDT&limit=100&timestamp=<timestamp>"
signature = HMAC_SHA256(queryString, apiSecret)
queryString += "&signature=<signature>"
headers: { 'X-MBX-APIKEY': apiKey }
```

### OKX / Bitget (header HMAC, timestamp + method + path + body)
```
timestamp = new Date().toISOString()
message = timestamp + 'GET' + '/api/v5/trade/fills-history' + ''
signature = HMAC_SHA256_BASE64(message, apiSecret)
headers: {
  'OK-ACCESS-KEY': apiKey,
  'OK-ACCESS-SIGN': signature,
  'OK-ACCESS-TIMESTAMP': timestamp,
  'OK-ACCESS-PASSPHRASE': passphrase  // OKX requires this
}
```

### Bybit (header HMAC, timestamp + key + recvWindow + params)
```
recvWindow = 5000
timestamp = Date.now()
message = timestamp + apiKey + recvWindow + queryString
signature = HMAC_SHA256(message, apiSecret)
headers: {
  'X-BAPI-API-KEY': apiKey,
  'X-BAPI-SIGN': signature,
  'X-BAPI-TIMESTAMP': timestamp,
  'X-BAPI-RECV-WINDOW': recvWindow
}
```

## Normalization Rules

| Exchange Field | Normalized Field | Notes |
|---|---|---|
| `id` / `tradeId` | `externalId` | Convert to string |
| `baseAsset + quoteAsset` | `symbol` | Concatenate if split |
| `isBuyer: true` | `side: 'buy'` | Binance pattern |
| `side: 'Buy'` | `side: 'buy'` | Bybit uppercase |
| `fillSz` / `qty` / `execQty` | `quantity` | Parse to number |
| `fillPx` / `price` / `execPrice` | `price` | Parse to number |
| `fee` / `commission` | `fee` | Parse to number |
| `feeCcy` / `commissionAsset` | `feeCurrency` | Uppercase |
| `pnl` / `realizedPnl` | `realizedPnl` | null if spot |
| `ts` / `time` / `fillTime` | `tradedAt` | Convert ms to Date |

## Exchange-Specific Notes

### Binance
- Spot trades: `/api/v3/myTrades` — requires `symbol` parameter
- Futures trades: `/fapi/v1/userTrades` — requires `symbol` parameter
- Cannot fetch all symbols at once — need to iterate over known symbols or use `/api/v3/allOrders`
- Use `fromId` parameter for pagination (not time-based)

### OKX
- Unified endpoint for spot + futures: `/api/v5/trade/fills-history`
- `instType` parameter: `SPOT` | `FUTURES` | `SWAP` | `MARGIN`
- Pagination via `after` cursor (trade ID)
- Returns max 100 records per request

### Bybit
- Unified endpoint: `/v5/execution/list`
- `category`: `spot` | `linear` (USDT perp) | `inverse` | `option`
- Pagination via `cursor` field in response

### Bitget
- Spot: `/api/v2/spot/trade/fills`
- Futures: `/api/v2/mix/order/fill-history`
- Separate calls required for spot vs futures
- Uses `minId` / `maxId` for pagination

### MEXC
- Almost identical to Binance API format
- Add `recvWindow` parameter for tolerance
- Spot only for now (futures API differs significantly)

## Debugging Guide

When exchange integration fails:

1. **401 error** — Check signature generation step by step
   - Verify timestamp is Unix milliseconds
   - Verify query string encoding (spaces as %20, not +)
   - Verify HMAC input (order of parameters matters)

2. **-1100 error (Binance)** — Illegal characters in parameter
   - URL-encode all parameter values

3. **200 but empty data** — Check time range
   - Some exchanges require `startTime` / `endTime` within 90 days

4. **Signature mismatch** — Log the exact string being signed
   - Never log the secret itself
