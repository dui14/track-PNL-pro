import type { SupabaseClient } from '@supabase/supabase-js'
import type { DemoTrade, Result } from '@/lib/types'
import { createDemoTrade, getDemoTrades, getDemoTradeById, closeDemoTrade } from '@/lib/db/demoDb'
import { getUserDemoBalance, updateUserDemoBalance } from '@/lib/db/usersDb'
import {
  calculateDemoOrderCost,
  calculateDemoRealizedPNL,
  validateDemoBalance,
} from '@/lib/engines/demoEngine'

type PlaceOrderInput = {
  symbol: string
  side: 'buy' | 'sell'
  orderType: 'market' | 'limit'
  quantity: number
  price: number
}

export async function placeDemoOrder(
  supabase: SupabaseClient,
  userId: string,
  input: PlaceOrderInput
): Promise<Result<DemoTrade>> {
  const balance = await getUserDemoBalance(supabase, userId)

  const isValid = validateDemoBalance(balance, input.side, input.quantity, input.price)
  if (!isValid) {
    return { success: false, error: 'INSUFFICIENT_BALANCE' }
  }

  const trade = await createDemoTrade(supabase, {
    user_id: userId,
    symbol: input.symbol,
    side: input.side,
    order_type: input.orderType,
    quantity: input.quantity,
    entry_price: input.price,
    exit_price: null,
    realized_pnl: null,
    status: 'open',
    opened_at: new Date().toISOString(),
    closed_at: null,
  })

  if (!trade) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  if (input.side === 'buy') {
    const cost = calculateDemoOrderCost(input.side, input.quantity, input.price)
    await updateUserDemoBalance(supabase, userId, balance - cost)
  }

  return { success: true, data: trade }
}

export async function closeDemoOrder(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
  exitPrice: number
): Promise<Result<DemoTrade>> {
  const trade = await getDemoTradeById(supabase, tradeId, userId)
  if (!trade) {
    return { success: false, error: 'NOT_FOUND' }
  }
  if (trade.status !== 'open') {
    return { success: false, error: 'TRADE_NOT_OPEN' }
  }

  const realizedPnl = calculateDemoRealizedPNL(trade, exitPrice)
  const closed = await closeDemoTrade(supabase, tradeId, userId, exitPrice, realizedPnl)

  if (!closed) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  const currentBalance = await getUserDemoBalance(supabase, userId)
  const returnedAmount = trade.side === 'buy'
    ? trade.quantity * exitPrice + realizedPnl
    : trade.quantity * trade.entry_price + realizedPnl

  await updateUserDemoBalance(supabase, userId, currentBalance + Math.max(returnedAmount, 0))

  return { success: true, data: closed }
}

export async function listDemoOrders(
  supabase: SupabaseClient,
  userId: string,
  status?: 'open' | 'closed' | 'cancelled'
): Promise<Result<DemoTrade[]>> {
  const trades = await getDemoTrades(supabase, userId, status)
  return { success: true, data: trades }
}
