import { createHmac } from 'crypto'
import type { ExchangeAdapterTrade } from '@/lib/types'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://www.okx.com'
const REQUEST_TIMEOUT = 10_000

function sign(timestamp: string, method: string, path: string, body: string, secret: string): string {
  const message = `${timestamp}${method}${path}${body}`
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

export class OKXAdapter implements ExchangeAdapter {
  private buildHeaders(
    apiKey: string,
    apiSecret: string,
    method: string,
    path: string,
    body = ''
  ): Record<string, string> {
    const timestamp = new Date().toISOString()
    const signature = sign(timestamp, method, path, body, apiSecret)
    return {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': '',
      'Content-Type': 'application/json',
    }
  }

  async validateApiKey(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      const path = '/api/v5/account/balance'
      const headers = this.buildHeaders(apiKey, apiSecret, 'GET', path)
      const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

      if (!response.ok) return false
      const data = (await response.json()) as { code: string }
      return data.code === '0'
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
    const after = since ? since.getTime().toString() : undefined

    const path = '/api/v5/trade/fills-history'
    const query = new URLSearchParams({ limit: '100' })
    if (after) query.append('begin', after)

    const fullPath = `${path}?${query}`
    const headers = this.buildHeaders(apiKey, apiSecret, 'GET', fullPath)
    const response = await fetchWithRetry(`${BASE_URL}${fullPath}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as { code: string; data: OKXTrade[] }
    if (data.code !== '0') return []

    for (const t of data.data) {
      trades.push(this.normalizeTrade(t))
    }
    return trades
  }

  private normalizeTrade(t: OKXTrade): ExchangeAdapterTrade {
    const tradeType = t.instType === 'SWAP' || t.instType === 'FUTURES' ? 'futures' : 'spot'
    return {
      external_trade_id: t.tradeId,
      symbol: t.instId.replace('-', ''),
      side: t.side as 'buy' | 'sell',
      quantity: parseFloat(t.sz),
      price: parseFloat(t.px),
      fee: Math.abs(parseFloat(t.fee)),
      fee_currency: t.feeCcy,
      realized_pnl: t.pnl ? parseFloat(t.pnl) : null,
      trade_type: tradeType,
      traded_at: new Date(parseInt(t.ts)).toISOString(),
      raw_data: t as unknown as Record<string, unknown>,
    }
  }

  async fetchBalance(
    apiKey: string,
    apiSecret: string
  ): Promise<Record<string, number>> {
    const path = '/api/v5/account/balance'
    const headers = this.buildHeaders(apiKey, apiSecret, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return {}

    const data = (await response.json()) as {
      code: string
      data: { details: { ccy: string; availBal: string }[] }[]
    }
    if (data.code !== '0') return {}

    const result: Record<string, number> = {}
    for (const account of data.data) {
      for (const detail of account.details) {
        const balance = parseFloat(detail.availBal)
        if (balance > 0) result[detail.ccy] = balance
      }
    }
    return result
  }
}

type OKXTrade = {
  tradeId: string
  instId: string
  instType: string
  side: string
  sz: string
  px: string
  fee: string
  feeCcy: string
  pnl?: string
  ts: string
}
