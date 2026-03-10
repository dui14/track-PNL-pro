import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { fetchPNLSummary } from '@/lib/services/pnlService'
import type { PNLSummary } from '@/lib/types'
import { StatCard } from '@/components/features/dashboard/StatCard'
import { PNLChart } from '@/components/features/dashboard/PNLChart'
import { AssetDistribution } from '@/components/features/dashboard/AssetDistribution'
import { RecentTradesTable } from '@/components/features/dashboard/RecentTradesTable'
import { PNLCalendar } from '@/components/features/dashboard/PNLCalendar'
import { MarketTicker } from '@/components/features/dashboard/MarketTicker'

function formatPNL(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value >= 0 ? `+$${abs}` : `-$${abs}`
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  let summary: PNLSummary | null = null
  if (user) {
    const result = await fetchPNLSummary(supabase, user.id, 'month')
    if (result.success) summary = result.data
  }

  return (
    <div className="h-full overflow-y-auto p-8 space-y-8 bg-slate-50 dark:bg-background-dark/50">
      <MarketTicker />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Net PNL (This Month)"
          value={summary ? formatPNL(summary.total_pnl) : '--'}
          changePositive={summary ? summary.total_pnl >= 0 : undefined}
          icon="payments"
          valueHighlight={summary !== null && summary.total_pnl !== 0}
        />
        <StatCard
          title="Win Rate"
          value={summary ? `${summary.win_rate.toFixed(1)}%` : '--'}
          progressBar={summary?.win_rate ?? undefined}
          icon="target"
        />
        <StatCard
          title="Total Trades"
          value={summary ? String(summary.trade_count) : '--'}
          icon="receipt_long"
        />
        <StatCard
          title="Win / Loss"
          value={summary ? `${summary.win_count} / ${summary.loss_count}` : '--'}
          icon="balance"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <PNLChart />
        </div>
        <AssetDistribution />
      </div>

      <PNLCalendar />

      <RecentTradesTable />
    </div>
  )
}
