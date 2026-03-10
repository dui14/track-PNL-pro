import type { DemoTrade } from '@/lib/types'

const TAKER_FEE_RATE = 0.001

export function calculateDemoOrderCost(
  side: 'buy' | 'sell',
  quantity: number,
  price: number
): number {
  const notional = quantity * price
  const fee = notional * TAKER_FEE_RATE
  if (side === 'buy') return notional + fee
  return fee
}

export function calculateDemoRealizedPNL(trade: DemoTrade, exitPrice: number): number {
  const { side, quantity, entry_price } = trade
  const priceDiff = side === 'buy' ? exitPrice - entry_price : entry_price - exitPrice
  const grossPNL = priceDiff * quantity
  const exitFee = quantity * exitPrice * TAKER_FEE_RATE
  return parseFloat((grossPNL - exitFee).toFixed(8))
}

export function validateDemoBalance(
  balance: number,
  side: 'buy' | 'sell',
  quantity: number,
  price: number
): boolean {
  if (side === 'sell') return true
  const cost = calculateDemoOrderCost(side, quantity, price)
  return balance >= cost
}
