import { createHmac } from 'crypto'
import type { ExchangeAdapterTrade } from '@/lib/types'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://api.bybit.com'
const REQUEST_TIMEOUT = 10_000

function sign(params: string, secret: string, timestamp: number): string {
  const message = `${timestamp}${params}`
  return createHmac('sha256', secret).update(message).digest('hex')
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  attempt = 0
): Promise<Response> {
  const response = await fetchWithTimeout(url, options)
  if (response.status === 429 && attempt < 4) {
    const backoff = Math.min(Math.pow(2, attempt) * 1000, 60_000)
    await sleep(backoff + Math.random() * 500)
    return fetchWithRetry(url, options, attempt + 1)
  }
  return response
}

export class BybitAdapter implements ExchangeAdapter {
  private buildHeaders(
    apiKey: string,
    apiSecret: string,
    queryString: string
  ): Record<string, string> {
    const timestamp = Date.now()
    const signature = sign(queryString, apiSecret, timestamp)
    return {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': String(timestamp),
      'X-BAPI-RECV-WINDOW': '5000',
    }
  }

  async validateApiKey(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      const queryString = 'accountType=UNIFIED'
      const headers = this.buildHeaders(apiKey, apiSecret, queryString)
      const response = await fetchWithRetry(
        `${BASE_URL}/v5/account/wallet-balance?${queryString}`,
        { headers }
      )

      if (!response.ok) return false
      const data = (await response.json()) as { retCode: number }
      return data.retCode === 0
    } catch {
      return false
    }
  }

  async fetchTrades(
    apiKey: string,
    apiSecret: string,
    since?: Date
  ): Promise<ExchangeAdapterTrade[]> {
    const trades: ExchangeAdapterTrade[] = []
    const startTime = since ? since.getTime() : Date.now() - 90 * 24 * 60 * 60 * 1000

    const queryString = `category=spot&limit=200&startTime=${startTime}`
    const headers = this.buildHeaders(apiKey, apiSecret, queryString)
    const spotResponse = await fetchWithRetry(
      `${BASE_URL}/v5/execution/list?${queryString}`,
      { headers }
    )

    if (spotResponse.ok) {
      const data = (await spotResponse.json()) as {
        retCode: number
        result: { list: BybitTrade[] }
      }
      if (data.retCode === 0) {
        trades.push(
          ...data.result.list.map((t) => this.normalizeTrade(t, 'spot'))
        )
      }
    }

    const futuresQuery = `category=linear&limit=200&startTime=${startTime}`
    const futuresHeaders = this.buildHeaders(apiKey, apiSecret, futuresQuery)
    const futuresResponse = await fetchWithRetry(
      `${BASE_URL}/v5/execution/list?${futuresQuery}`,
      { headers: futuresHeaders }
    )

    if (futuresResponse.ok) {
      const data = (await futuresResponse.json()) as {
        retCode: number
        result: { list: BybitTrade[] }
      }
      if (data.retCode === 0) {
        trades.push(
          ...data.result.list.map((t) => this.normalizeTrade(t, 'futures'))
        )
      }
    }

    return trades
  }

  private normalizeTrade(
    t: BybitTrade,
    tradeType: 'spot' | 'futures'
  ): ExchangeAdapterTrade {
    return {
      external_trade_id: t.execId,
      symbol: t.symbol,
      side: t.side.toLowerCase() as 'buy' | 'sell',
      quantity: parseFloat(t.execQty),
      price: parseFloat(t.execPrice),
      fee: parseFloat(t.execFee),
      fee_currency: t.feeCurrency ?? 'USDT',
      realized_pnl: t.closedPnl ? parseFloat(t.closedPnl) : null,
      trade_type: tradeType,
      traded_at: new Date(parseInt(t.execTime)).toISOString(),
      raw_data: t as unknown as Record<string, unknown>,
    }
  }

  async fetchBalance(
    apiKey: string,
    apiSecret: string
  ): Promise<Record<string, number>> {
    const queryString = 'accountType=UNIFIED'
    const headers = this.buildHeaders(apiKey, apiSecret, queryString)
    const response = await fetchWithRetry(
      `${BASE_URL}/v5/account/wallet-balance?${queryString}`,
      { headers }
    )

    if (!response.ok) return {}

    const data = (await response.json()) as {
      retCode: number
      result: {
        list: {
          coin: { coin: string; walletBalance: string }[]
        }[]
      }
    }
    if (data.retCode !== 0) return {}

    const result: Record<string, number> = {}
    for (const account of data.result.list) {
      for (const coin of account.coin) {
        const balance = parseFloat(coin.walletBalance)
        if (balance > 0) result[coin.coin] = balance
      }
    }
    return result
  }
}

type BybitTrade = {
  execId: string
  symbol: string
  side: string
  execQty: string
  execPrice: string
  execFee: string
  feeCurrency?: string
  closedPnl?: string
  execTime: string
}
