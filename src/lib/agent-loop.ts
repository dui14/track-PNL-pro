import type { Result } from '@/lib/types'
import {
  TOOL_DEFINITIONS,
  TOOL_EXCHANGES,
  TOOL_PERIODS,
  type ToolExchange,
  type ToolPeriod,
} from '@/lib/tools/definitions'
import { getTradeHistoryTool, getPnlStatsTool } from '@/lib/tools/trade-tool'
import { getCryptoNewsTool } from '@/lib/tools/news-tool'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'
const AGENT_MODEL = process.env.OPENROUTER_AGENT_MODEL ?? 'openai/gpt-4o-mini'
const AGENT_MAX_STEPS = 5

const AGENT_SYSTEM_PROMPT = `
Ban la AI assistant cua aiTrackProfit.
Nhiem vu:
- Tra loi bang tieng Viet ro rang, ngan gon, tap trung vao du lieu.
- Uu tien du lieu that tu tool get_trade_history, get_pnl_stats, get_crypto_news khi can.
- Neu thieu du lieu thi noi ro gioi han thay vi doan.
- Khong dua ra loi hua loi nhuan, khong khang dinh chac chan mua ban.
- Khi thong tin nhay cam theo thoi gian, uu tien goi tool truoc khi ket luan.
`

export type AgentHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type OpenRouterToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: OpenRouterToolCall[]
}

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      role: 'assistant'
      content?: string | null
      tool_calls?: OpenRouterToolCall[]
    }
  }>
  usage?: {
    total_tokens?: number
  }
}

type ExecuteToolCallResult = {
  toolCallId: string
  payload: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function asToolExchange(value: unknown): ToolExchange | undefined {
  if (typeof value !== 'string') return undefined
  return TOOL_EXCHANGES.includes(value as ToolExchange) ? (value as ToolExchange) : undefined
}

function asToolPeriod(value: unknown): ToolPeriod | undefined {
  if (typeof value !== 'string') return undefined
  return TOOL_PERIODS.includes(value as ToolPeriod) ? (value as ToolPeriod) : undefined
}

async function executeToolCall(
  userId: string,
  toolCall: OpenRouterToolCall
): Promise<ExecuteToolCallResult> {
  const rawArgs = parseJsonObject(toolCall.function.arguments)
  let result: Record<string, unknown>

  if (toolCall.function.name === 'get_trade_history') {
    const limit = clampNumber(asOptionalNumber(rawArgs.limit) ?? 20, 1, 50)
    result = await getTradeHistoryTool(userId, {
      exchange: asToolExchange(rawArgs.exchange),
      symbol: asOptionalString(rawArgs.symbol),
      limit,
    })
  } else if (toolCall.function.name === 'get_pnl_stats') {
    result = await getPnlStatsTool(userId, {
      period: asToolPeriod(rawArgs.period),
      exchange: asToolExchange(rawArgs.exchange),
    })
  } else if (toolCall.function.name === 'get_crypto_news') {
    const limit = clampNumber(asOptionalNumber(rawArgs.limit) ?? 8, 1, 12)
    result = await getCryptoNewsTool({
      query: asOptionalString(rawArgs.query),
      limit,
    })
  } else {
    result = {
      success: false,
      error: 'UNKNOWN_TOOL',
      tool: toolCall.function.name,
    }
  }

  return {
    toolCallId: toolCall.id,
    payload: JSON.stringify(result),
  }
}

async function emitByWords(content: string, onChunk: (content: string) => void): Promise<void> {
  const parts = content.match(/\S+\s*/g) ?? [content]

  for (const part of parts) {
    onChunk(part)
    await sleep(10)
  }
}

export async function runAgentLoop(
  userMessage: string,
  history: AgentHistoryMessage[],
  userId: string,
  onChunk: (content: string) => void
): Promise<Result<{ content: string; tokensUsed: number }>> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY_MISSING' }
  }

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT.trim() },
    ...history.slice(-12).map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userMessage },
  ]

  let tokensUsed = 0

  for (let step = 0; step < AGENT_MAX_STEPS; step += 1) {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'aiTrackProfit',
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `OPENROUTER_REQUEST_FAILED:${response.status}:${errorText.slice(0, 180)}`,
      }
    }

    const payload = (await response.json()) as OpenRouterResponse
    const usageTokens = payload.usage?.total_tokens
    if (typeof usageTokens === 'number' && Number.isFinite(usageTokens)) {
      tokensUsed = usageTokens
    }

    const choice = payload.choices?.[0]
    const assistantMessage = choice?.message

    if (!assistantMessage) {
      return { success: false, error: 'OPENROUTER_EMPTY_RESPONSE' }
    }

    const toolCalls = assistantMessage.tool_calls ?? []
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? '',
        tool_calls: toolCalls,
      })

      const toolResults = await Promise.all(
        toolCalls.map((toolCall) => executeToolCall(userId, toolCall))
      )

      for (const toolResult of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: toolResult.toolCallId,
          content: toolResult.payload,
        })
      }

      continue
    }

    const finalContent = (assistantMessage.content ?? '').trim()
    if (!finalContent) {
      return { success: false, error: 'ASSISTANT_EMPTY_CONTENT' }
    }

    await emitByWords(finalContent, onChunk)

    return {
      success: true,
      data: {
        content: finalContent,
        tokensUsed,
      },
    }
  }

  return { success: false, error: 'AGENT_LOOP_TIMEOUT' }
}