# PNL Calculation Engine

## Overview

The PNL calculation engine takes raw normalized trades and computes profit/loss metrics. It runs server-side only, triggered during exchange sync.

## Core Calculation Logic

### Realized PNL

For futures trades, exchanges typically return `realizedPnl` directly in the trade response.

For spot trades, PNL must be calculated using FIFO (First In, First Out) matching:

```
Buy 1 BTC @ $60,000   <- opens position
Buy 1 BTC @ $62,000   <- adds to position
Sell 1 BTC @ $65,000  <- close FIFO: realizes $5,000 PNL from first buy
Sell 1 BTC @ $66,000  <- closes: realizes $4,000 PNL from second buy
```

### FIFO Engine

```typescript
// src/lib/engines/pnlEngine.ts

type TradeRecord = {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  fee: number
  tradedAt: Date
  realizedPnl?: number | null
}

type PNLSnapshot = {
  userId: string
  exchangeAccountId: string | null
  periodType: 'day' | 'week' | 'month' | 'year' | 'all'
  periodStart: Date
  periodEnd: Date
  totalPnl: number
  winCount: number
  lossCount: number
  tradeCount: number
  winRate: number
  bestTradePnl: number | null
  worstTradePnl: number | null
}

type FIFOBucket = {
  quantity: number
  price: number
  fee: number
}

export function calculateSpotPNL(trades: TradeRecord[]): Map<string, number> {
  const fifoQueues = new Map<string, FIFOBucket[]>()
  const pnlMap = new Map<string, number>()

  const sorted = [...trades].sort((a, b) => a.tradedAt.getTime() - b.tradedAt.getTime())

  for (const trade of sorted) {
    if (trade.side === 'buy') {
      const queue = fifoQueues.get(trade.symbol) ?? []
      queue.push({ quantity: trade.quantity, price: trade.price, fee: trade.fee })
      fifoQueues.set(trade.symbol, queue)
    }

    if (trade.side === 'sell') {
      const queue = fifoQueues.get(trade.symbol) ?? []
      let remainingQty = trade.quantity
      let costBasis = 0

      while (remainingQty > 0 && queue.length > 0) {
        const bucket = queue[0]

        if (bucket.quantity <= remainingQty) {
          costBasis += bucket.quantity * bucket.price + bucket.fee
          remainingQty -= bucket.quantity
          queue.shift()
        } else {
          const fraction = remainingQty / bucket.quantity
          costBasis += remainingQty * bucket.price + bucket.fee * fraction
          bucket.quantity -= remainingQty
          bucket.fee *= (1 - fraction)
          remainingQty = 0
        }
      }

      const revenue = trade.quantity * trade.price - trade.fee
      const pnl = revenue - costBasis
      pnlMap.set(trade.id, pnl)
    }
  }

  return pnlMap
}
```

### PNL Snapshot Builder

```typescript
export function buildDailySnapshots(
  userId: string,
  exchangeAccountId: string,
  trades: TradeRecord[]
): PNLSnapshot[] {
  const tradesByDay = new Map<string, TradeRecord[]>()

  for (const trade of trades) {
    const day = trade.tradedAt.toISOString().split('T')[0]
    const existing = tradesByDay.get(day) ?? []
    existing.push(trade)
    tradesByDay.set(day, existing)
  }

  const snapshots: PNLSnapshot[] = []

  for (const [day, dayTrades] of tradesByDay.entries()) {
    const pnlValues = dayTrades
      .map(t => t.realizedPnl ?? 0)
      .filter(p => p !== 0)

    const totalPnl = pnlValues.reduce((sum, p) => sum + p, 0)
    const winCount = pnlValues.filter(p => p > 0).length
    const lossCount = pnlValues.filter(p => p < 0).length
    const tradeCount = pnlValues.length
    const winRate = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0
    const bestTradePnl = pnlValues.length > 0 ? Math.max(...pnlValues) : null
    const worstTradePnl = pnlValues.length > 0 ? Math.min(...pnlValues) : null

    const periodStart = new Date(day)
    const periodEnd = new Date(day)

    snapshots.push({
      userId,
      exchangeAccountId,
      periodType: 'day',
      periodStart,
      periodEnd,
      totalPnl,
      winCount,
      lossCount,
      tradeCount,
      winRate: Math.round(winRate * 100) / 100,
      bestTradePnl,
      worstTradePnl
    })
  }

  return snapshots
}
```

