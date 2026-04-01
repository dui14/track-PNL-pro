'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Exchange, Trade, TradeSegment } from '@/lib/types'

const PAGE_SIZE = 10
const MAX_PAGES = 5
const EXCHANGE_FILTERS = ['all', 'binance', 'okx', 'bybit', 'bitget', 'gateio'] as const

export type ExchangeFilter = (typeof EXCHANGE_FILTERS)[number]
type TradeWithExchange = Trade & { exchange?: Exchange }

type TradesApiPayload = {
  success: boolean
  data: TradeWithExchange[] | null
  error: string | null
  meta?: {
    page?: number
    limit?: number
    total?: number
  }
}

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

function getExchangeLabel(exchange: ExchangeFilter): string {
  if (exchange === 'all') return 'All'
  if (exchange === 'okx') return 'OKX'
  if (exchange === 'bybit') return 'Bybit'
  if (exchange === 'bitget') return 'Bitget'
  if (exchange === 'gateio') return 'Gate.io'
  return 'Binance'
}

function normalizeExchange(value: unknown): ExchangeFilter {
  if (value === 'binance') return 'binance'
  if (value === 'okx') return 'okx'
  if (value === 'bybit') return 'bybit'
  if (value === 'bitget') return 'bitget'
  if (value === 'gateio') return 'gateio'
  return 'all'
}

function mapTradeTypeToSegment(tradeType: Trade['trade_type']): TradeSegment {
  if (tradeType === 'futures') return 'futures'
  if (tradeType === 'spot') return 'spot'
  return 'all'
}

function getTradeTypeLabel(segment: TradeSegment): string {
  if (segment === 'spot') return 'Spot'
  if (segment === 'futures') return 'Future'
  return 'All'
}

function getExchangeTagClass(exchange: ExchangeFilter, active: boolean): string {
  if (active) {
    if (exchange === 'binance') return 'bg-yellow-400 border-yellow-500 text-slate-900'
    if (exchange === 'okx') return 'bg-slate-900 border-slate-900 text-white'
    if (exchange === 'bybit') return 'bg-orange-400 border-orange-500 text-slate-900'
    if (exchange === 'bitget') return 'bg-sky-500 border-sky-600 text-white'
    if (exchange === 'gateio') return 'bg-emerald-500 border-emerald-600 text-white'
    return 'bg-primary border-primary text-accent'
  }

  if (exchange === 'okx') {
    return 'bg-white dark:bg-background-dark border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
  }

  return 'bg-white dark:bg-background-dark border-slate-200 dark:border-primary/20 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-primary/10'
}

function getTradeTypeTagClass(segment: TradeSegment, active: boolean): string {
  if (active) {
    if (segment === 'spot') return 'bg-emerald-500 border-emerald-600 text-white'
    if (segment === 'futures') return 'bg-indigo-500 border-indigo-600 text-white'
    return 'bg-primary border-primary text-accent'
  }

  return 'bg-white dark:bg-background-dark border-slate-200 dark:border-primary/20 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-primary/10'
}

type RecentTradesTableProps = {
  segment: TradeSegment
  exchange?: ExchangeFilter
  onExchangeChange?: (value: ExchangeFilter) => void
}

export function RecentTradesTable({
  segment,
  exchange = 'all',
  onExchangeChange,
}: RecentTradesTableProps): React.JSX.Element {
  const [trades, setTrades] = useState<TradeWithExchange[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>(exchange)
  const [segmentFilter, setSegmentFilter] = useState<TradeSegment>(segment)

  useEffect(() => {
    setSegmentFilter(segment)
  }, [segment])

  useEffect(() => {
    setExchangeFilter(exchange)
  }, [exchange])

  useEffect(() => {
    setPage(1)
  }, [exchangeFilter, segmentFilter])

  useEffect(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
      segment: segmentFilter,
    })

    if (exchangeFilter !== 'all') {
      params.set('exchange', exchangeFilter)
    }

    const controller = new AbortController()
    setLoading(true)

    fetch(`/api/pnl/trades?${params.toString()}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<TradesApiPayload>)
      .then((payload) => {
        if (!payload.success) {
          setTrades([])
          setTotal(0)
          return
        }

        setTrades(payload.data ?? [])
        setTotal(payload.meta?.total ?? 0)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setTrades([])
        setTotal(0)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [page, exchangeFilter, segmentFilter])

  const totalCapped = useMemo(() => Math.min(total, PAGE_SIZE * MAX_PAGES), [total])

  const totalPages = useMemo(() => {
    if (totalCapped === 0) return 1
    return Math.min(MAX_PAGES, Math.ceil(totalCapped / PAGE_SIZE))
  }, [totalCapped])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const handleExchangeFilterChange = (value: ExchangeFilter): void => {
    setExchangeFilter(value)
    onExchangeChange?.(value)
  }

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  )

  const from = totalCapped === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = totalCapped === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCapped)

  return (
    <div className="bg-background-light dark:bg-background-dark rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 dark:border-primary/20 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Recent Executed Trades</h2>
          <p className="text-sm text-slate-500">Overview of your last transactions, max 50 trades</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 font-medium">
            {from === 0 ? '0 trades' : `${from}-${to} of ${totalCapped}`}
          </p>
          <p className="text-[11px] text-slate-400">Page {page}/{totalPages}</p>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-slate-200 dark:border-primary/20 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Exchange</span>
          {EXCHANGE_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleExchangeFilterChange(option)}
              className={`px-3 h-8 rounded-full border text-xs font-bold transition-colors ${getExchangeTagClass(option, option === exchangeFilter)}`}
            >
              {getExchangeLabel(option)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Type</span>
          {(['all', 'spot', 'futures'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSegmentFilter(option)}
              className={`px-3 h-8 rounded-full border text-xs font-bold transition-colors ${getTradeTypeTagClass(option, option === segmentFilter)}`}
            >
              {getTradeTypeLabel(option)}
            </button>
          ))}
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
                const tradeExchange = normalizeExchange(trade.exchange)
                const tradeSegment = mapTradeTypeToSegment(trade.trade_type)
                return (
                  <tr
                    key={trade.id}
                    className="hover:bg-slate-50 dark:hover:bg-primary/5 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold">{trade.symbol}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase">{formatDate(trade.traded_at)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getExchangeTagClass(tradeExchange, true)}`}>
                          {getExchangeLabel(tradeExchange)}
                        </span>
                        {tradeSegment !== 'all' && (
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${getTradeTypeTagClass(tradeSegment, true)}`}>
                            {getTradeTypeLabel(tradeSegment)}
                          </span>
                        )}
                      </div>
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
                      {tradeSegment === 'all' ? (
                        <span className="text-xs text-slate-500 font-medium capitalize">{trade.trade_type}</span>
                      ) : (
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${getTradeTypeTagClass(tradeSegment, true)}`}>
                          {getTradeTypeLabel(tradeSegment)}
                        </span>
                      )}
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

      <div className="px-6 py-4 border-t border-slate-200 dark:border-primary/20 flex items-center justify-between gap-4">
        <div />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={loading || page === 1}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-primary/20 text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-primary/10"
          >
            Prev
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => setPage(pageNumber)}
              disabled={loading}
              className={`h-8 min-w-8 px-2 rounded-lg border text-xs font-bold transition-colors ${
                pageNumber === page
                  ? 'border-primary bg-primary text-accent'
                  : 'border-slate-200 dark:border-primary/20 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-primary/10'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={loading || page === totalPages}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-primary/20 text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-primary/10"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
