import type {
  ExchangeAdapterTrade,
  ExchangeCredentials,
  AssetBalance,
  UnrealizedPosition,
} from '@/lib/types'
import { buildOkxSignedHeaders } from '@/lib/adapters/okxApi'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://www.okx.com'
const REQUEST_TIMEOUT = 10_000
const DEFAULT_LOOKBACK_MS = 360 * 24 * 60 * 60 * 1000

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

async function fetchWithRetry(url: string, options?: RequestInit, attempt = 0): Promise<Response> {
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
    credentials: ExchangeCredentials,
    method: string,
    pathWithQuery: string,
    body = ''
  ): Record<string, string> {
    return buildOkxSignedHeaders({
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      passphrase: credentials.passphrase ?? '',
      method,
      requestPath: pathWithQuery,
      body,
    })
  }

  async validateCredentials(credentials: ExchangeCredentials): Promise<boolean> {
    try {
      if (!credentials.passphrase) return false
      const path = '/api/v5/account/balance'
      const headers = this.buildHeaders(credentials, 'GET', path)
      const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })
      if (!response.ok) return false
      const data = (await response.json()) as { code: string }
      return data.code === '0'
    } catch {
      return false
    }
  }

  async hasWithdrawPermission(credentials: ExchangeCredentials): Promise<boolean> {
    try {
      const path = '/api/v5/account/config'
      const headers = this.buildHeaders(credentials, 'GET', path)
      const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })
      if (!response.ok) return false
      const data = (await response.json()) as { code: string; data?: Array<{ perm?: string }> }
      if (data.code !== '0') return false
      const permissions = data.data?.map((item) => item.perm ?? '').join(',') ?? ''
      return permissions.toLowerCase().includes('withdraw')
    } catch {
      return false
    }
  }

  async fetchTrades(credentials: ExchangeCredentials, since?: Date): Promise<ExchangeAdapterTrade[]> {
    const begin = since ? since.getTime() : Date.now() - DEFAULT_LOOKBACK_MS
    const end = Date.now()
    const query = new URLSearchParams({
      type: '2',
      begin: String(begin),
      end: String(end),
      limit: '100',
    })
    const path = `/api/v5/account/bills-archive?${query.toString()}`
    const headers = this.buildHeaders(credentials, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as { code: string; data: OKXBill[] }
    if (data.code !== '0') return []

    return data.data
      .filter((item) => ['2', '8', '14'].includes(item.type))
      .map((item) => this.normalizeBill(item))
  }

  async fetchOpenPositions(credentials: ExchangeCredentials): Promise<UnrealizedPosition[]> {
    const path = '/api/v5/account/positions'
    const headers = this.buildHeaders(credentials, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as { code: string; data: OKXPosition[] }
    if (data.code !== '0') return []

    return data.data
      .filter((position) => Math.abs(parseFloat(position.pos ?? '0')) > 0)
      .map((position) => ({
        symbol: (position.instId ?? '').replace(/-/g, ''),
        side: (position.posSide ?? '').toLowerCase() === 'short' ? 'short' : 'long',
        size: Math.abs(parseFloat(position.pos ?? '0')),
        entryPrice: parseFloat(position.avgPx ?? '0'),
        markPrice: parseFloat(position.markPx ?? '0'),
        unrealizedPnl: parseFloat(position.upl ?? '0'),
        leverage: parseFloat(position.lever ?? '0') || 1,
        tradeType: 'futures',
      }))
  }

  async fetchBalances(credentials: ExchangeCredentials): Promise<AssetBalance[]> {
    const path = '/api/v5/account/balance'
    const headers = this.buildHeaders(credentials, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as {
      code: string
      data: Array<{ details: Array<{ ccy: string; cashBal: string; frozenBal: string }> }>
    }
    if (data.code !== '0') return []

    const result: AssetBalance[] = []
    for (const account of data.data) {
      for (const detail of account.details) {
        const free = parseFloat(detail.cashBal)
        const locked = parseFloat(detail.frozenBal)
        const total = free + locked
        if (total <= 0) continue
        const usdPrice = await this.getUsdPrice(detail.ccy)
        result.push({
          asset: detail.ccy,
          free,
          locked,
          usdValue: total * usdPrice,
        })
      }
    }

    return result
  }

  private normalizeBill(bill: OKXBill): ExchangeAdapterTrade {
    const pnl = parseFloat(bill.pnl ?? '0')
    const fee = parseFloat(bill.fee ?? '0')
    const amount = pnl + fee
    const side: 'buy' | 'sell' = amount >= 0 ? 'sell' : 'buy'

    return {
      external_trade_id: `okx_bill_${bill.billId}`,
      symbol: (bill.instId ?? '').replace(/-/g, ''),
      side,
      quantity: Math.abs(parseFloat(bill.sz ?? '0')),
      price: parseFloat(bill.px ?? '0'),
      fee: Math.abs(fee),
      fee_currency: bill.ccy ?? 'USDT',
      realized_pnl: amount,
      funding_fee: bill.type === '8' ? fee : 0,
      income_type: bill.type,
      trade_type: bill.instType === 'SPOT' ? 'spot' : 'futures',
      traded_at: new Date(parseInt(bill.ts, 10)).toISOString(),
      raw_data: bill as unknown as Record<string, unknown>,
    }
  }

  private async getUsdPrice(asset: string): Promise<number> {
    if (asset === 'USDT' || asset === 'USDC' || asset === 'BUSD' || asset === 'USD') return 1
    try {
      const path = `/api/v5/market/ticker?instId=${asset}-USDT`
      const response = await fetchWithRetry(`${BASE_URL}${path}`)
      if (!response.ok) return 0
      const data = (await response.json()) as { code: string; data?: Array<{ last: string }> }
      if (data.code !== '0') return 0
      return data.data?.[0]?.last ? parseFloat(data.data[0].last) : 0
    } catch {
      return 0
    }
  }
}

type OKXBill = {
  billId: string
  type: string
  instType: string
  instId: string
  ccy: string
  pnl: string
  fee: string
  sz: string
  px: string
  ts: string
}

type OKXPosition = {
  instId: string
  posSide: string
  pos: string
  avgPx: string
  markPx: string
  upl: string
  lever: string
}
