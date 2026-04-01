"use client"

import { useEffect, useMemo, useState } from 'react'
import type { AssetDistributionSummary, Exchange, TradeSegment } from '@/lib/types'

type AssetDistributionProps = {
  segment: TradeSegment
}

type ExchangeFilter = 'all' | Exchange

type ExchangeUi = {
  label: string
  filterClass: string
  badgeClass: string
  barClass: string
}

const EXCHANGE_UI: Record<Exchange, ExchangeUi> = {
  binance: {
    label: 'Binance',
    filterClass: 'border-yellow-400/50 bg-yellow-400/10 text-yellow-700 dark:text-yellow-300',
    badgeClass: 'bg-yellow-400 text-slate-900',
    barClass: 'bg-yellow-400',
  },
  okx: {
    label: 'OKX',
    filterClass: 'border-slate-900/30 bg-slate-900 text-white dark:border-slate-600 dark:bg-slate-700',
    badgeClass: 'bg-slate-900 text-white dark:bg-slate-700',
    barClass: 'bg-slate-900 dark:bg-slate-200',
  },
  bybit: {
    label: 'Bybit',
    filterClass: 'border-orange-400/50 bg-gradient-to-r from-slate-900 to-orange-500 text-white',
    badgeClass: 'bg-gradient-to-r from-slate-900 to-orange-500 text-white',
    barClass: 'bg-gradient-to-r from-slate-900 to-orange-500',
  },
  bitget: {
    label: 'Bitget',
    filterClass: 'border-sky-400/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    badgeClass: 'bg-sky-500 text-white',
    barClass: 'bg-sky-500',
  },
  gateio: {
    label: 'Gate.io',
    filterClass: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    badgeClass: 'bg-emerald-500 text-white',
    barClass: 'bg-emerald-500',
  },
}

const FILTER_ORDER: Exchange[] = ['binance', 'okx', 'bybit', 'bitget', 'gateio']

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatQty(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  })
}

export function AssetDistribution({ segment }: AssetDistributionProps): React.JSX.Element {
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('all')
  const [data, setData] = useState<AssetDistributionSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)

    const params = new URLSearchParams({ segment })
    if (exchangeFilter !== 'all') {
      params.set('exchange', exchangeFilter)
    }

    fetch(`/api/pnl/assets?${params.toString()}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success) {
          setData(payload.data as AssetDistributionSummary)
          return
        }
        setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [exchangeFilter, segment])

  const items = useMemo(() => data?.items ?? [], [data])

  return (
    <div className="bg-background-light dark:bg-background-dark p-6 rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold">Asset Distribution</h2>
          <p className="text-sm text-slate-500">Holder tracking by exchange tag</p>
        </div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          ${formatUsd(data?.totalUsd ?? 0)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setExchangeFilter('all')}
          className={`h-8 px-3 rounded-full border text-xs font-bold transition-colors ${
            exchangeFilter === 'all'
              ? 'bg-primary text-accent border-primary'
              : 'border-slate-200 dark:border-primary/20 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-primary/10'
          }`}
        >
          ALL
        </button>
        {FILTER_ORDER.map((exchange) => (
          <button
            key={exchange}
            onClick={() => setExchangeFilter(exchange)}
            className={`h-8 px-3 rounded-full border text-xs font-bold transition-opacity ${
              exchangeFilter === exchange
                ? `${EXCHANGE_UI[exchange].filterClass} opacity-100`
                : 'border-slate-200 dark:border-primary/20 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-primary/10 opacity-90'
            }`}
          >
            {EXCHANGE_UI[exchange].label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[220px]">
          <span className="material-symbols-outlined animate-spin text-primary/40 text-3xl">refresh</span>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[220px] text-center gap-3">
          <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-5xl">pie_chart</span>
          <p className="text-sm text-slate-400 leading-relaxed max-w-[260px]">
            No holder data for this filter. Sync active exchanges to generate asset distribution.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-4">
          {items.slice(0, 8).map((item) => {
            const exchangeUi = EXCHANGE_UI[item.exchange]
            const ratioPercent = Math.max(1, item.ratio * 100)

            return (
              <div key={`${item.exchange}-${item.asset}`} className="rounded-lg border border-slate-200 dark:border-primary/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.asset}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${exchangeUi.badgeClass}`}>
                        {exchangeUi.label}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        Qty {formatQty(item.quantity)}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                    ${formatUsd(item.usdValue)}
                  </p>
                </div>

                <div className="mt-2">
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-primary/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${exchangeUi.barClass}`}
                      style={{ width: `${ratioPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    {(item.ratio * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
