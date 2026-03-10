# Chart Modules

## Overview

aiTrackProfit uses two charting libraries:
- **Recharts** — PNL analytics, win rate, portfolio distribution
- **TradingView Widget** — Candlestick chart for demo trading

## PNL Line Chart

Location: `src/components/features/dashboard/PNLChart.tsx`

Renders cumulative PNL over time as a line chart with area fill.

```
Props:
  data: PNLChartPoint[]    <- Array of { date, pnl, cumulative_pnl }
  range: TimeRange         <- day | week | month | year
  isLoading: boolean
```

Visual specs:
- Line color: `#34d399` (emerald) for positive trend, `#f87171` (red) for negative
- Area fill: gradient from line color to transparent
- X-axis: date formatted by range (e.g., "Mar 01" for week view)
- Y-axis: USD formatted ($1,250.50)
- Tooltip: show date, daily PNL, cumulative PNL
- Responsive container: full width, height 300px

Recharts implementation pattern:

```typescript
'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { PNLChartPoint } from '@/lib/types'

type PNLChartProps = {
  data: PNLChartPoint[]
  isLoading: boolean
}

export function PNLChart({ data, isLoading }: PNLChartProps) {
  const isPositive = data.length > 0 && data[data.length - 1].cumulative_pnl >= 0
  const lineColor = isPositive ? '#34d399' : '#f87171'

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <Area
          type="monotone"
          dataKey="cumulative_pnl"
          stroke={lineColor}
          strokeWidth={2}
          fill="url(#pnlGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

## Win Rate / Trade Count Summary

Location: `src/components/features/dashboard/PNLSummaryCard.tsx`

Stat cards displayed at the top of the dashboard.

```
+------------------+  +------------------+  +------------------+
| Total PNL        |  | Win Rate         |  | Total Trades     |
| $1,250.50        |  | 68.5%            |  | 124              |
| +12.5% this week |  | 85W / 39L        |  | +12 this week    |
+------------------+  +------------------+  +------------------+
```

## Portfolio Balance Pie Chart

Location: `src/components/features/dashboard/ExchangeBalanceCard.tsx`

Shows distribution of portfolio value across exchanges.

```typescript
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts'

const EXCHANGE_COLORS = {
  binance: '#F0B90B',
  okx: '#0066FF',
  bybit: '#F7A600',
  bitget: '#00C087',
  mexc: '#1DA2B4'
}
```

## Daily PNL Bar Chart

Location: inside `PNLChart.tsx` — toggle between line and bar view.

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

{data.map((entry, index) => (
  <Cell
    key={index}
    fill={entry.pnl >= 0 ? '#34d399' : '#f87171'}
  />
))}
```

## TradingView Chart Widget

Location: `src/components/features/demo/TradingViewChart.tsx`

TradingView Advanced Charts embedded via their free widget script.

```typescript
'use client'

import { useEffect, useRef } from 'react'

type TradingViewChartProps = {
  symbol: string    // e.g., "BINANCE:BTCUSDT"
  theme?: 'dark' | 'light'
}

export function TradingViewChart({ symbol, theme = 'dark' }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => {
      new (window as Window & { TradingView: TradingViewConstructor }).TradingView.widget({
        container_id: 'tv_chart_container',
        symbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme,
        style: '1',
        locale: 'en',
        toolbar_bg: '#0f172a',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        width: '100%',
        height: 500
      })
    }
    document.head.appendChild(script)

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [symbol, theme])

  return <div id="tv_chart_container" ref={containerRef} className="w-full h-[500px]" />
}
```

Note: TradingView widget is loaded dynamically to prevent SSR issues. Use `next/dynamic` with `ssr: false`:

```typescript
import dynamic from 'next/dynamic'

const TradingViewChart = dynamic(
  () => import('@/components/features/demo/TradingViewChart').then(m => m.TradingViewChart),
  { ssr: false, loading: () => <Skeleton className="w-full h-[500px]" /> }
)
```

## Real-Time Price Display

Location: `src/components/features/demo/PriceDisplay.tsx`

Uses Binance WebSocket public stream for real-time price.

```typescript
'use client'

import { useEffect, useState } from 'react'

type PriceDisplayProps = {
  symbol: string   // e.g., "btcusdt"
}

export function PriceDisplay({ symbol }: PriceDisplayProps) {
  const [price, setPrice] = useState<number | null>(null)
  const [change, setChange] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`)
    let lastPrice: number | null = null

    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as { p: string }
      const newPrice = parseFloat(data.p)
      setChange(lastPrice !== null ? (newPrice > lastPrice ? 'up' : 'down') : null)
      lastPrice = newPrice
      setPrice(newPrice)
    }

    return () => ws.close()
  }, [symbol])

  return (
    <div className={`font-mono text-2xl font-bold transition-colors duration-200
      ${change === 'up' ? 'text-emerald-400' : change === 'down' ? 'text-red-400' : 'text-foreground'}`}>
      {price !== null ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '...'}
    </div>
  )
}
```

## Responsive Chart Sizing

All charts use `ResponsiveContainer` from Recharts:
```tsx
<ResponsiveContainer width="100%" height={300}>
  {/* chart */}
</ResponsiveContainer>
```

On mobile (< 768px): chart height reduces to 200px via container class.
