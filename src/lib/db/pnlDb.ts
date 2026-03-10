import type { SupabaseClient } from '@supabase/supabase-js'
import type { PNLSnapshot, PeriodType } from '@/lib/types'

export async function getPNLSnapshot(
  supabase: SupabaseClient,
  userId: string,
  periodType: PeriodType,
  exchangeAccountId?: string
): Promise<PNLSnapshot | null> {
  let query = supabase
    .from('pnl_snapshots')
    .select('*')
    .eq('user_id', userId)
    .eq('period_type', periodType)
    .order('calculated_at', { ascending: false })
    .limit(1)

  if (exchangeAccountId) {
    query = query.eq('exchange_account_id', exchangeAccountId)
  } else {
    query = query.is('exchange_account_id', null)
  }

  const { data, error } = await query
  if (error || !data || data.length === 0) return null
  return data[0] as PNLSnapshot
}

export async function upsertPNLSnapshot(
  supabase: SupabaseClient,
  snapshot: Omit<PNLSnapshot, 'id' | 'calculated_at'>
): Promise<boolean> {
  const { error } = await supabase.from('pnl_snapshots').upsert(
    { ...snapshot, calculated_at: new Date().toISOString() },
    {
      onConflict: 'user_id,exchange_account_id,period_type,period_start',
    }
  )

  if (error) {
    console.error('[pnlDb] upsertPNLSnapshot failed:', error.message)
  }
  return !error
}

export async function getPNLTimeSeries(
  supabase: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
  exchangeAccountId?: string
): Promise<PNLSnapshot[]> {
  let query = supabase
    .from('pnl_snapshots')
    .select('period_start, period_end, total_pnl')
    .eq('user_id', userId)
    .eq('period_type', 'day')
    .gte('period_start', startDate)
    .lte('period_start', endDate)
    .order('period_start', { ascending: true })

  if (exchangeAccountId) {
    query = query.eq('exchange_account_id', exchangeAccountId)
  } else {
    query = query.is('exchange_account_id', null)
  }

  const { data, error } = await query
  if (error) {
    console.error('[pnlDb] getPNLTimeSeries failed:', error.message)
    return []
  }
  return (data ?? []) as PNLSnapshot[]
}
