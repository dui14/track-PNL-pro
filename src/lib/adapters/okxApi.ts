import { createHmac } from 'crypto'

export type OkxSignedHeadersInput = {
  apiKey: string
  apiSecret: string
  passphrase: string
  method: string
  requestPath: string
  body?: string
  timestamp?: string
}

export function signOkxRequest(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const payload = `${timestamp}${method.toUpperCase()}${requestPath}${body}`
  return createHmac('sha256', apiSecret).update(payload).digest('base64')
}

export function buildOkxSignedHeaders(input: OkxSignedHeadersInput): Record<string, string> {
  const timestamp = input.timestamp ?? new Date().toISOString()
  const body = input.body ?? ''
  const signature = signOkxRequest(
    timestamp,
    input.method,
    input.requestPath,
    body,
    input.apiSecret
  )

  return {
    'OK-ACCESS-KEY': input.apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': input.passphrase,
    'Content-Type': 'application/json',
  }
}
