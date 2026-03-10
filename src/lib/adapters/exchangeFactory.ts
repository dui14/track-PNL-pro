import type { ExchangeAdapterTrade } from '@/lib/types'

export interface ExchangeAdapter {
  validateApiKey(apiKey: string, apiSecret: string): Promise<boolean>
  fetchTrades(
    apiKey: string,
    apiSecret: string,
    since?: Date
  ): Promise<ExchangeAdapterTrade[]>
  fetchBalance(
    apiKey: string,
    apiSecret: string
  ): Promise<Record<string, number>>
}

export async function createExchangeAdapter(exchange: string): Promise<ExchangeAdapter> {
  switch (exchange) {
    case 'binance': {
      const { BinanceAdapter } = await import('./binanceAdapter')
      return new BinanceAdapter()
    }
    case 'okx': {
      const { OKXAdapter } = await import('./okxAdapter')
      return new OKXAdapter()
    }
    case 'bybit': {
      const { BybitAdapter } = await import('./bybitAdapter')
      return new BybitAdapter()
    }
    case 'bitget': {
      const { BitgetAdapter } = await import('./bitgetAdapter')
      return new BitgetAdapter()
    }
    case 'mexc': {
      const { MEXCAdapter } = await import('./mexcAdapter')
      return new MEXCAdapter()
    }
    default:
      throw new Error(`Unsupported exchange: ${exchange}`)
  }
}
