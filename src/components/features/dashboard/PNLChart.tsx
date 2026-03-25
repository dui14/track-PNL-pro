'use client'

import { useState, useEffect } from 'react'
import type { PNLChartPoint, TradeSegment } from '@/lib/types'

type ChartRangeOption = { label: string; value: string }

const CHART_RANGES: ChartRangeOption[] = [
  { label: '1W', value: 'week' },
  { label: '1M', value: 'month' },
  { label: '1Y', value: 'year' },
]

function buildPaths(points: PNLChartPoint[]): { line: string; area: string } {
  if (points.length < 2) return { line: '', area: '' }
  const values = points.map((p) => p.cumulative_pnl)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  const W = 800
  const H = 240
  const PAD = 20
  const norm = (v: number) => PAD + (1 - (v - minVal) / range) * (H - PAD * 2)
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: norm(p.cumulative_pnl),
  }))
  const lineParts = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
  const line = lineParts.join(' ')
  const area = `${line} V${H} H0 Z`
  return { line, area }
}

type PNLChartProps = {
  segment: TradeSegment
}

export function PNLChart({ segment }: PNLChartProps): React.JSX.Element {
  const [range, setRange] = useState('month')
  const [points, setPoints] = useState<PNLChartPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/pnl/chart?range=${range}&segment=${segment}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setPoints(data.data ?? [])
        else setPoints([])
      })
      .catch(() => setPoints([]))
      .finally(() => setLoading(false))
  }, [range, segment])

  const { line, area } = buildPaths(points)
  const hasData = points.length >= 2
  const firstDate = hasData ? new Date(points[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  const lastDate = hasData ? new Date(points[points.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  return (
    <div className="bg-background-light dark:bg-background-dark p-6 rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold">Cumulative PNL Performance</h2>
          <p className="text-sm text-slate-500">Visualizing profit growth over the selected period</p>
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
          <svg className="w-full h-full" viewBox="0 0 800 240" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#5f4a8c" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#5f4a8c" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-primary/10" x1="0" x2="800" y1="60" y2="60" />
            <line stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-primary/10" x1="0" x2="800" y1="120" y2="120" />
            <line stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-primary/10" x1="0" x2="800" y1="180" y2="180" />
            <path d={area} fill="url(#chartGradient)" />
            <path d={line} fill="none" stroke="#5f4a8c" strokeWidth="3" strokeLinejoin="round" />
          </svg>
        )}
        {!loading && hasData && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[10px] text-slate-500 font-bold uppercase">
            <span>{firstDate}</span>
            <span>{lastDate}</span>
          </div>
        )}
      </div>
    </div>
  )
}
