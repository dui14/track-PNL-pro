# Exchange Connectors

## Overview

Exchange connectors are infrastructure-layer adapters that implement the `ExchangeAdapter` interface. Each connector handles authentication, request signing, rate limiting, and data normalization for one exchange.

## Adapter Interface

```typescript
// src/lib/adapters/types.ts

export type ExchangeName = 'binance' | 'okx' | 'bybit' | 'bitget' | 'mexc'

export type NormalizedTrade = {
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

export type ExchangeBalance = {
  exchange: ExchangeName
  assets: Array<{
    asset: string
    free: number
    locked: number
    usdValue: number
  }>
  totalUsdValue: number
}

export type FetchTradesOptions = {
  symbol?: string
  startTime?: number
  endTime?: number
  limit?: number
}

export type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E }

export interface ExchangeAdapter {
  readonly exchange: ExchangeName
  validateCredentials(apiKey: string, apiSecret: string): Promise<Result<boolean>>
  fetchTrades(apiKey: string, apiSecret: string, options: FetchTradesOptions): Promise<Result<NormalizedTrade[]>>
  fetchBalance(apiKey: string, apiSecret: string): Promise<Result<ExchangeBalance>>
}
```

## Binance Connector

```typescript
// src/lib/adapters/binanceAdapter.ts

import { createHmac } from 'crypto'
import type { ExchangeAdapter, NormalizedTrade, ExchangeBalance, FetchTradesOptions, Result } from './types'

const SPOT_BASE = 'https://api.binance.com'
const FUTURES_BASE = 'https://fapi.binance.com'

function sign(queryString: string, secret: string): string {
  return createHmac('sha256', secret).update(queryString).digest('hex')
}

async function binanceRequest<T>(
  baseUrl: string,
  path: string,
  apiKey: string,
  apiSecret: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const timestamp = Date.now()
  const queryParams = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(timestamp)
  })
  const signature = sign(queryParams.toString(), apiSecret)
  queryParams.set('signature', signature)

  const response = await fetch(`${baseUrl}${path}?${queryParams.toString()}`, {
    headers: { 'X-MBX-APIKEY': apiKey }
  })

  if (!response.ok) {
    const error = await response.json() as { code: number; msg: string }
    throw new Error(`Binance API error ${response.status}: ${error.msg}`)
  }

  return response.json() as Promise<T>
}

export const binanceAdapter: ExchangeAdapter = {
  exchange: 'binance',

  async validateCredentials(apiKey, apiSecret) {
    try {
      await binanceRequest(SPOT_BASE, '/api/v3/account', apiKey, apiSecret)
      return { success: true, data: true }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'INVALID_CREDENTIALS' }
    }
  },

  async fetchTrades(apiKey, apiSecret, options) {
    try {
      type BinanceTrade = {
        id: number; symbol: string; side: string; qty: string;
        price: string; commission: string; commissionAsset: string;
        realizedPnl?: string; time: number;
      }
      const spotTrades = await binanceRequest<BinanceTrade[]>(
        SPOT_BASE, '/api/v3/myTrades', apiKey, apiSecret,
        { ...(options.symbol ? { symbol: options.symbol } : {}),
          ...(options.startTime ? { startTime: options.startTime } : {}),
          limit: options.limit ?? 1000 }
      )

      const normalized: NormalizedTrade[] = spotTrades.map((t) => ({
        externalId: String(t.id),
        symbol: t.symbol,
        side: t.side.toLowerCase() as 'buy' | 'sell',
        quantity: parseFloat(t.qty),
        price: parseFloat(t.price),
        fee: parseFloat(t.commission),
        feeCurrency: t.commissionAsset,
        realizedPnl: t.realizedPnl ? parseFloat(t.realizedPnl) : null,
        tradeType: 'spot',
        tradedAt: new Date(t.time),
        rawData: t as Record<string, unknown>
      }))

      return { success: true, data: normalized }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'FETCH_FAILED' }
    }
  },

  async fetchBalance(apiKey, apiSecret) {
    try {
      type BinanceAccountBalance = {
        balances: Array<{ asset: string; free: string; locked: string }>
      }
      const account = await binanceRequest<BinanceAccountBalance>(
        SPOT_BASE, '/api/v3/account', apiKey, apiSecret
      )

      const assets = account.balances
        .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
          usdValue: 0
        }))

      return {
        success: true,
        data: { exchange: 'binance' as const, assets, totalUsdValue: 0 }
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'FETCH_FAILED' }
    }
  }
}
```

## Connector Registry

```typescript
// src/lib/adapters/exchangeRegistry.ts

import { binanceAdapter } from './binanceAdapter'
import { okxAdapter } from './okxAdapter'
import { bybitAdapter } from './bybitAdapter'
import { bitgetAdapter } from './bitgetAdapter'
import { mexcAdapter } from './mexcAdapter'
import type { ExchangeAdapter, ExchangeName } from './types'

const registry: Record<ExchangeName, ExchangeAdapter> = {
  binance: binanceAdapter,
  okx: okxAdapter,
  bybit: bybitAdapter,
  bitget: bitgetAdapter,
  mexc: mexcAdapter
}

export function getExchangeAdapter(exchange: ExchangeName): ExchangeAdapter {
  return registry[exchange]
}
```

## OKX Connector Signature

OKX uses header-based authentication with passphrase:

```typescript
function signOKX(timestamp: string, method: string, path: string, body: string, secret: string): string {
  const message = timestamp + method.toUpperCase() + path + body
  return createHmac('sha256', secret).update(message).digest('base64')
}

function getOKXHeaders(apiKey: string, apiSecret: string, passphrase: string, method: string, path: string, body = '') {
  const timestamp = new Date().toISOString()
  return {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signOKX(timestamp, method, path, body, apiSecret),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  }
}
```

Note: OKX requires a passphrase in addition to API key and secret. The `api_keys` table stores it as part of the encrypted secret (JSON-encoded: `{ secret, passphrase }`).

## Bybit Connector Signature

```typescript
function signBybit(apiKey: string, apiSecret: string, timestamp: number, recvWindow: number, params: string): string {
  const payload = `${timestamp}${apiKey}${recvWindow}${params}`
  return createHmac('sha256', apiSecret).update(payload).digest('hex')
}
```

## Rate Limiter Utility

```typescript
// src/lib/adapters/rateLimiter.ts

type RateLimiterConfig = {
  requestsPerWindow: number
  windowMs: number
}

const EXCHANGE_LIMITS: Record<string, RateLimiterConfig> = {
  binance: { requestsPerWindow: 1200, windowMs: 60_000 },
  okx: { requestsPerWindow: 20, windowMs: 2_000 },
  bybit: { requestsPerWindow: 120, windowMs: 60_000 },
  bitget: { requestsPerWindow: 20, windowMs: 1_000 },
  mexc: { requestsPerWindow: 500, windowMs: 60_000 }
}

const counters = new Map<string, { count: number; resetAt: number }>()

export async function withRateLimit(exchange: string, fn: () => Promise<unknown>): Promise<unknown> {
  const config = EXCHANGE_LIMITS[exchange]
  const key = exchange
  const now = Date.now()

  let state = counters.get(key)

  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + config.windowMs }
    counters.set(key, state)
  }

  if (state.count >= config.requestsPerWindow) {
    const waitMs = state.resetAt - now
    await new Promise(resolve => setTimeout(resolve, waitMs))
    state = { count: 0, resetAt: Date.now() + config.windowMs }
    counters.set(key, state)
  }

  state.count++
  return fn()
}
```
