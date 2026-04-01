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
  marginMode: 'cross' | 'isolated'
  leverage: number
  quantity: number
  price: number
  initialMargin: number
  positionNotional: number
  marketPriceAtOpen: number
  takeProfit: number | null
  stopLoss: number | null
}

export async function placeDemoOrder(
  supabase: SupabaseClient,
  userId: string,
  input: PlaceOrderInput
): Promise<Result<DemoTrade>> {
  const balance = await getUserDemoBalance(supabase, userId)

  const isValid = validateDemoBalance(balance, input.initialMargin, input.positionNotional)
  if (!isValid) {
    return { success: false, error: 'INSUFFICIENT_BALANCE' }
  }

  const trade = await createDemoTrade(supabase, {
    user_id: userId,
    symbol: input.symbol,
    side: input.side,
    order_type: input.orderType,
    margin_mode: input.marginMode,
    leverage: input.leverage,
    quantity: input.quantity,
    entry_price: input.price,
    initial_margin: input.initialMargin,
    position_notional: input.positionNotional,
    take_profit: input.takeProfit,
    stop_loss: input.stopLoss,
    market_price_at_open: input.marketPriceAtOpen,
    exit_price: null,
    realized_pnl: null,
    status: 'open',
    opened_at: new Date().toISOString(),
    closed_at: null,
  })

  if (!trade) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  const cost = calculateDemoOrderCost(input.initialMargin, input.positionNotional)
  await updateUserDemoBalance(supabase, userId, balance - cost)

  return { success: true, data: trade }
}

export async function closeDemoOrder(
  supabase: SupabaseClient,
  userId: string,
  tradeId: string,
  exitPrice: number,
  closeQuantity?: number
): Promise<Result<DemoTrade>> {
  const CLOSE_EPSILON = 1e-10
  const trade = await getDemoTradeById(supabase, tradeId, userId)
  if (!trade) {
    return { success: false, error: 'NOT_FOUND' }
  }
  if (trade.status !== 'open') {
    return { success: false, error: 'TRADE_NOT_OPEN' }
  }

  const quantityToClose = closeQuantity ?? trade.quantity

  if (
    !Number.isFinite(quantityToClose) ||
    quantityToClose <= 0 ||
    quantityToClose - trade.quantity > CLOSE_EPSILON
  ) {
    return { success: false, error: 'INVALID_CLOSE_QUANTITY' }
  }

  const closeRatio = quantityToClose / trade.quantity
  const safeLeverage = trade.leverage && trade.leverage > 0 ? trade.leverage : 1
  const totalNotional =
    trade.position_notional ??
    (trade.initial_margin != null
      ? trade.initial_margin * safeLeverage
      : trade.quantity * trade.entry_price)
  const totalMargin =
    trade.initial_margin ??
    (totalNotional > 0 ? totalNotional / safeLeverage : trade.quantity * trade.entry_price / safeLeverage)

  const realizedPnlForClose = calculateDemoRealizedPNL(trade, exitPrice, quantityToClose)
  const accumulatedRealizedPnl = parseFloat(((trade.realized_pnl ?? 0) + realizedPnlForClose).toFixed(8))
  const releasedMargin = parseFloat((totalMargin * closeRatio).toFixed(8))

  const remainingQuantityRaw = trade.quantity - quantityToClose
  const isFullyClosed = remainingQuantityRaw <= CLOSE_EPSILON
  const remainingQuantity = isFullyClosed ? 0 : parseFloat(Math.max(remainingQuantityRaw, 0).toFixed(10))
  const remainingMargin = isFullyClosed
    ? 0
    : parseFloat(Math.max(totalMargin - releasedMargin, 0).toFixed(8))
  const remainingNotional = isFullyClosed
    ? 0
    : parseFloat(Math.max(totalNotional - totalNotional * closeRatio, 0).toFixed(8))

  const closed = await closeDemoTrade(supabase, tradeId, userId, {
    exitPrice: isFullyClosed ? exitPrice : null,
    realizedPnl: accumulatedRealizedPnl,
    quantity: isFullyClosed ? quantityToClose : remainingQuantity,
    initialMargin: remainingMargin,
    positionNotional: remainingNotional,
    status: isFullyClosed ? 'closed' : 'open',
    closedAt: isFullyClosed ? new Date().toISOString() : null,
  })

  if (!closed) {
    return { success: false, error: 'TRADE_NOT_OPEN' }
  }

  const currentBalance = await getUserDemoBalance(supabase, userId)
  const returnedAmount = releasedMargin + realizedPnlForClose

  await updateUserDemoBalance(supabase, userId, currentBalance + returnedAmount)

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
