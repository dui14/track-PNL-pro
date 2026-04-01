import type { DemoTrade } from '@/lib/types'

const TAKER_FEE_RATE = 0.001

export function calculateDemoOrderCost(initialMargin: number, positionNotional: number): number {
  const fee = positionNotional * TAKER_FEE_RATE
  return initialMargin + fee
}

export function calculateDemoRealizedPNL(
  trade: DemoTrade,
  exitPrice: number,
  closeQuantity?: number
): number {
  const { side, entry_price } = trade
  const quantity = closeQuantity ?? trade.quantity
  const priceDiff = side === 'buy' ? exitPrice - entry_price : entry_price - exitPrice
  const grossPNL = priceDiff * quantity
  const exitFee = quantity * exitPrice * TAKER_FEE_RATE
  return parseFloat((grossPNL - exitFee).toFixed(8))
}

export function validateDemoBalance(
  balance: number,
  initialMargin: number,
  positionNotional: number
): boolean {
  const cost = calculateDemoOrderCost(initialMargin, positionNotional)
  return balance >= cost
}
