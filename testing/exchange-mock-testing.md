# Exchange Mock Testing

## Overview

Exchange adapter tests use mocked HTTP responses to simulate exchange API behavior without making real network calls. This allows testing error handling, rate limiting, and data normalization logic in isolation.

## Mock HTTP Responses

```typescript
// src/test/mocks/binanceMocks.ts

export const BINANCE_MOCK_TRADES = [
  {
    id: 28457,
    symbol: 'BNBBTC',
    orderId: 100234,
    price: '4.00000100',
    qty: '12.00000000',
    commission: '10.10000000',
    commissionAsset: 'BNB',
    time: 1746000000000,
    isBuyer: true,
    isMaker: false,
    isBestMatch: true
  },
  {
    id: 28458,
    symbol: 'BNBBTC',
    orderId: 100235,
    price: '4.20000000',
    qty: '12.00000000',
    commission: '10.00000000',
    commissionAsset: 'BNB',
    time: 1746003600000,
    isBuyer: false,
    isMaker: true,
    isBestMatch: true
  }
]

export const BINANCE_MOCK_ACCOUNT = {
  makerCommission: 15,
  takerCommission: 15,
  balances: [
    { asset: 'BTC', free: '4723846.89208129', locked: '0.00000000' },
    { asset: 'USDT', free: '100.50000000', locked: '50.00000000' }
  ]
}

export const BINANCE_ERROR_INVALID_KEY = {
  code: -2014,
  msg: 'API-key format invalid.'
}

export const BINANCE_ERROR_RATE_LIMIT = {
  code: -1003,
  msg: 'Too many requests. Please try again later.'
}
```

## Binance Adapter Tests

```typescript
// src/lib/adapters/binanceAdapter.test.ts

import { binanceAdapter } from './binanceAdapter'
import {
  BINANCE_MOCK_TRADES,
  BINANCE_MOCK_ACCOUNT,
  BINANCE_ERROR_INVALID_KEY,
  BINANCE_ERROR_RATE_LIMIT
} from '@/test/mocks/binanceMocks'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('binanceAdapter', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('validateCredentials', () => {
    it('returns success for valid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(BINANCE_MOCK_ACCOUNT)
      })

      const result = await binanceAdapter.validateCredentials('valid-key', 'valid-secret')
      expect(result.success).toBe(true)
    })

    it('returns failure for invalid API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(BINANCE_ERROR_INVALID_KEY)
      })

      const result = await binanceAdapter.validateCredentials('bad-key', 'bad-secret')
      expect(result.success).toBe(false)
      expect(result.error).toContain('invalid')
    })
  })

  describe('fetchTrades', () => {
    it('normalizes Binance trade response to NormalizedTrade format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(BINANCE_MOCK_TRADES)
      })

      const result = await binanceAdapter.fetchTrades('key', 'secret', {
        symbol: 'BNBBTC',
        limit: 100
      })

      expect(result.success).toBe(true)
      if (!result.success) return

      const trades = result.data
      expect(trades).toHaveLength(2)

      const firstTrade = trades[0]
      expect(firstTrade.externalId).toBe('28457')
      expect(firstTrade.symbol).toBe('BNBBTC')
      expect(firstTrade.side).toBe('buy')
      expect(firstTrade.quantity).toBe(12)
      expect(firstTrade.price).toBe(4.000001)
      expect(firstTrade.fee).toBe(10.1)
      expect(firstTrade.feeCurrency).toBe('BNB')
      expect(firstTrade.tradeType).toBe('spot')
      expect(firstTrade.tradedAt).toBeInstanceOf(Date)
    })

    it('handles rate limit error gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve(BINANCE_ERROR_RATE_LIMIT)
      })

      const result = await binanceAdapter.fetchTrades('key', 'secret', {})
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('returns empty array when no trades exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([])
      })

      const result = await binanceAdapter.fetchTrades('key', 'secret', {})
      expect(result.success).toBe(true)
      if (result.success) expect(result.data).toHaveLength(0)
    })

    it('handles network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await binanceAdapter.fetchTrades('key', 'secret', {})
      expect(result.success).toBe(false)
    })
  })

  describe('fetchBalance', () => {
    it('returns non-zero balances only', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(BINANCE_MOCK_ACCOUNT)
      })

      const result = await binanceAdapter.fetchBalance('key', 'secret')
      expect(result.success).toBe(true)
      if (!result.success) return

      expect(result.data.assets.every(a => a.free > 0 || a.locked > 0)).toBe(true)
    })
  })
})
```

## PNL Engine Tests

