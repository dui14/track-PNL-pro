'use client'

import { useState, useEffect } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Exchange, PNLChartPoint, TradeSegment } from '@/lib/types'

type ChartRangeOption = { label: string; value: string }

const CHART_RANGES: ChartRangeOption[] = [
  { label: 'W', value: 'week' },
  { label: 'M', value: 'month' },
  { label: 'Y', value: 'year' },
]

type ChartDatum = {
  date: string
  cumulative_pnl: number
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDateTick(value: string, range: string): string {
  if (range === 'year') {
    const [year, month] = value.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)
    return date.toLocaleDateString('en-US', { month: 'short' })
  }

  const date = new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getYDomain(data: ChartDatum[]): [number, number] {
  if (data.length === 0) return [-1, 1]

  const maxAbs = Math.max(
    ...data.map((point) => Math.abs(point.cumulative_pnl)),
    1
  )

  return [-maxAbs, maxAbs]
}

type PNLChartProps = {
  segment: TradeSegment
  exchange: 'all' | Exchange
}

export function PNLChart({ segment, exchange }: PNLChartProps): React.JSX.Element {
  const [range, setRange] = useState('month')
  const [points, setPoints] = useState<ChartDatum[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams({
      range,
      segment,
    })

    if (exchange !== 'all') {
      params.set('exchange', exchange)
    }

    setLoading(true)
    fetch(`/api/pnl/chart?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPoints((data.data ?? []) as PNLChartPoint[])
        }
        else setPoints([])
      })
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [exchange, range, segment])

  const hasData = points.length > 0
  const yDomain = getYDomain(points)

  return (
    <div className="bg-background-light dark:bg-background-dark p-6 rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold">Cumulative PNL Performance</h2>
          <p className="text-sm text-slate-500">Time on X-axis, USD on Y-axis, centered at $0</p>
        </div>
        <div className="flex gap-2">
          {CHART_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                range === r.value
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'hover:bg-slate-100 dark:hover:bg-primary/5 text-slate-400'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-64 w-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-primary/40 text-3xl">refresh</span>
          </div>
        )}
        {!loading && !hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-4xl">show_chart</span>
            <p className="text-sm text-slate-400">No trade data for this period</p>
          </div>
        )}
        {!loading && hasData && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 12, right: 12, left: 0, bottom: 12 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.35} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickFormatter={(value) => formatDateTick(String(value), range)}
                interval="preserveStartEnd"
                minTickGap={24}
                axisLine={{ stroke: '#cbd5e1', opacity: 0.5 }}
                tickLine={false}
                label={{ value: 'Time', position: 'insideBottomRight', offset: -6, fill: '#64748b', fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#cbd5e1', opacity: 0.5 }}
                tickLine={false}
                domain={yDomain}
                width={64}
                tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                label={{ value: '$', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [`$${formatCurrency(Number(value))}`, 'Cumulative PNL']}
                labelFormatter={(value) => formatDateTick(String(value), range)}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  backgroundColor: 'rgba(248, 250, 252, 0.96)',
                  color: '#0f172a',
                }}
              />
              <ReferenceLine y={0} stroke="#0f172a" strokeOpacity={0.4} strokeDasharray="6 4" />
              <Line
                dataKey="cumulative_pnl"
                type="monotone"
                stroke="#0f766e"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, fill: '#0f766e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
