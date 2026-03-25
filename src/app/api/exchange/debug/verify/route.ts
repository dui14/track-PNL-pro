import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { ProxyAgent } from 'undici'
import { signOkxRequest } from '@/lib/adapters/okxApi'
import {
  ExchangeDebugVerifySchema,
  type ExchangeDebugVerifyInput,
} from '@/lib/validators/exchangeDebug'

type ProxyConfig = {
  proxy?: string
  proxyUrl?: string
  proxyUsername?: string
  proxyPassword?: string
}

type DebugVerifyResult = {
  ok: boolean
  upstreamStatus: number
  exchangeCode: string | number | null
  exchangeMessage: string | null
  requestPath: string
  payload: unknown
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function jsonWithCors(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init)
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

function signBinance(query: string, secret: string): string {
  return createHmac('sha256', secret).update(query).digest('hex')
}

function signBybit(
  apiKey: string,
  secret: string,
  timestamp: number,
  recvWindow: number,
  queryString: string
): string {
  const payload = `${timestamp}${apiKey}${recvWindow}${queryString}`
  return createHmac('sha256', secret).update(payload).digest('hex')
}

function signBitget(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): string {
  const payload = `${timestamp}${method.toUpperCase()}${requestPath}${body}`
  return createHmac('sha256', secret).update(payload).digest('base64')
}

function normalizeBaseUrl(input: string | undefined, fallback: string): string {
  const raw = input?.trim()
  if (!raw) return fallback
  return raw.replace(/\/+$/, '')
}

function isValidProxyFormat(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^[^:\s]+:\d+(?::[^:\s]+(?::.+)?)?$/.test(value)
}

function resolveProxyUrl(config: ProxyConfig): string | null {
  const rawProxy = config.proxy?.trim()
  const rawProxyUrl = config.proxyUrl?.trim()
  const candidate = rawProxy || rawProxyUrl
  if (!candidate) return null
  if (!isValidProxyFormat(candidate)) return null

  if (rawProxy && !rawProxy.includes('://')) {
    const parts = rawProxy.split(':')
    if (parts.length >= 2) {
      const host = parts[0]
      const port = parts[1]
      const username = parts.length >= 3 ? parts[2] : config.proxyUsername?.trim()
      const password = parts.length >= 4 ? parts.slice(3).join(':') : config.proxyPassword?.trim()

      const parsed = new URL(`http://${host}:${port}`)
      if (username) parsed.username = username
      if (password) parsed.password = password
      return parsed.toString()
    }
  }

  const parsed = new URL(candidate.includes('://') ? candidate : `http://${candidate}`)
  const username = config.proxyUsername?.trim()
  const password = config.proxyPassword?.trim()
  if (username) parsed.username = username
  if (password) parsed.password = password
  return parsed.toString()
}

async function fetchJson(
  url: string,
  init: RequestInit,
  proxyConfig?: ProxyConfig
): Promise<{ status: number; ok: boolean; body: unknown }> {
  const proxyUrl = proxyConfig ? resolveProxyUrl(proxyConfig) : null
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : null
  try {
    const requestInit = {
      ...init,
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit

    const response = await fetch(url, requestInit)
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    return {
      status: response.status,
      ok: response.ok,
      body,
    }
  } finally {
    if (dispatcher) {
      await dispatcher.close()
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function verifyBinance(input: ExchangeDebugVerifyInput): Promise<DebugVerifyResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl, 'https://api.binance.com')
  const recvWindow = input.recvWindow ?? 5000
  const timestamp = Date.now()
  const query = new URLSearchParams({
    recvWindow: String(recvWindow),
    timestamp: String(timestamp),
  })
  query.append('signature', signBinance(query.toString(), input.apiSecret))

  const requestPath = `/api/v3/account?${query.toString()}`
  const { ok, status, body } = await fetchJson(
    `${baseUrl}${requestPath}`,
    {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': input.apiKey,
      },
      cache: 'no-store',
    },
    input
  )

  const record = asRecord(body)
  const exchangeCode = record?.code ?? null
  const exchangeMessage = typeof record?.msg === 'string' ? record.msg : null

  return {
    ok: ok && exchangeCode === null,
    upstreamStatus: status,
    exchangeCode: typeof exchangeCode === 'number' ? exchangeCode : null,
    exchangeMessage,
    requestPath,
    payload: body,
  }
}

async function verifyOkx(input: ExchangeDebugVerifyInput): Promise<DebugVerifyResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl, 'https://www.okx.com')
  const ccy = input.ccy?.trim()
  const requestPath = ccy
    ? `/api/v5/account/balance?ccy=${encodeURIComponent(ccy)}`
    : '/api/v5/account/balance'
  const timestamp = new Date().toISOString()
  const signature = signOkxRequest(timestamp, 'GET', requestPath, '', input.apiSecret)

  const { ok, status, body } = await fetchJson(
    `${baseUrl}${requestPath}`,
    {
      method: 'GET',
      headers: {
        'OK-ACCESS-KEY': input.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': input.passphrase ?? '',
      },
      cache: 'no-store',
    },
    input
  )

  const record = asRecord(body)
  const exchangeCode = record?.code ?? null
  const exchangeMessage = typeof record?.msg === 'string' ? record.msg : null

  return {
    ok: ok && exchangeCode === '0',
    upstreamStatus: status,
    exchangeCode: typeof exchangeCode === 'string' ? exchangeCode : null,
    exchangeMessage,
    requestPath,
    payload: body,
  }
}

