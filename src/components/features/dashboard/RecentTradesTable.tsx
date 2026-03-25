'use client'

import { useState, useEffect } from 'react'
import type { Trade, TradeSegment } from '@/lib/types'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

type RecentTradesTableProps = {
  segment: TradeSegment
}

export function RecentTradesTable({ segment }: RecentTradesTableProps): React.JSX.Element {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/pnl/trades?limit=10&segment=${segment}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setTrades(data.data ?? [])
      })
      .catch(() => setTrades([]))
      .finally(() => setLoading(false))
  }, [segment])

  return (
    <div className="bg-background-light dark:bg-background-dark rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-primary/20 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Recent Executed Trades</h2>
          <p className="text-sm text-slate-500">Overview of your last transactions</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="material-symbols-outlined animate-spin text-primary/40 text-3xl">refresh</span>
          </div>
        )}
        {!loading && trades.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-5xl">receipt_long</span>
            <p className="text-sm text-slate-400">No trades found. Sync your exchange to see data here.</p>
          </div>
        )}
        {!loading && trades.length > 0 && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-primary/5 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Asset</th>
                <th className="px-6 py-4">Side</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Price</th>
                <th className="px-6 py-4">Size / Value</th>
                <th className="px-6 py-4 text-right">PNL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-primary/10">
              {trades.map((trade) => {
                const pnl = trade.realized_pnl ?? 0
                const pnlPositive = pnl >= 0
                const value = trade.quantity * trade.price
                return (
                  <tr
                    key={trade.id}
                    className="hover:bg-slate-50 dark:hover:bg-primary/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{trade.symbol}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase">{formatDate(trade.traded_at)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tighter ${
                          trade.side === 'buy'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-rose-500/10 text-rose-500'
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500 font-medium capitalize">{trade.trade_type}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium font-mono">
                      ${formatNumber(trade.price)}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold font-mono">{formatNumber(trade.quantity, 4)}</p>
                      <p className="text-xs text-slate-400 font-mono">${formatNumber(value)}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {trade.realized_pnl !== null ? (
                        <p className={`text-sm font-bold font-mono ${pnlPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {pnlPositive ? '+' : ''}${formatNumber(pnl)}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">--</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
