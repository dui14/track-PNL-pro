import { ProxyAgent } from 'undici'

let proxyAgent: ProxyAgent | null = null
let proxyInitialized = false

function getProxyAgent(): ProxyAgent | null {
  if (proxyInitialized) {
    return proxyAgent
  }

  proxyInitialized = true
  const proxyUrl = process.env.EXCHANGE_PROXY_URL?.trim()
  if (!proxyUrl) {
    return null
  }

  try {
    proxyAgent = new ProxyAgent(proxyUrl)
  } catch (error) {
    console.error('[exchange/httpClient] invalid EXCHANGE_PROXY_URL:', error)
    proxyAgent = null
  }

  return proxyAgent
}

export async function fetchExchange(url: string, init?: RequestInit): Promise<Response> {
  const agent = getProxyAgent()
  if (!agent) {
    return fetch(url, init)
  }

  return fetch(url, { ...(init ?? {}), dispatcher: agent } as RequestInit)
}
