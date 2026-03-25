import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trade, ExchangeAdapterTrade } from '@/lib/types'

type TradeTypeFilter = 'spot' | 'futures'

export async function upsertTrades(
  supabase: SupabaseClient,
  exchangeAccountId: string,
  userId: string,
  trades: ExchangeAdapterTrade[]
): Promise<number> {
  if (trades.length === 0) return 0

  const rows = trades.map((t) => ({
    exchange_account_id: exchangeAccountId,
    user_id: userId,
    external_trade_id: t.external_trade_id,
    symbol: t.symbol,
    side: t.side,
    quantity: t.quantity,
    price: t.price,
    fee: t.fee,
    fee_currency: t.fee_currency,
    realized_pnl: t.realized_pnl,
    funding_fee: t.funding_fee ?? 0,
    income_type: t.income_type ?? null,
    trade_type: t.trade_type,
    traded_at: t.traded_at,
    raw_data: t.raw_data,
  }))

  const { data, error } = await supabase
    .from('trades')
    .upsert(rows, {
      onConflict: 'exchange_account_id,external_trade_id',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) {
    console.error('[tradesDb] upsertTrades failed:', error.message)
    return 0
  }
  return data?.length ?? 0
}

export async function getTradeCount(
  supabase: SupabaseClient,
  exchangeAccountId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('trades')
    .select('id', { count: 'exact', head: true })
    .eq('exchange_account_id', exchangeAccountId)

  if (error) return 0
  return count ?? 0
}

export async function getTrades(
  supabase: SupabaseClient,
  userId: string,
  options: {
    page: number
    limit: number
    exchangeAccountId?: string
    symbol?: string
    tradeType?: TradeTypeFilter
  }
): Promise<{ trades: Trade[]; total: number }> {
  const offset = (options.page - 1) * options.limit

  let query = supabase
    .from('trades')
    .select(
      `id, exchange_account_id, symbol, side, quantity, price, fee, realized_pnl, trade_type, traded_at, exchange_accounts!inner(exchange)`,
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .order('traded_at', { ascending: false })
    .range(offset, offset + options.limit - 1)

  if (options.exchangeAccountId) {
    query = query.eq('exchange_account_id', options.exchangeAccountId)
  }
  if (options.symbol) {
    query = query.ilike('symbol', `%${options.symbol}%`)
  }
  if (options.tradeType) {
    query = query.eq('trade_type', options.tradeType)
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[tradesDb] getTrades failed:', error.message)
    return { trades: [], total: 0 }
  }
  return { trades: (data ?? []) as unknown as Trade[], total: count ?? 0 }
}

export async function getTradesForPNL(
  supabase: SupabaseClient,
  userId: string,
  options: {
    startDate?: string
    endDate?: string
    exchangeAccountId?: string
    tradeType?: TradeTypeFilter
  }
): Promise<Trade[]> {
  let query = supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('traded_at', { ascending: true })

  if (options.startDate) {
    query = query.gte('traded_at', options.startDate)
  }
  if (options.endDate) {
    query = query.lte('traded_at', options.endDate)
  }
  if (options.exchangeAccountId) {
    query = query.eq('exchange_account_id', options.exchangeAccountId)
  }
  if (options.tradeType) {
    query = query.eq('trade_type', options.tradeType)
  }

  const { data, error } = await query
  if (error) {
    console.error('[tradesDb] getTradesForPNL failed:', error.message)
    return []
  }
  return (data ?? []) as Trade[]
}

export async function getTradeTotals(
  supabase: SupabaseClient,
  userId: string,
  options: {
    exchangeAccountId?: string
    tradeType?: TradeTypeFilter
  }
): Promise<{ count: number; volumeUsd: number }> {
  let query = supabase
    .from('trades')
    .select('quantity, price', { count: 'exact' })
    .eq('user_id', userId)

  if (options.exchangeAccountId) {
    query = query.eq('exchange_account_id', options.exchangeAccountId)
  }
  if (options.tradeType) {
    query = query.eq('trade_type', options.tradeType)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[tradesDb] getTradeTotals failed:', error.message)
    return { count: 0, volumeUsd: 0 }
  }

  const volumeUsd = (data ?? []).reduce((total, row) => {
    const quantity = Number(row.quantity ?? 0)
    const price = Number(row.price ?? 0)
    return total + quantity * price
  }, 0)

  return {
    count: count ?? 0,
    volumeUsd: parseFloat(volumeUsd.toFixed(8)),
  }
}
