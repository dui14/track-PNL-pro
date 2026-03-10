# WebSocket Consumers

## Overview

WebSocket connections are used exclusively for real-time market data. The application does not require authenticated WebSocket streams — only Binance public streams are consumed.

## Binance Public WebSocket Streams

Base URL: `wss://stream.binance.com:9443/ws/`

Available streams:

| Stream | Format | Purpose |
|---|---|---|
| Trade stream | `<symbol>@trade` | Real-time individual trades |
| Ticker stream | `<symbol>@ticker` | 24h price statistics |
| Book ticker | `<symbol>@bookTicker` | Best bid/ask |
| Mini ticker | `<symbol>@miniTicker` | Minimal price + volume |
| Kline stream | `<symbol>@kline_<interval>` | OHLCV candles |

For the demo trading page, we use the **trade stream** for live price display.

## WebSocket Hook

```typescript
// src/lib/hooks/useMarketPrice.ts
'use client'

import { useEffect, useRef, useState } from 'react'

type PriceUpdate = {
  price: number
  timestamp: number
  direction: 'up' | 'down' | 'neutral'
}

export function useMarketPrice(symbol: string): PriceUpdate | null {
  const [update, setUpdate] = useState<PriceUpdate | null>(null)
  const lastPriceRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const stream = `${symbol.toLowerCase()}@trade`
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`)
    wsRef.current = ws

    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as { p: string; T: number }
      const price = parseFloat(data.p)
      const last = lastPriceRef.current

      setUpdate({
        price,
        timestamp: data.T,
        direction: last === null ? 'neutral' : price > last ? 'up' : price < last ? 'down' : 'neutral'
      })

      lastPriceRef.current = price
    }

    ws.onerror = () => {
      ws.close()
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [symbol])

  return update
}
```

## Multiple Streams

For multiple symbols simultaneously, use the combined stream endpoint:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade
```

```typescript
// src/lib/hooks/useMultipleMarketPrices.ts
'use client'

import { useEffect, useRef, useState } from 'react'

type PriceMap = Record<string, number>

export function useMultipleMarketPrices(symbols: string[]): PriceMap {
  const [prices, setPrices] = useState<PriceMap>({})
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (symbols.length === 0) return

    const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/')
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)
    wsRef.current = ws

    ws.onmessage = (event: MessageEvent) => {
      const { data } = JSON.parse(event.data as string) as { data: { s: string; c: string } }
      setPrices(prev => ({ ...prev, [data.s]: parseFloat(data.c) }))
    }

    return () => {
      ws.close()
    }
  }, [symbols.join(',')])

  return prices
}
```

## Connection Management

### Auto-reconnect

WebSocket connections drop periodically. Implement reconnect logic:

```typescript
function createReconnectingWebSocket(
  url: string,
  onMessage: (data: unknown) => void,
  maxRetries = 5
): () => void {
  let ws: WebSocket
  let retryCount = 0
  let alive = true

  function connect() {
    ws = new WebSocket(url)

    ws.onmessage = (event) => {
      retryCount = 0
      onMessage(JSON.parse(event.data as string))
    }

    ws.onclose = () => {
      if (!alive) return
      if (retryCount >= maxRetries) return

      const delay = Math.min(1000 * 2 ** retryCount, 30_000)
      retryCount++
      setTimeout(connect, delay)
    }
  }

  connect()

  return () => {
    alive = false
    ws?.close()
  }
}
```

### Cleanup on Unmount

Always close WebSocket connections on component unmount to prevent memory leaks and unnecessary network usage:

```typescript
useEffect(() => {
  const cleanup = createReconnectingWebSocket(url, handleMessage)
  return cleanup  // called on unmount
}, [symbol])
```

## Binance WebSocket Limits

- Maximum 1024 streams per connection
- Maximum 300 connections per IP
- Ping/pong every 20 minutes required (or connection closes)
- Stream disconnects after 24 hours continuously (need to reconnect)

## Ping/Pong Handling

```typescript
ws.onopen = () => {
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'ping' }))
    }
  }, 15 * 60 * 1000)  // every 15 minutes

  return () => clearInterval(pingInterval)
}
```

## Demo Page WebSocket Architecture

```
Demo Page (Client)
  |
  +-- useMarketPrice('BTCUSDT')
  |     |
  |     +-- WebSocket -> wss://stream.binance.com/ws/btcusdt@trade
  |     |     |
  |     |     +-- onmessage: setPrice(event.data.p)
  |     |
  |     +-- Returns: { price, direction }
  |
  +-- PriceDisplay: renders live price with color flash
  |
  +-- OrderPanel: uses current price for market order placement
  |     |
  |     +-- POST /api/demo/order { symbol, side, quantity, currentPrice }
  |
  +-- TradingViewChart: independent widget, uses TradingView data
```

Note: TradingView chart has its own internal data feed. The `useMarketPrice` hook is only used for the price display widget and order panel — not to feed the chart.
