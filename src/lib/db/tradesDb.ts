import type { SupabaseClient } from '@supabase/supabase-js'
import type { Exchange, ExchangeAdapterTrade, Trade } from '@/lib/types'

type TradeTypeFilter = 'spot' | 'futures'

type TradeReadFilter = {
  exchangeAccountId?: string
  tradeType?: TradeTypeFilter
  exchange?: Exchange
  includeInactive?: boolean
}

function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function hasMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error ? String(error.message ?? '') : ''
  const lowerMessage = message.toLowerCase()
  return message.includes(column) && (lowerMessage.includes('column') || lowerMessage.includes('schema cache'))
}

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
    const missingFundingColumns =
      hasMissingColumnError(error, 'funding_fee') || hasMissingColumnError(error, 'income_type')

    if (missingFundingColumns) {
      const fallbackRows = trades.map((t) => ({
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
        trade_type: t.trade_type,
        traded_at: t.traded_at,
        raw_data: t.raw_data,
      }))

      const fallback = await supabase
        .from('trades')
        .upsert(fallbackRows, {
          onConflict: 'exchange_account_id,external_trade_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (fallback.error) {
        console.error('[tradesDb] upsertTrades fallback failed:', fallback.error.message)
        throw new Error(fallback.error.message)
      }

      return fallback.data?.length ?? 0
    }

    console.error('[tradesDb] upsertTrades failed:', error.message)
    throw new Error(error.message)
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
    exchange?: Exchange
    includeInactive?: boolean
    executedOnly?: boolean
  }
): Promise<{ trades: Trade[]; total: number }> {
  const offset = (options.page - 1) * options.limit

  let query = supabase
    .from('trades')
    .select(
      `id, exchange_account_id, user_id, external_trade_id, symbol, side, quantity, price, fee, fee_currency, realized_pnl, funding_fee, income_type, trade_type, traded_at, raw_data, created_at, exchange_accounts!inner(exchange,is_active)`,
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .order('traded_at', { ascending: false })
    .range(offset, offset + options.limit - 1)

  if (!options.includeInactive) {
    query = query.eq('exchange_accounts.is_active', true)
  }

  if (options.exchangeAccountId) {
    query = query.eq('exchange_account_id', options.exchangeAccountId)
  }
  if (options.exchange) {
    query = query.eq('exchange_accounts.exchange', options.exchange)
  }
  if (options.symbol) {
    query = query.ilike('symbol', `%${options.symbol}%`)
  }
  if (options.tradeType) {
    query = query.eq('trade_type', options.tradeType)
  }

  if (options.executedOnly) {
    query = query.gt('quantity', 0).gt('price', 0)
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[tradesDb] getTrades failed:', error.message)
    return { trades: [], total: 0 }
  }

  const trades = (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    const accountData = record.exchange_accounts as Record<string, unknown> | Record<string, unknown>[] | null
    const exchangeRow = Array.isArray(accountData) ? accountData[0] : accountData
    const quantity = toFiniteNumber(record.quantity)
    const price = toFiniteNumber(record.price)
    const fee = toFiniteNumber(record.fee)
    const fundingFee = toFiniteNumber(record.funding_fee)
    const realizedPnl = toNullableFiniteNumber(record.realized_pnl)

    return {
      ...record,
      quantity,
      price,
      fee,
      funding_fee: fundingFee,
      realized_pnl: realizedPnl,
      exchange:
        exchangeRow && typeof exchangeRow.exchange === 'string'
          ? (exchangeRow.exchange as Exchange)
          : undefined,
      exchange_accounts: undefined,
    }
  }) as unknown as Trade[]

  return { trades, total: count ?? 0 }
}

export async function getTradesForPNL(
  supabase: SupabaseClient,
  userId: string,
  options: TradeReadFilter & {
    startDate?: string
    endDate?: string
    executedOnly?: boolean
  }
): Promise<Trade[]> {
  let query = supabase
    .from('trades')
    .select('*, exchange_accounts!inner(exchange,is_active)')
    .eq('user_id', userId)
    .order('traded_at', { ascending: true })

  if (!options.includeInactive) {
    query = query.eq('exchange_accounts.is_active', true)
  }

  if (options.startDate) {
    query = query.gte('traded_at', options.startDate)
  }
  if (options.endDate) {
    query = query.lte('traded_at', options.endDate)
  }
  if (options.exchangeAccountId) {
    query = query.eq('exchange_account_id', options.exchangeAccountId)
  }
  if (options.exchange) {
    query = query.eq('exchange_accounts.exchange', options.exchange)
  }
  if (options.tradeType) {
    query = query.eq('trade_type', options.tradeType)
  }

  if (options.executedOnly) {
    query = query.gt('quantity', 0).gt('price', 0)
  }

  const { data, error } = await query
  if (error) {
    console.error('[tradesDb] getTradesForPNL failed:', error.message)
    return []
  }

  const trades = (data ?? []).map((row) => {
    const record = row as Record<string, unknown>
    const accountData = record.exchange_accounts as Record<string, unknown> | Record<string, unknown>[] | null
    const exchangeRow = Array.isArray(accountData) ? accountData[0] : accountData
    const quantity = toFiniteNumber(record.quantity)
    const price = toFiniteNumber(record.price)
    const fee = toFiniteNumber(record.fee)
    const fundingFee = toFiniteNumber(record.funding_fee)
    const realizedPnl = toNullableFiniteNumber(record.realized_pnl)

    return {
      ...record,
      quantity,
      price,
      fee,
      funding_fee: fundingFee,
      realized_pnl: realizedPnl,
      exchange:
        exchangeRow && typeof exchangeRow.exchange === 'string'
          ? (exchangeRow.exchange as Exchange)
          : undefined,
      exchange_accounts: undefined,
    }
  }) as unknown as Trade[]

  return trades
}

export async function getTradeTotals(
  supabase: SupabaseClient,
  userId: string,
  options: TradeReadFilter & {
    executedOnly?: boolean
  }
): Promise<{ count: number; volumeUsd: number }> {
  let query = supabase
    .from('trades')
    .select('quantity, price, exchange_accounts!inner(exchange,is_active)', { count: 'exact' })
    .eq('user_id', userId)

  if (!options.includeInactive) {
    query = query.eq('exchange_accounts.is_active', true)
  }

  if (options.exchangeAccountId) {
    query = query.eq('exchange_account_id', options.exchangeAccountId)
  }
  if (options.exchange) {
    query = query.eq('exchange_accounts.exchange', options.exchange)
  }
  if (options.tradeType) {
    query = query.eq('trade_type', options.tradeType)
  }

  if (options.executedOnly) {
    query = query.gt('quantity', 0).gt('price', 0)
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

export async function deleteExchangeTrackingData(
  supabase: SupabaseClient,
  userId: string,
  exchangeAccountId: string
): Promise<boolean> {
  const deleteTradesResult = await supabase
    .from('trades')
    .delete()
    .eq('user_id', userId)
    .eq('exchange_account_id', exchangeAccountId)

  if (deleteTradesResult.error) {
    console.error('[tradesDb] deleteExchangeTrackingData(trades) failed:', deleteTradesResult.error.message)
    return false
  }

  const deleteSnapshotsResult = await supabase
    .from('pnl_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('exchange_account_id', exchangeAccountId)

  if (deleteSnapshotsResult.error) {
    console.error('[tradesDb] deleteExchangeTrackingData(pnl_snapshots) failed:', deleteSnapshotsResult.error.message)
    return false
  }

  return true
}
