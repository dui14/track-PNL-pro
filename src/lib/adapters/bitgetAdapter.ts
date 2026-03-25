import { createHmac } from 'crypto'
import type {
  ExchangeAdapterTrade,
  ExchangeCredentials,
  AssetBalance,
  UnrealizedPosition,
} from '@/lib/types'
import type { ExchangeAdapter } from './exchangeFactory'

const BASE_URL = 'https://api.bitget.com'
const REQUEST_TIMEOUT = 10_000
const DEFAULT_LOOKBACK_MS = 360 * 24 * 60 * 60 * 1000
const BITGET_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const BITGET_FUTURES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function sign(timestamp: string, method: string, requestPath: string, body: string, secret: string): string {
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

async function fetchWithRetry(url: string, options?: RequestInit, attempt = 0): Promise<Response> {
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
    credentials: ExchangeCredentials,
    method: string,
    pathWithQuery: string,
    body = ''
  ): Record<string, string> {
    const timestamp = Date.now().toString()
    const signature = sign(timestamp, method, pathWithQuery, body, credentials.apiSecret)
    return {
      'ACCESS-KEY': credentials.apiKey,
      'ACCESS-SIGN': signature,
      'ACCESS-TIMESTAMP': timestamp,
      'ACCESS-PASSPHRASE': credentials.passphrase ?? '',
      'Content-Type': 'application/json',
    }
  }

  async validateCredentials(credentials: ExchangeCredentials): Promise<boolean> {
    try {
      if (!credentials.passphrase) return false
      const path = '/api/v2/spot/account/assets'
      const headers = this.buildHeaders(credentials, 'GET', path)
      const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })
      if (!response.ok) return false
      const data = (await response.json()) as { code: string }
      return data.code === '00000'
    } catch {
      return false
    }
  }

  async hasWithdrawPermission(credentials: ExchangeCredentials): Promise<boolean> {
    void credentials
    return false
  }

  async fetchTrades(credentials: ExchangeCredentials, since?: Date): Promise<ExchangeAdapterTrade[]> {
    const startTime = since ? since.getTime() : Date.now() - DEFAULT_LOOKBACK_MS
    const [spotTrades, futuresTrades] = await Promise.all([
      this.fetchSpotTrades(credentials, startTime),
      this.fetchFuturesHistory(credentials, startTime),
    ])

    return [...spotTrades, ...futuresTrades]
  }

  private async fetchSpotTrades(
    credentials: ExchangeCredentials,
    startTime: number
  ): Promise<ExchangeAdapterTrade[]> {
    const allTrades: ExchangeAdapterTrade[] = []
    const now = Date.now()
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT']

    for (const symbol of symbols) {
      let windowStart = startTime

      while (windowStart <= now) {
        const windowEnd = Math.min(windowStart + BITGET_FUTURES_WINDOW_MS - 1, now)
        let idLessThan = ''

        for (let page = 0; page < 30; page += 1) {
          const query = new URLSearchParams({
            symbol,
            startTime: String(windowStart),
            endTime: String(windowEnd),
            limit: '100',
          })
          if (idLessThan) query.set('idLessThan', idLessThan)

          const path = `/api/v2/spot/trade/fills?${query.toString()}`
          const headers = this.buildHeaders(credentials, 'GET', path)
          const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })
          if (!response.ok) break

          const data = (await response.json()) as {
            code: string
            data?: Array<BitgetSpotFill>
            msg?: string
          }
          if (data.code !== '00000') {
            if (data.msg?.toLowerCase().includes('symbol')) break
            break
          }

          const list = data.data ?? []
          if (list.length === 0) break

          allTrades.push(...list.map((trade) => this.normalizeSpotTrade(trade)))

          const nextCursor = list[list.length - 1]?.tradeId ?? ''
          if (!nextCursor || list.length < 100) break
          idLessThan = nextCursor
          await sleep(80)
        }

        windowStart = windowEnd + 1
        await sleep(80)
      }

      await sleep(80)
    }

    return allTrades
  }

  private async fetchFuturesHistory(
    credentials: ExchangeCredentials,
    startTime: number
  ): Promise<ExchangeAdapterTrade[]> {
    const productTypes = ['USDT-FUTURES', 'COIN-FUTURES', 'USDC-FUTURES']
    const allTrades: ExchangeAdapterTrade[] = []
    const now = Date.now()

    for (const productType of productTypes) {
      let windowStart = startTime

      while (windowStart <= now) {
        const windowEnd = Math.min(windowStart + BITGET_WINDOW_MS - 1, now)
        let idLessThan = ''

        for (let page = 0; page < 30; page += 1) {
          const query = new URLSearchParams({
            productType,
            startTime: String(windowStart),
            endTime: String(windowEnd),
            limit: '100',
          })
          if (idLessThan) query.set('idLessThan', idLessThan)

          const path = `/api/v2/mix/order/fill-history?${query.toString()}`
          const headers = this.buildHeaders(credentials, 'GET', path)
          const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })
          if (!response.ok) break

          const data = (await response.json()) as {
            code: string
            data?: {
              fillList?: Array<BitgetFuturesFill> | null
              endId?: string | null
            }
          }
          if (data.code !== '00000') break

          const list = data.data?.fillList ?? []
          if (list.length === 0) break

          allTrades.push(...list.map((trade) => this.normalizeFuturesTrade(trade)))

          const nextCursor = data.data?.endId ?? ''
          if (!nextCursor || list.length < 100) break
          idLessThan = nextCursor
          await sleep(80)
        }

        windowStart = windowEnd + 1
        await sleep(80)
      }
      await sleep(80)
    }

    return allTrades
  }

  async fetchOpenPositions(credentials: ExchangeCredentials): Promise<UnrealizedPosition[]> {
    const query = new URLSearchParams({ productType: 'umcbl' })
    const path = `/api/mix/v1/position/allPosition-v2?${query.toString()}`
    const headers = this.buildHeaders(credentials, 'GET', path)
    const response = await fetchWithRetry(`${BASE_URL}${path}`, { headers })

    if (!response.ok) return []

    const data = (await response.json()) as { code: string; data?: BitgetPosition[] }
    if (data.code !== '00000') return []

    return (data.data ?? [])
      .filter((position) => Math.abs(parseFloat(position.total ?? '0')) > 0)
      .map((position) => ({
        symbol: (position.symbol ?? '').replace(/_/g, ''),
        side: (position.holdSide ?? '').toLowerCase() === 'short' ? 'short' : 'long',
        size: Math.abs(parseFloat(position.total ?? '0')),
        entryPrice: parseFloat(position.averageOpenPrice ?? '0'),
        markPrice: parseFloat(position.markPrice ?? '0'),
        unrealizedPnl: parseFloat(position.unrealizedPL ?? '0'),
        leverage: parseFloat(position.leverage ?? '0') || 1,
        tradeType: 'futures',
      }))
  }

  async fetchBalances(credentials: ExchangeCredentials): Promise<AssetBalance[]> {
    const spotPath = '/api/v2/spot/account/assets'
    const spotHeaders = this.buildHeaders(credentials, 'GET', spotPath)
    const spotResponse = await fetchWithRetry(`${BASE_URL}${spotPath}`, { headers: spotHeaders })

    if (!spotResponse.ok) return []

    const spotData = (await spotResponse.json()) as {
      code: string
      data?: BitgetBalance[] | { list?: BitgetBalance[] | null } | null
    }
    if (spotData.code !== '00000') return []

    const rows = Array.isArray(spotData.data)
      ? spotData.data
      : Array.isArray(spotData.data?.list)
        ? spotData.data.list
        : []

    const balances: AssetBalance[] = []
    for (const balance of rows) {
      const free = parseFloat(balance.available ?? balance.free ?? '0')
      const locked = parseFloat(balance.frozen ?? balance.locked ?? balance.lock ?? '0')
      const total = free + locked
      if (total <= 0) continue
      const asset = balance.coinName ?? balance.coin ?? ''
      if (!asset) continue
      const price = await this.getUsdPrice(asset)
      balances.push({
        asset,
        free,
        locked,
        usdValue: total * price,
      })
    }

    return balances
  }

  private normalizeSpotTrade(trade: BitgetSpotFill): ExchangeAdapterTrade {
    const side = (trade.side ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy'
    const fee = trade.feeDetail?.totalFee ? parseFloat(trade.feeDetail.totalFee) : 0
    return {
      external_trade_id: trade.tradeId,
      symbol: (trade.symbol ?? '').replace(/_/g, ''),
      side,
      quantity: parseFloat(trade.size ?? '0'),
      price: parseFloat(trade.priceAvg ?? '0'),
      fee,
      fee_currency: trade.feeDetail?.feeCoin ?? 'USDT',
      realized_pnl: null,
      funding_fee: 0,
      income_type: null,
      trade_type: 'spot',
      traded_at: new Date(parseInt(trade.cTime ?? String(Date.now()), 10)).toISOString(),
      raw_data: trade as unknown as Record<string, unknown>,
    }
  }

  private normalizeFuturesTrade(trade: BitgetFuturesFill): ExchangeAdapterTrade {
    const fee = trade.fee ? Math.abs(parseFloat(trade.fee)) : 0
    const pnl = trade.pnl ? parseFloat(trade.pnl) : null

    return {
      external_trade_id: trade.tradeId ?? trade.orderId ?? `futures_${trade.cTime ?? Date.now()}`,
      symbol: (trade.symbol ?? '').replace(/_/g, ''),
      side: (trade.side ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy',
      quantity: Math.abs(parseFloat(trade.size ?? trade.baseVolume ?? '0')),
      price: parseFloat(trade.price ?? trade.priceAvg ?? '0'),
      fee,
      fee_currency: trade.feeCoin ?? trade.marginCoin ?? 'USDT',
      realized_pnl: pnl,
      funding_fee: 0,
      income_type: trade.tradeScope ?? 'fill_history',
      trade_type: 'futures',
      traded_at: new Date(parseInt(trade.cTime ?? String(Date.now()), 10)).toISOString(),
      raw_data: trade as unknown as Record<string, unknown>,
    }
  }

  private async getUsdPrice(asset: string): Promise<number> {
    if (asset === 'USDT' || asset === 'USDC' || asset === 'USD') return 1

    try {
      const query = new URLSearchParams({ symbol: `${asset}USDT` })
      const path = `/api/v2/spot/market/tickers?${query.toString()}`
      const response = await fetchWithRetry(`${BASE_URL}${path}`)
      if (!response.ok) return 0
      const data = (await response.json()) as {
        code: string
        data?: BitgetTicker[] | { list?: BitgetTicker[] | null } | BitgetTicker | null
      }
      if (data.code !== '00000') return 0

      const tickerData = data.data
      let ticker: BitgetTicker | undefined

      if (Array.isArray(tickerData)) {
        ticker = tickerData[0]
      } else if (tickerData && typeof tickerData === 'object' && 'list' in tickerData) {
        const list = tickerData.list
        ticker = Array.isArray(list) ? list[0] : undefined
      } else if (tickerData && typeof tickerData === 'object') {
        ticker = tickerData as BitgetTicker
      }

      const rawPrice = ticker?.lastPr ?? ticker?.closePr ?? ticker?.close
      return rawPrice ? parseFloat(rawPrice) : 0
    } catch {
      return 0
    }
  }
}

type BitgetSpotFill = {
  tradeId: string
  symbol: string
  side: string
  size: string
  priceAvg: string
  feeDetail?: {
    feeCoin?: string
    totalFee?: string
  }
  cTime: string
}

type BitgetFuturesFill = {
  tradeId?: string
  orderId?: string
  symbol?: string
  side?: string
  size?: string
  baseVolume?: string
  price?: string
  priceAvg?: string
  fee?: string
  feeCoin?: string
  marginCoin?: string
  pnl?: string
  tradeScope?: string
  cTime?: string
}

type BitgetBalance = {
  coinName?: string
  coin?: string
  available?: string
  free?: string
  frozen?: string
  locked?: string
  lock?: string
}

type BitgetTicker = {
  lastPr?: string
  closePr?: string
  close?: string
}

type BitgetPosition = {
  symbol: string
  holdSide: string
  total: string
  averageOpenPrice: string
  markPrice: string
  unrealizedPL: string
  leverage: string
}
