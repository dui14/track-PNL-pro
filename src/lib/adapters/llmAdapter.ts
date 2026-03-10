const LLM_TIMEOUT = 30_000
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-4o-mini'

type LLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type StreamChunk = {
  type: 'delta' | 'done' | 'error'
  content?: string
  conversationId?: string
  tokensUsed?: number
}

type OpenRouterSSEChunk = {
  choices?: {
    delta?: { content?: string }
    finish_reason?: string | null
  }[]
  usage?: {
    total_tokens?: number
  }
}

export async function streamChatCompletion(
  messages: LLMMessage[],
  onChunk: (chunk: StreamChunk) => void
): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT)

  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'aiTrackProfit',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.7,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let fullContent = ''
    let tokensUsed = 0
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6).trim()
        if (data === '[DONE]') continue
        if (!data) continue

        try {
          const parsed = JSON.parse(data) as OpenRouterSSEChunk
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullContent += content
            onChunk({ type: 'delta', content })
          }
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens
          }
        } catch {}
      }
    }

    return { content: fullContent, tokensUsed }
  } finally {
    clearTimeout(timer)
  }
}

export function buildSystemPrompt(): string {
  return `You are an expert crypto trading assistant for aiTrackProfit platform. You help traders analyze their performance, understand PNL, interpret trading metrics, and improve their strategies.
Be concise, data-driven, and educational. Always remind users that crypto trading involves significant risk.
Never provide specific buy/sell signals or guarantee returns.`
}