async function verifyBybit(input: ExchangeDebugVerifyInput): Promise<DebugVerifyResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl, 'https://api.bybit.com')
  const recvWindow = input.recvWindow ?? 5000
  const accountType = (input.accountType ?? 'UNIFIED').trim()
  const queryString = `accountType=${encodeURIComponent(accountType)}`
  const requestPath = `/v5/account/wallet-balance?${queryString}`
  const timestamp = Date.now()
  const signature = signBybit(input.apiKey, input.apiSecret, timestamp, recvWindow, queryString)

  const { ok, status, body } = await fetchJson(
    `${baseUrl}${requestPath}`,
    {
      method: 'GET',
      headers: {
        'X-BAPI-API-KEY': input.apiKey,
        'X-BAPI-SIGN': signature,
        'X-BAPI-SIGN-TYPE': '2',
        'X-BAPI-TIMESTAMP': String(timestamp),
        'X-BAPI-RECV-WINDOW': String(recvWindow),
      },
      cache: 'no-store',
    },
    input
  )

  const record = asRecord(body)
  const exchangeCode = record?.retCode ?? null
  const exchangeMessage = typeof record?.retMsg === 'string' ? record.retMsg : null

  return {
    ok: ok && exchangeCode === 0,
    upstreamStatus: status,
    exchangeCode: typeof exchangeCode === 'number' ? exchangeCode : null,
    exchangeMessage,
    requestPath,
    payload: body,
  }
}

async function verifyBitget(input: ExchangeDebugVerifyInput): Promise<DebugVerifyResult> {
  const baseUrl = normalizeBaseUrl(input.baseUrl, 'https://api.bitget.com')
  const requestPath = '/api/v2/spot/account/assets'
  const timestamp = Date.now().toString()
  const signature = signBitget(timestamp, 'GET', requestPath, '', input.apiSecret)

  const { ok, status, body } = await fetchJson(
    `${baseUrl}${requestPath}`,
    {
      method: 'GET',
      headers: {
        'ACCESS-KEY': input.apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': input.passphrase ?? '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    },
    input
  )

  const record = asRecord(body)
  const exchangeCode = record?.code ?? null
  const exchangeMessage =
    typeof record?.msg === 'string'
      ? record.msg
      : typeof record?.message === 'string'
        ? record.message
        : null

  return {
    ok: ok && exchangeCode === '00000',
    upstreamStatus: status,
    exchangeCode: typeof exchangeCode === 'string' ? exchangeCode : null,
    exchangeMessage,
    requestPath,
    payload: body,
  }
}

function buildHints(exchange: string, result: DebugVerifyResult): string[] {
  const hints: string[] = []
  if (result.upstreamStatus === 401 || result.upstreamStatus === 403) {
    hints.push('API key khong hop le, bi khoa, hoac bi chan boi IP whitelist.')
  }

  if (exchange === 'binance' && result.exchangeCode === -1021) {
    hints.push('Lech thoi gian may. Dong bo gio he thong hoac tang recvWindow.')
  }

  if (exchange === 'binance' && result.exchangeCode === -1022) {
    hints.push('Sai signature. Kiem tra apiSecret va cach ky query string.')
  }

  if (exchange === 'okx' && result.exchangeCode === '50120') {
    hints.push('Passphrase khong dung voi API key hien tai.')
  }

  if (exchange === 'bybit' && result.exchangeCode === 10003) {
    hints.push('Sai key/secret hoac key khong thuoc domain API dang dung.')
  }

  if (exchange === 'bitget' && result.exchangeCode === '40036') {
    hints.push('Invalid ACCESS-SIGN. Kiem tra timestamp, prehash va secret.')
  }

  if (exchange === 'bitget' && result.exchangeCode === '30032') {
    hints.push('Bitget V1 endpoint da ngung hoat dong. Chuyen sang API v2.')
  }

  if (result.upstreamStatus >= 500) {
    hints.push('Loi ket noi upstream. Neu co IP whitelist, hay thu cau hinh proxy backend.')
  }

  if (!result.ok && hints.length === 0) {
    hints.push('Kiem tra quyen Read-only, IP whitelist va server time.')
  }

  return hints
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonWithCors(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const parsed = ExchangeDebugVerifySchema.safeParse(body)
  if (!parsed.success) {
    return jsonWithCors(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const input = parsed.data

  if ((input.exchange === 'okx' || input.exchange === 'bitget') && !input.passphrase) {
    return jsonWithCors(
      { success: false, data: null, error: 'PASSPHRASE_REQUIRED' },
      { status: 400 }
    )
  }

  try {
    const result =
      input.exchange === 'binance'
        ? await verifyBinance(input)
        : input.exchange === 'okx'
          ? await verifyOkx(input)
          : input.exchange === 'bybit'
            ? await verifyBybit(input)
            : await verifyBitget(input)

    const hints = buildHints(input.exchange, result)

    return jsonWithCors(
      {
        success: true,
        data: {
          exchange: input.exchange,
          verified: result.ok,
          upstreamStatus: result.upstreamStatus,
          exchangeCode: result.exchangeCode,
          exchangeMessage: result.exchangeMessage,
          requestPath: result.requestPath,
          hints,
          payload: result.payload,
        },
        error: null,
      },
      { status: result.ok ? 200 : 400 }
    )
  } catch {
    return jsonWithCors(
      {
        success: false,
        data: null,
        error: 'EXCHANGE_UNREACHABLE',
      },
      { status: 502 }
    )
  }
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}
