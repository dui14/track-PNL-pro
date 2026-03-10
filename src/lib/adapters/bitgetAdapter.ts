import { createHmac } from 'crypto'
import type { ExchangeAdapterTrade } from '@/lib/types'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://api.bitget.com'
const REQUEST_TIMEOUT = 10_000

function sign(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): string {
  const message = `${timestamp}${method.toUpperCase()}${requestPath}${body}`
  return createHmac('sha256', secret).update(message).digest('base64')
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

export class BitgetAdapter implements ExchangeAdapter {
  private buildHeaders(
    apiKey: string,
    apiSecret: string,
    method: string,
    path: string,
    body = ''
  ): Record<string, string> {
    const timestamp = Date.now().toString()
    const signature = sign(timestamp, method, path, body, apiSecret)
    return {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': '',
      'Content-Type': 'application/json',
    }
  }

  async validateApiKey(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      const path = '/api/v2/spot/account/assets'
      const headers = this.buildHeaders(apiKey, apiSecret, 'GET', path)
      const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

      if (!response.ok) return false
      const data = (await response.json()) as { code: string }
      return data.code === '00000'
    } catch {
      return false
    }
  }

  async fetchTrades(
    apiKey: string,
    apiSecret: string,
    since?: Date
  ): Promise<ExchangeAdapterTrade[]> {
    const startTime = since ? since.getTime() : Date.now() - 90 * 24 * 60 * 60 * 1000
    const query = new URLSearchParams({
      limit: '100',
      startTime: String(startTime),
    })

    const path = `/api/v2/spot/trade/fills?${query}`
    const headers = this.buildHeaders(apiKey, apiSecret, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as {
      code: string
      data: { fills: BitgetTrade[] }
    }
    if (data.code !== '00000') return []

    return (data.data.fills ?? []).map((t) => this.normalizeTrade(t))
  }

  private normalizeTrade(t: BitgetTrade): ExchangeAdapterTrade {
    return {
      external_trade_id: t.tradeId,
      symbol: t.symbol.replace('_', ''),
      side: t.side as 'buy' | 'sell',
      quantity: parseFloat(t.size),
      price: parseFloat(t.price),
      fee: parseFloat(t.fee),
      fee_currency: t.feeDetail?.feeCoin ?? 'USDT',
      realized_pnl: null,
      trade_type: 'spot',
      traded_at: new Date(parseInt(t.cTime)).toISOString(),
      raw_data: t as unknown as Record<string, unknown>,
    }
  }

  async fetchBalance(
    apiKey: string,
    apiSecret: string
  ): Promise<Record<string, number>> {
    const path = '/api/v2/spot/account/assets'
    const headers = this.buildHeaders(apiKey, apiSecret, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return {}

    const data = (await response.json()) as {
      code: string
      data: BitgetBalance[]
    }
    if (data.code !== '00000') return {}

    const result: Record<string, number> = {}
    for (const b of data.data) {
      const total = parseFloat(b.available) + parseFloat(b.frozen)
      if (total > 0) result[b.coinName] = total
    }
    return result
  }
}

type BitgetTrade = {
  tradeId: string
  symbol: string
  side: string
  size: string
  price: string
  fee: string
  feeDetail?: { feeCoin: string }
  cTime: string
}

type BitgetBalance = {
  coinName: string
  available: string
  frozen: string
}