## Aggregation Functions

```typescript
export function aggregateSnapshots(
  dailySnapshots: PNLSnapshot[],
  periodType: 'week' | 'month' | 'year' | 'all',
  userId: string,
  exchangeAccountId: string
): PNLSnapshot[] {
  function getPeriodKey(date: Date): string {
    if (periodType === 'week') {
      const d = new Date(date)
      d.setDate(d.getDate() - d.getDay())
      return d.toISOString().split('T')[0]
    }
    if (periodType === 'month') {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }
    if (periodType === 'year') {
      return String(date.getFullYear())
    }
    return 'all'
  }

  const grouped = new Map<string, PNLSnapshot[]>()
  for (const snap of dailySnapshots) {
    const key = getPeriodKey(snap.periodStart)
    const existing = grouped.get(key) ?? []
    existing.push(snap)
    grouped.set(key, existing)
  }

  const aggregated: PNLSnapshot[] = []
  for (const [, snapshots] of grouped.entries()) {
    const totalPnl = snapshots.reduce((s, n) => s + n.totalPnl, 0)
    const winCount = snapshots.reduce((s, n) => s + n.winCount, 0)
    const lossCount = snapshots.reduce((s, n) => s + n.lossCount, 0)
    const tradeCount = snapshots.reduce((s, n) => s + n.tradeCount, 0)
    const winRate = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0

    const allBest = snapshots.map(s => s.bestTradePnl).filter((v): v is number => v !== null)
    const allWorst = snapshots.map(s => s.worstTradePnl).filter((v): v is number => v !== null)

    aggregated.push({
      userId,
      exchangeAccountId,
      periodType,
      periodStart: snapshots[0].periodStart,
      periodEnd: snapshots[snapshots.length - 1].periodEnd,
      totalPnl,
      winCount,
      lossCount,
      tradeCount,
      winRate: Math.round(winRate * 100) / 100,
      bestTradePnl: allBest.length > 0 ? Math.max(...allBest) : null,
      worstTradePnl: allWorst.length > 0 ? Math.min(...allWorst) : null
    })
  }

  return aggregated
}
```

## Invocation Flow

```typescript
// Called after trade sync
export async function recalculatePNL(
  userId: string,
  exchangeAccountId: string
): Promise<Result<void>> {
  const tradesResult = await tradesDb.getByExchangeAccount(exchangeAccountId)
  if (!tradesResult.success) return tradesResult

  const trades = tradesResult.data

  // For spot trades without realized PNL, calculate via FIFO
  const pnlMap = calculateSpotPNL(trades.filter(t => t.tradeType === 'spot' && !t.realizedPnl))
  const enrichedTrades = trades.map(t => ({
    ...t,
    realizedPnl: t.realizedPnl ?? pnlMap.get(t.id) ?? 0
  }))

  const dailySnapshots = buildDailySnapshots(userId, exchangeAccountId, enrichedTrades)
  const weeklySnapshots = aggregateSnapshots(dailySnapshots, 'week', userId, exchangeAccountId)
  const monthlySnapshots = aggregateSnapshots(dailySnapshots, 'month', userId, exchangeAccountId)
  const yearlySnapshots = aggregateSnapshots(dailySnapshots, 'year', userId, exchangeAccountId)
  const allSnapshot = aggregateSnapshots(dailySnapshots, 'all', userId, exchangeAccountId)

  const all = [...dailySnapshots, ...weeklySnapshots, ...monthlySnapshots, ...yearlySnapshots, ...allSnapshot]

  return pnlSnapshotsDb.upsertMany(all)
}
```

## Edge Cases

| Scenario | Handling |
|---|---|
| Trade with no realized PNL (spot) | Apply FIFO calculation |
| Short position (futures) | Exchange provides realized PNL directly |
| Fee in non-USDT asset | Convert to USDT estimate at time of trade |
| Partial fills | Accumulate by external_trade_id grouping |
| Cancelled orders | Not stored in trades table |
| Zero-fee trades | Include in calculation (realizedPnl = price diff only) |
