import type { SupabaseClient } from '@supabase/supabase-js'
import type { DemoTrade } from '@/lib/types'

export async function createDemoTrade(
  supabase: SupabaseClient,
  trade: Omit<DemoTrade, 'id' | 'created_at'>
): Promise<DemoTrade | null> {
  const { data, error } = await supabase
    .from('demo_trades')
    .insert(trade)
    .select()
    .single()

  if (error) {
    console.error('[demoDb] createDemoTrade failed:', error.message)
    return null
  }
  return data as DemoTrade
}

export async function getDemoTrades(
  supabase: SupabaseClient,
  userId: string,
  status?: 'open' | 'closed' | 'cancelled'
): Promise<DemoTrade[]> {
  let query = supabase
    .from('demo_trades')
    .select('*')
    .eq('user_id', userId)
    .order('opened_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as DemoTrade[]
}

export async function getDemoTradeById(
  supabase: SupabaseClient,
  tradeId: string,
  userId: string
): Promise<DemoTrade | null> {
  const { data, error } = await supabase
    .from('demo_trades')
    .select('*')
    .eq('id', tradeId)
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data as DemoTrade
}

export async function closeDemoTrade(
  supabase: SupabaseClient,
  tradeId: string,
  userId: string,
  exitPrice: number,
  realizedPnl: number
): Promise<DemoTrade | null> {
  const { data, error } = await supabase
    .from('demo_trades')
    .update({
      exit_price: exitPrice,
      realized_pnl: realizedPnl,
      status: 'closed',
      closed_at: new Date().toISOString(),
    })
    .eq('id', tradeId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .select()
    .single()

  if (error) {
    console.error('[demoDb] closeDemoTrade failed:', error.message)
    return null
  }
  return data as DemoTrade
}
