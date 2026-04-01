import fs from 'node:fs'
import path from 'node:path'

import { createSupabaseServiceClient } from '../lib/db/supabase-server'
import { syncExchangeAccount } from '../lib/services/exchangeService'

type EnvMap = Record<string, string>

type ExchangeAccountRow = {
  id: string
  user_id: string
  exchange: string
  is_active: boolean
}

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

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env vars')
  }

  const supabase = createSupabaseServiceClient()

  const { data: accounts, error: accountsError } = await supabase
    .from('exchange_accounts')
    .select('id,user_id,exchange,is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (accountsError) {
    throw new Error(`Failed to load exchange_accounts: ${accountsError.message}`)
  }

  const activeAccounts = (accounts ?? []) as ExchangeAccountRow[]

  const results: Array<{
    exchange: string
    exchangeAccountId: string
    success: boolean
    error?: string
    synced_trades?: number
    new_trades?: number
    last_synced?: string
  }> = []

  for (const account of activeAccounts) {
    const result = await syncExchangeAccount(supabase, account.user_id, account.id)

    if (result.success) {
      results.push({
        exchange: account.exchange,
        exchangeAccountId: account.id,
        success: true,
        synced_trades: result.data.synced_trades,
        new_trades: result.data.new_trades,
        last_synced: result.data.last_synced,
      })
      continue
    }

    results.push({
      exchange: account.exchange,
      exchangeAccountId: account.id,
      success: false,
      error: result.error,
    })
  }

  const { count, error: tradesCountError } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })

  if (tradesCountError) {
    throw new Error(`Failed to count trades: ${tradesCountError.message}`)
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        tested_at: new Date().toISOString(),
        active_accounts: activeAccounts.length,
        trades_count: count ?? 0,
        results,
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