```typescript
// src/lib/engines/pnlEngine.test.ts

import { calculateSpotPNL, buildDailySnapshots } from './pnlEngine'
import type { TradeRecord } from './pnlEngine'

describe('calculateSpotPNL', () => {
  it('calculates PNL using FIFO method', () => {
    const trades: TradeRecord[] = [
      {
        id: '1', symbol: 'BTCUSDT', side: 'buy',
        quantity: 1, price: 60000, fee: 60, tradeType: 'spot',
        tradedAt: new Date('2026-03-01T10:00:00Z')
      },
      {
        id: '2', symbol: 'BTCUSDT', side: 'sell',
        quantity: 1, price: 65000, fee: 65, tradeType: 'spot',
        tradedAt: new Date('2026-03-01T12:00:00Z')
      }
    ]

    const pnlMap = calculateSpotPNL(trades)

    // Revenue: 65000 - 65 = 64935
    // Cost: 60000 + 60 = 60060
    // PNL: 64935 - 60060 = 4875
    expect(pnlMap.get('2')).toBeCloseTo(4875)
  })

  it('handles partial sells correctly', () => {
    const trades: TradeRecord[] = [
      { id: '1', symbol: 'ETHUSDT', side: 'buy', quantity: 2, price: 3000, fee: 6, tradeType: 'spot', tradedAt: new Date('2026-03-01') },
      { id: '2', symbol: 'ETHUSDT', side: 'sell', quantity: 1, price: 3500, fee: 3.5, tradeType: 'spot', tradedAt: new Date('2026-03-02') }
    ]

    const pnlMap = calculateSpotPNL(trades)
    // Revenue: 3500 - 3.5 = 3496.5
    // Cost (half of position): 1500 + 3 = 1503
    // PNL: 3496.5 - 1503 = 1993.5
    expect(pnlMap.get('2')).toBeCloseTo(1993.5)
  })

  it('returns zero for buy-only trades', () => {
    const trades: TradeRecord[] = [
      { id: '1', symbol: 'BTCUSDT', side: 'buy', quantity: 1, price: 60000, fee: 60, tradeType: 'spot', tradedAt: new Date() }
    ]

    const pnlMap = calculateSpotPNL(trades)
    expect(pnlMap.size).toBe(0)
  })

  it('calculates negative PNL for loss trades', () => {
    const trades: TradeRecord[] = [
      { id: '1', symbol: 'BTCUSDT', side: 'buy', quantity: 1, price: 65000, fee: 65, tradeType: 'spot', tradedAt: new Date('2026-03-01') },
      { id: '2', symbol: 'BTCUSDT', side: 'sell', quantity: 1, price: 60000, fee: 60, tradeType: 'spot', tradedAt: new Date('2026-03-02') }
    ]

    const pnlMap = calculateSpotPNL(trades)
    expect(pnlMap.get('2')).toBeLessThan(0)
  })
})

describe('buildDailySnapshots', () => {
  it('groups trades by day and calculates win rate', () => {
    const trades: TradeRecord[] = [
      { id: '1', symbol: 'BTC', side: 'sell', quantity: 1, price: 65000, fee: 0, tradeType: 'futures', realizedPnl: 500, tradedAt: new Date('2026-03-01T10:00:00Z') },
      { id: '2', symbol: 'ETH', side: 'sell', quantity: 10, price: 3000, fee: 0, tradeType: 'futures', realizedPnl: -100, tradedAt: new Date('2026-03-01T12:00:00Z') },
      { id: '3', symbol: 'BTC', side: 'sell', quantity: 1, price: 66000, fee: 0, tradeType: 'futures', realizedPnl: 200, tradedAt: new Date('2026-03-02T09:00:00Z') }
    ]

    const snapshots = buildDailySnapshots('user-1', 'account-1', trades)

    expect(snapshots).toHaveLength(2)

    const march1 = snapshots.find(s => s.periodStart.toISOString().startsWith('2026-03-01'))
    expect(march1?.totalPnl).toBeCloseTo(400) // 500 - 100
    expect(march1?.winCount).toBe(1)
    expect(march1?.lossCount).toBe(1)
    expect(march1?.winRate).toBe(50)
  })
})
```

## Rate Limiter Tests

```typescript
// src/lib/adapters/rateLimiter.test.ts

import { withRateLimit } from './rateLimiter'

describe('withRateLimit', () => {
  it('executes function when within rate limit', async () => {
    const fn = jest.fn().mockResolvedValue('result')
    const result = await withRateLimit('binance', fn)
    expect(result).toBe('result')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('waits when rate limit is exceeded', async () => {
    jest.useFakeTimers()
    // ... test rate limit throttling
    jest.useRealTimers()
  })
})
```

## Encryption Tests

```typescript
// src/lib/utils/encryption.test.ts

import { encryptApiKey, decryptApiKey } from './encryption'

describe('API key encryption', () => {
  const masterKey = '0'.repeat(64)  // 32 bytes hex

  it('encrypts and decrypts correctly', () => {
    const original = 'my-secret-api-key-12345'
    const { encrypted, iv } = encryptApiKey(original, masterKey)

    expect(encrypted).not.toBe(original)

    const decrypted = decryptApiKey(encrypted, iv, masterKey)
    expect(decrypted).toBe(original)
  })

  it('produces different ciphertext each time (unique IV)', () => {
    const text = 'same-text'
    const result1 = encryptApiKey(text, masterKey)
    const result2 = encryptApiKey(text, masterKey)

    expect(result1.encrypted).not.toBe(result2.encrypted)
    expect(result1.iv).not.toBe(result2.iv)
  })

  it('throws on tampered ciphertext', () => {
    const { encrypted, iv } = encryptApiKey('test', masterKey)
    const tampered = Buffer.from(encrypted, 'base64')
    tampered[0] ^= 0xff
    const tamperedBase64 = tampered.toString('base64')

    expect(() => decryptApiKey(tamperedBase64, iv, masterKey)).toThrow()
  })
})
```
