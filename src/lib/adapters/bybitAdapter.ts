import { createHmac } from 'crypto'
import type {
  ExchangeAdapterTrade,
  ExchangeCredentials,
  AssetBalance,
  UnrealizedPosition,
} from '@/lib/types'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://api.bybit.com'
const REQUEST_TIMEOUT = 10_000
const RECV_WINDOW = '5000'
const DEFAULT_LOOKBACK_MS = 360 * 24 * 60 * 60 * 1000
const BYBIT_HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function sign(apiKey: string, secret: string, timestamp: number, queryString: string): string {
  const payload = `${timestamp}${apiKey}${RECV_WINDOW}${queryString}`
  return createHmac('sha256', secret).update(payload).digest('hex')
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

async function fetchWithRetry(url: string, options?: RequestInit, attempt = 0): Promise<Response> {
  const response = await fetchWithTimeout(url, options)
  if (response.status === 429 && attempt < 4) {
    const backoff = Math.min(Math.pow(2, attempt) * 1000, 60_000)
    await sleep(backoff + Math.random() * 500)
    return fetchWithRetry(url, options, attempt + 1)
  }
  return response
}

export class BybitAdapter implements ExchangeAdapter {
  private buildHeaders(credentials: ExchangeCredentials, queryString: string): Record<string, string> {
    const timestamp = Date.now()
    const signature = sign(credentials.apiKey, credentials.apiSecret, timestamp, queryString)
    return {
      'X-BAPI-API-KEY': credentials.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': String(timestamp),
      'X-BAPI-RECV-WINDOW': RECV_WINDOW,
    }
  }

  async validateCredentials(credentials: ExchangeCredentials): Promise<boolean> {
    try {
      const queryString = 'accountType=UNIFIED'
      const headers = this.buildHeaders(credentials, queryString)
      const response = await fetchWithRetry(`${BASE_URL}/v5/account/wallet-balance?${queryString}`, { headers })
      if (!response.ok) return false
      const data = (await response.json()) as { retCode: number }
      return data.retCode === 0
    } catch {
      return false
    }
  }

  async hasWithdrawPermission(credentials: ExchangeCredentials): Promise<boolean> {
    try {
      const queryString = ''
      const headers = this.buildHeaders(credentials, queryString)
      const response = await fetchWithRetry(`${BASE_URL}/v5/user/query-api`, { headers })
      if (!response.ok) return false
      const data = (await response.json()) as { retCode: number; result?: { permissions?: { Withdraw?: boolean } } }
      if (data.retCode !== 0) return false
      return Boolean(data.result?.permissions?.Withdraw)
    } catch {
      return false
    }
  }

  async fetchTrades(credentials: ExchangeCredentials, since?: Date): Promise<ExchangeAdapterTrade[]> {
    const startTime = since ? since.getTime() : Date.now() - DEFAULT_LOOKBACK_MS
    const now = Date.now()
    const categories: Array<'spot' | 'linear'> = ['spot', 'linear']

    const batches = await Promise.all(
      categories.map(async (category) => {
        const allTrades: BybitTrade[] = []
        const dedup = new Set<string>()
        let windowStart = startTime

        while (windowStart <= now) {
          const windowEnd = Math.min(windowStart + BYBIT_HISTORY_WINDOW_MS - 1, now)
          let cursor = ''

          for (let page = 0; page < 50; page += 1) {
            const query = new URLSearchParams({
              category,
              startTime: String(windowStart),
              endTime: String(windowEnd),
              limit: '100',
            })
            if (cursor) query.set('cursor', cursor)

            const queryString = query.toString()
            const headers = this.buildHeaders(credentials, queryString)
            const response = await fetchWithRetry(`${BASE_URL}/v5/execution/list?${queryString}`, { headers })
            if (!response.ok) break

            const data = (await response.json()) as {
              retCode: number
              result?: { list?: BybitTrade[]; nextPageCursor?: string }
            }
            if (data.retCode !== 0) break

            const pageTrades = data.result?.list ?? []
            for (const trade of pageTrades) {
              const dedupKey = trade.execId || `${trade.symbol}:${trade.execTime}:${trade.execQty}`
              if (dedup.has(dedupKey)) continue
              dedup.add(dedupKey)
              allTrades.push(trade)
            }

            cursor = data.result?.nextPageCursor ?? ''
            if (!cursor || pageTrades.length < 100) break
            await sleep(80)
          }

          windowStart = windowEnd + 1
          await sleep(80)
        }

        return allTrades
      })
    )

    const spotTrades = batches[0].map((trade) => this.normalizeTrade(trade, 'spot'))
    const futuresTrades = batches[1].map((trade) => this.normalizeTrade(trade, 'futures'))
    return [...spotTrades, ...futuresTrades]
  }

  async fetchOpenPositions(credentials: ExchangeCredentials): Promise<UnrealizedPosition[]> {
    const queryString = 'category=linear&settleCoin=USDT'
    const headers = this.buildHeaders(credentials, queryString)
    const response = await fetchWithRetry(`${BASE_URL}/v5/position/list?${queryString}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as { retCode: number; result?: { list?: BybitPosition[] } }
    if (data.retCode !== 0) return []

    return (data.result?.list ?? [])
      .filter((position) => Math.abs(parseFloat(position.size ?? '0')) > 0)
      .map((position) => ({
        symbol: position.symbol,
        side: (position.side ?? '').toLowerCase() === 'sell' ? 'short' : 'long',
        size: Math.abs(parseFloat(position.size)),
        entryPrice: parseFloat(position.avgPrice ?? '0'),
        markPrice: parseFloat(position.markPrice ?? '0'),
        unrealizedPnl: parseFloat(position.unrealisedPnl ?? '0'),
        leverage: parseFloat(position.leverage ?? '0') || 1,
        tradeType: 'futures',
      }))
  }

  async fetchBalances(credentials: ExchangeCredentials): Promise<AssetBalance[]> {
    const queryString = 'accountType=UNIFIED'
    const headers = this.buildHeaders(credentials, queryString)
    const response = await fetchWithRetry(`${BASE_URL}/v5/account/wallet-balance?${queryString}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as {
      retCode: number
      result?: { list?: Array<{ coin?: Array<{ coin: string; walletBalance: string; locked: string }> }> }
    }
    if (data.retCode !== 0) return []

    const balances: AssetBalance[] = []
    for (const account of data.result?.list ?? []) {
      for (const coin of account.coin ?? []) {
        const free = parseFloat(coin.walletBalance)
        const locked = parseFloat(coin.locked ?? '0')
        const total = free + locked
        if (total <= 0) continue
        const price = await this.getUsdPrice(coin.coin)
        balances.push({
          asset: coin.coin,
          free,
          locked,
          usdValue: total * price,
        })
      }
    }

    return balances
  }

  private normalizeTrade(trade: BybitTrade, tradeType: 'spot' | 'futures'): ExchangeAdapterTrade {
    return {
      external_trade_id: trade.execId,
      symbol: trade.symbol,
      side: (trade.side ?? 'Buy').toLowerCase() === 'buy' ? 'buy' : 'sell',
      quantity: parseFloat(trade.execQty ?? '0'),
      price: parseFloat(trade.execPrice ?? '0'),
      fee: parseFloat(trade.execFee ?? '0'),
      fee_currency: trade.feeCurrency ?? 'USDT',
      realized_pnl: trade.closedPnl ? parseFloat(trade.closedPnl) : null,
      funding_fee: 0,
      income_type: trade.execType ?? null,
      trade_type: tradeType,
      traded_at: new Date(parseInt(trade.execTime, 10)).toISOString(),
      raw_data: trade as unknown as Record<string, unknown>,
    }
  }

  private async getUsdPrice(asset: string): Promise<number> {
    if (asset === 'USDT' || asset === 'USDC' || asset === 'USD') return 1
    try {
      const queryString = `category=spot&symbol=${asset}USDT`
      const response = await fetchWithRetry(`${BASE_URL}/v5/market/tickers?${queryString}`)
      if (!response.ok) return 0
      const data = (await response.json()) as {
        retCode: number
        result?: { list?: Array<{ lastPrice?: string }> }
      }
      if (data.retCode !== 0) return 0
      return data.result?.list?.[0]?.lastPrice ? parseFloat(data.result.list[0].lastPrice) : 0
    } catch {
      return 0
    }
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
  execType?: string
  execTime: string
}

type BybitPosition = {
  symbol: string
  side: string
  size: string
  avgPrice: string
  markPrice: string
  unrealisedPnl: string
  leverage: string
}
