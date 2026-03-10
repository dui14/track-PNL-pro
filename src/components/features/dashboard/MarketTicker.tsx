'use client'

import { useEffect, useRef, useState } from 'react'

type TickerData = {
  symbol: string
  label: string
  price: string
  change: string
  changePositive: boolean
}

const TRACKED_PAIRS: { symbol: string; label: string }[] = [
  { symbol: 'btcusdt', label: 'BTC' },
  { symbol: 'ethusdt', label: 'ETH' },
  { symbol: 'solusdt', label: 'SOL' },
  { symbol: 'bnbusdt', label: 'BNB' },
]

type BinanceMiniTicker = {
  s: string
  c: string
  P: string
}

function formatPrice(price: string): string {
  const num = parseFloat(price)
  if (num >= 1000) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (num >= 1) return num.toFixed(3)
  return num.toFixed(5)
}

export function MarketTicker(): React.JSX.Element {
  const [tickers, setTickers] = useState<Map<string, TickerData>>(
    () =>
      new Map(
        TRACKED_PAIRS.map((p) => [
          p.symbol,
          { symbol: p.symbol, label: p.label, price: '--', change: '0.00', changePositive: true },
        ])
      )
  )
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const streams = TRACKED_PAIRS.map((p) => `${p.symbol}@miniTicker`).join('/')
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as { data: BinanceMiniTicker }
        const tick = msg.data
        const symbolLower = tick.s.toLowerCase()
        const pair = TRACKED_PAIRS.find((p) => p.symbol === symbolLower)
        if (!pair) return

        const changeVal = parseFloat(tick.P)
        setTickers((prev) => {
          const next = new Map(prev)
          next.set(symbolLower, {
            symbol: symbolLower,
            label: pair.label,
            price: formatPrice(tick.c),
            change: `${changeVal >= 0 ? '+' : ''}${changeVal.toFixed(2)}%`,
            changePositive: changeVal >= 0,
          })
          return next
        })
      } catch {}
    }

    return () => {
      ws.close()
    }
  }, [])

  const items = TRACKED_PAIRS.map((p) => tickers.get(p.symbol)!)

  return (
    <div className="flex gap-4 overflow-x-auto pb-1">
      {items.map((t) => (
        <div
          key={t.symbol}
          className="flex-shrink-0 bg-background-light dark:bg-background-dark border border-slate-200 dark:border-primary/20 rounded-xl px-4 py-3 min-w-[140px] shadow-sm"
        >
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">{t.label}/USDT</div>
          <div className="text-sm font-bold tabular-nums">${t.price}</div>
          <div
            className={`text-xs font-semibold mt-0.5 tabular-nums ${
              t.changePositive ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {t.change}
          </div>
        </div>
      ))}
    </div>
  )
}
