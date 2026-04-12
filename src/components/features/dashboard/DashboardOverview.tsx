'use client'

import { useEffect, useState } from 'react'
import { MarketTicker } from '@/components/features/dashboard/MarketTicker'
import { PNLCalendar } from '@/components/features/dashboard/PNLCalendar'
import { PNLChart } from '@/components/features/dashboard/PNLChart'
import { RecentTradesTable } from '@/components/features/dashboard/RecentTradesTable'
import { StatCard } from '@/components/features/dashboard/StatCard'
import type { DashboardOverview as DashboardOverviewData, Exchange, TradeSegment } from '@/lib/types'

type ExchangeFilter = 'all' | Exchange

type SegmentOption = {
  label: string
  value: TradeSegment
}

const SEGMENT_OPTIONS: SegmentOption[] = [
  { label: 'ALL', value: 'all' },
  { label: 'Spot', value: 'spot' },
  { label: 'Future', value: 'futures' },
]

type ExchangeOption = {
  label: string
  value: ExchangeFilter
}

const EXCHANGE_OPTIONS: ExchangeOption[] = [
  { label: 'All Exchanges', value: 'all' },
  { label: 'Binance', value: 'binance' },
  { label: 'OKX', value: 'okx' },
  { label: 'Bybit', value: 'bybit' },
  { label: 'Bitget', value: 'bitget' },
  { label: 'Gate.io', value: 'gateio' },
]

function formatPnl(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  if (value > 0) return `+$${abs}`
  if (value < 0) return `-$${abs}`
  return '$0.00'
}

function formatVolume(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export function DashboardOverview(): React.JSX.Element {
  const [segment, setSegment] = useState<TradeSegment>('all')
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('all')
  const [data, setData] = useState<DashboardOverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams({ segment })
    if (exchangeFilter !== 'all') {
      params.set('exchange', exchangeFilter)
    }

    const controller = new AbortController()
    setLoading(true)

    fetch(`/api/pnl/overview?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => response.json())
      .then((payload) => {
        if (payload.success) {
          setData(payload.data as DashboardOverviewData)
          return
        }
        setData(null)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setData(null)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [segment, exchangeFilter])

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 bg-slate-50 dark:bg-background-dark/50">
      <div className="flex flex-col gap-5">
        <MarketTicker />
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Theo doi hieu suat Spot, Future hoac tong hop.</p>
          </div>
          <div className="flex w-full xl:w-auto flex-col gap-2">
            <div className="w-full overflow-x-auto">
              <div className="inline-flex min-w-full items-center gap-2 rounded-xl border border-slate-200 dark:border-primary/20 bg-white dark:bg-background-dark p-1">
                {SEGMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSegment(option.value)}
                    className={`px-3 sm:px-4 h-9 rounded-lg text-xs sm:text-sm font-bold transition-colors shrink-0 ${
                      segment === option.value
                        ? 'bg-primary text-accent'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-primary/10'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <div className="inline-flex min-w-full items-center gap-2 rounded-xl border border-slate-200 dark:border-primary/20 bg-white dark:bg-background-dark p-1">
                {EXCHANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setExchangeFilter(option.value)}
                    className={`px-3 h-8 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      exchangeFilter === option.value
                        ? 'bg-primary text-accent'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-primary/10'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        <StatCard
          title="PNL Hom Nay"
          value={loading ? '--' : formatPnl(data?.pnl.today ?? 0)}
          changePositive={(data?.pnl.today ?? 0) >= 0}
          icon="today"
          valueHighlight={!loading && (data?.pnl.today ?? 0) !== 0}
        />
        <StatCard
          title="PNL 7 Ngay"
          value={loading ? '--' : formatPnl(data?.pnl.d7 ?? 0)}
          changePositive={(data?.pnl.d7 ?? 0) >= 0}
          icon="date_range"
          valueHighlight={!loading && (data?.pnl.d7 ?? 0) !== 0}
        />
        <StatCard
          title="PNL 30 Ngay"
          value={loading ? '--' : formatPnl(data?.pnl.d30 ?? 0)}
          changePositive={(data?.pnl.d30 ?? 0) >= 0}
          icon="calendar_month"
          valueHighlight={!loading && (data?.pnl.d30 ?? 0) !== 0}
        />
        <StatCard
          title="PNL 90 Ngay"
          value={loading ? '--' : formatPnl(data?.pnl.d90 ?? 0)}
          changePositive={(data?.pnl.d90 ?? 0) >= 0}
          icon="event_upcoming"
          valueHighlight={!loading && (data?.pnl.d90 ?? 0) !== 0}
        />
        <StatCard
          title="PNL 1 Nam"
          value={loading ? '--' : formatPnl(data?.pnl.year ?? 0)}
          changePositive={(data?.pnl.year ?? 0) >= 0}
          icon="calendar_today"
          valueHighlight={!loading && (data?.pnl.year ?? 0) !== 0}
        />
        <StatCard
          title="PNL All"
          value={loading ? '--' : formatPnl(data?.pnl.all ?? 0)}
          changePositive={(data?.pnl.all ?? 0) >= 0}
          icon="all_inclusive"
          valueHighlight={!loading && (data?.pnl.all ?? 0) !== 0}
        />
        <StatCard
          title="Win Rate 7/30/90/All"
          value={loading ? '--' : formatPercent(data?.winRate.d7 ?? 0)}
          progressBar={data?.winRate.d7}
          note={
            loading
              ? 'Dang tai...'
              : `30D: ${formatPercent(data?.winRate.d30 ?? 0)}\n90D: ${formatPercent(data?.winRate.d90 ?? 0)}\nALL: ${formatPercent(data?.winRate.all ?? 0)}`
          }
          icon="target"
        />
        <StatCard
          title="Total Trades (All)"
          value={loading ? '--' : `${data?.totalTrades.count ?? 0}`}
          note={
            loading
              ? 'Dang tai...'
              : `7D Vol: $${formatVolume(data?.totalTrades.volumeUsdD7 ?? 0)}\n30D Vol: $${formatVolume(data?.totalTrades.volumeUsdD30 ?? 0)}\n90D Vol: $${formatVolume(data?.totalTrades.volumeUsdD90 ?? 0)}\nALL Vol: $${formatVolume(data?.totalTrades.volumeUsdAll ?? 0)}`
          }
          icon="receipt_long"
        />
      </div>

      <div>
        <PNLChart segment={segment} exchange={exchangeFilter} />
      </div>

      <PNLCalendar segment={segment} exchange={exchangeFilter} />

      <RecentTradesTable
        segment={segment}
        exchange={exchangeFilter}
        onExchangeChange={setExchangeFilter}
      />
    </div>
  )
}
