'use client'

import { useEffect, useState } from 'react'
import { AssetDistribution } from '@/components/features/dashboard/AssetDistribution'
import { MarketTicker } from '@/components/features/dashboard/MarketTicker'
import { PNLCalendar } from '@/components/features/dashboard/PNLCalendar'
import { PNLChart } from '@/components/features/dashboard/PNLChart'
import { RecentTradesTable } from '@/components/features/dashboard/RecentTradesTable'
import { StatCard } from '@/components/features/dashboard/StatCard'
import type { TradeSegment } from '@/lib/types'

type DashboardOverviewData = {
  pnl: {
    today: number
    d7: number
    d30: number
    d90: number
  }
  winRate: {
    d7: number
    d30: number
    d90: number
  }
  totalTrades: {
    count: number
    volumeUsd: number
  }
}

type SegmentOption = {
  label: string
  value: TradeSegment
}

const SEGMENT_OPTIONS: SegmentOption[] = [
  { label: 'ALL', value: 'all' },
  { label: 'Spot', value: 'spot' },
  { label: 'Future', value: 'futures' },
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
  const [data, setData] = useState<DashboardOverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)

    fetch(`/api/pnl/overview?segment=${segment}`)
      .then(async (response) => response.json())
      .then((payload) => {
        if (payload.success) {
          setData(payload.data as DashboardOverviewData)
          return
        }
        setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [segment])

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 bg-slate-50 dark:bg-background-dark/50">
      <div className="flex flex-col gap-5">
        <MarketTicker />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Theo doi hieu suat Spot, Future hoac tong hop.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-primary/20 bg-white dark:bg-background-dark p-1">
            {SEGMENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSegment(option.value)}
                className={`px-4 h-9 rounded-lg text-sm font-bold transition-colors ${
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
          title="Win Rate 7/30/90 Ngay"
          value={loading ? '--' : formatPercent(data?.winRate.d7 ?? 0)}
          progressBar={data?.winRate.d7}
          note={
            loading
              ? 'Dang tai...'
              : `30D: ${formatPercent(data?.winRate.d30 ?? 0)} | 90D: ${formatPercent(data?.winRate.d90 ?? 0)}`
          }
          icon="target"
        />
        <StatCard
          title="Total Trades"
          value={loading ? '--' : `${data?.totalTrades.count ?? 0}`}
          note={loading ? 'Dang tai...' : `Volume: $${formatVolume(data?.totalTrades.volumeUsd ?? 0)}`}
          icon="receipt_long"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <PNLChart segment={segment} />
        </div>
        <AssetDistribution />
      </div>

      <PNLCalendar segment={segment} />

      <RecentTradesTable segment={segment} />
    </div>
  )
}
