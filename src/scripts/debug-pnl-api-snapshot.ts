import fs from 'node:fs'
import path from 'node:path'

import { createSupabaseServiceClient } from '../lib/db/supabase-server'
import {
  fetchDashboardOverview,
  fetchPNLChart,
  fetchPNLCalendar,
  fetchPaginatedTrades,
} from '../lib/services/pnlService'

type EnvMap = Record<string, string>

function loadEnvFile(filePath: string): EnvMap {
  const content = fs.readFileSync(filePath, 'utf8')
  const env: EnvMap = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex < 0) continue
    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()
    env[key] = value
  }

  return env
}

function loadLocalEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing src/.env.local')
  }

  const env = loadEnvFile(envPath)
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value
  }
}

async function main(): Promise<void> {
  loadLocalEnv()

  const supabase = createSupabaseServiceClient()

  const { data: userRow, error: userError } = await supabase
    .from('trades')
    .select('user_id')
    .order('traded_at', { ascending: false })
    .limit(1)
    .single()

  if (userError || !userRow?.user_id) {
    throw new Error(`Cannot find user with trades: ${userError?.message ?? 'no data'}`)
  }

  const userId = String(userRow.user_id)
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1

  const [overview, chart, calendar, trades] = await Promise.all([
    fetchDashboardOverview(supabase, userId, 'all'),
    fetchPNLChart(supabase, userId, 'month', undefined, 'all'),
    fetchPNLCalendar(supabase, userId, 'daily', year, month, 'all'),
    fetchPaginatedTrades(supabase, userId, {
      page: 1,
      limit: 10,
      segment: 'all',
    }),
  ])

  process.stdout.write(
    `${JSON.stringify(
      {
        tested_at: new Date().toISOString(),
        user_id: userId,
        overview_success: overview.success,
        overview_data: overview.success ? overview.data : overview.error,
        chart_success: chart.success,
        chart_points: chart.success ? chart.data.length : 0,
        chart_last_point: chart.success && chart.data.length > 0 ? chart.data[chart.data.length - 1] : null,
        calendar_success: calendar.success,
        calendar_points: calendar.success ? calendar.data.length : 0,
        trades_success: trades.success,
        trades_total: trades.success ? trades.data.total : 0,
        trades_first_item:
          trades.success && trades.data.trades.length > 0 ? trades.data.trades[0] : null,
      },
      null,
      2
    )}\n`
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
