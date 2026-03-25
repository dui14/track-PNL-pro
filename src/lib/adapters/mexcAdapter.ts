import { createHmac } from 'crypto'
import type {
  ExchangeAdapterTrade,
  ExchangeCredentials,
  AssetBalance,
  UnrealizedPosition,
} from '@/lib/types'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://api.mexc.com'
const REQUEST_TIMEOUT = 10_000

function sign(queryString: string, secret: string): string {
  return createHmac('sha256', secret).update(queryString).digest('hex')
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

export class MEXCAdapter implements ExchangeAdapter {
  async validateCredentials(credentials: ExchangeCredentials): Promise<boolean> {
    try {
      const timestamp = Date.now()
      const queryString = `timestamp=${timestamp}`
      const signature = sign(queryString, credentials.apiSecret)

      const response = await fetchWithRetry(
        `${BASE_URL}/api/v3/account?${queryString}&signature=${signature}`,
        { headers: { 'X-MEXC-APIKEY': credentials.apiKey } }
      )

      return response.ok
    } catch {
      return false
    }
  }

  async hasWithdrawPermission(credentials: ExchangeCredentials): Promise<boolean> {
    void credentials
    return false
  }

  async fetchTrades(
    credentials: ExchangeCredentials,
    since?: Date
  ): Promise<ExchangeAdapterTrade[]> {
    const timestamp = Date.now()
    const startTime = since ? since.getTime() : Date.now() - 90 * 24 * 60 * 60 * 1000

    const params = new URLSearchParams({
      limit: '1000',
      startTime: String(startTime),
      timestamp: String(timestamp),
    })
    params.append('signature', sign(params.toString(), credentials.apiSecret))

    const response = await fetchWithRetry(`${BASE_URL}/api/v3/myTrades?${params}`, {
      headers: { 'X-MEXC-APIKEY': credentials.apiKey },
    })

    if (!response.ok) return []

    const data = (await response.json()) as MEXCTrade[]
    return data.map((t) => this.normalizeTrade(t))
  }

  private normalizeTrade(t: MEXCTrade): ExchangeAdapterTrade {
    return {
      external_trade_id: String(t.id),
      symbol: t.symbol,
      side: t.isBuyer ? 'buy' : 'sell',
      quantity: parseFloat(t.qty),
      price: parseFloat(t.price),
      fee: parseFloat(t.commission),
      fee_currency: t.commissionAsset,
      realized_pnl: null,
      trade_type: 'spot',
      traded_at: new Date(t.time).toISOString(),
      raw_data: t as unknown as Record<string, unknown>,
    }
  }

  async fetchOpenPositions(credentials: ExchangeCredentials): Promise<UnrealizedPosition[]> {
    void credentials
    return []
  }

  async fetchBalances(credentials: ExchangeCredentials): Promise<AssetBalance[]> {
    const timestamp = Date.now()
    const queryString = `timestamp=${timestamp}`
    const signature = sign(queryString, credentials.apiSecret)

    const response = await fetchWithRetry(
      `${BASE_URL}/api/v3/account?${queryString}&signature=${signature}`,
      { headers: { 'X-MEXC-APIKEY': credentials.apiKey } }
    )

    if (!response.ok) return []

    const data = (await response.json()) as {
      balances: { asset: string; free: string; locked: string }[]
    }
    const result: AssetBalance[] = []

    for (const b of data.balances) {
      const free = parseFloat(b.free)
      const locked = parseFloat(b.locked)
      const total = free + locked
      if (total > 0) {
        result.push({
          asset: b.asset,
          free,
          locked,
          usdValue: 0,
        })
      }
    }
    return result
  }
}

type MEXCTrade = {
  id: number
  symbol: string
  price: string
  qty: string
  commission: string
  commissionAsset: string
  time: number
  isBuyer: boolean
}
