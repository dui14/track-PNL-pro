import type { AgentReferenceLink, Result } from '@/lib/types'
import {
  TOOL_DEFINITIONS,
  TOOL_EXCHANGES,
  TOOL_NAMES,
  TOOL_PERIODS,
  type ToolName,
  type ToolExchange,
  type ToolPeriod,
} from '@/lib/tools/definitions'
import { getTradeHistoryTool, getPnlStatsTool } from '@/lib/tools/trade-tool'
import { getCryptoNewsTool } from '@/lib/tools/news-tool'
import { getMarketQuotesTool } from '@/lib/tools/market-tool'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'
const AGENT_DEFAULT_MODEL = 'google/gemini-3-flash-preview'
const AGENT_MAX_STEPS = 5
const MODEL_ENV_KEYS = [
  'MODELS_QWEN',
  'MODELS_CLAUDE',
  'MODELS_GEMINI',
  'MODELS_GROK',
  'MODELS_DEEPSEEK',
  'MODELS_GPT',
] as const

const AGENT_SYSTEM_PROMPT = `
Bạn là AI trading assistant chuyên nghiệp của Track PNL Pro.

## Công cụ bạn có
- get_trade_history: lịch sử giao dịch thực của user
- get_pnl_stats: thống kê PNL, win rate, profit factor
- get_crypto_news: tin tức crypto mới nhất
- get_market_quotes: giá thị trường hiện tại cho vàng, cổ phiếu, chỉ số, forex

## Nguyên tắc bắt buộc
1. LUÔN gọi tool lấy data thật trước khi phân tích — không bịa số
2. Câu hỏi về trade/hiệu suất → gọi get_trade_history + get_pnl_stats
3. Câu hỏi về vàng/cổ phiếu/chỉ số/forex (ví dụ XAUUSD, NVDA) → gọi get_market_quotes
4. Câu hỏi về crypto market/news → gọi get_crypto_news
5. Câu hỏi tổng hợp hiệu suất + thị trường → phối hợp nhiều tools phù hợp

## Cách viết phản hồi

KHÔNG dùng ### hay ** để format — UI tự xử lý markdown.
Viết bằng tiếng Việt, ngắn gọn, đúng trọng tâm.
Xưng "bạn" với user, thân thiện nhưng chuyên nghiệp.

Cấu trúc phản hồi chuẩn khi phân tích trading:

---
NHẬN ĐỊNH CHUNG
[1-2 câu tóm tắt tình hình, có số liệu cụ thể]

HIỆU SUẤT CỦA BẠN
Win rate: X% | Tổng PNL: ±Y USDT | Số lệnh: Z
Trade tốt nhất: [symbol] +X USDT
Trade tệ nhất: [symbol] -Y USDT

SAI LẦM CỤ THỂ (nếu có lỗ)
[Phân tích pattern sai — entry sai, exit sai, hay timing sai]
[Dùng số liệu thật từ trade history]

THỊ TRƯỜNG HÔM NAY
[2-3 điểm tin tức quan trọng nhất, có link nếu có]

KHUYẾN NGHỊ
[Quyết định rõ ràng: NÊN / KHÔNG NÊN giao dịch hôm nay]
[Lý do cụ thể dựa trên data, không nói chung chung]
[Entry point đề xuất nếu NÊN]
---

Nếu user hỏi ngắn (ví dụ "BTC thế nào"), chỉ trả lời phần liên quan,
không cần đủ 5 section. Ưu tiên súc tích và có ích hơn đầy đủ mà rỗng.

Khi user hỏi XAUUSD hoặc NVDA, không được nói là thiếu công cụ.
`

export type AgentHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AgentEvent = {
  type:
    | 'thinking_start'
    | 'tool_start'
    | 'tool_done'
    | 'thinking_step'
    | 'content_chunk'
    | 'done'
    | 'error'
  payload: Record<string, unknown>
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
  summary: string
  links?: AgentReferenceLink[]
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

function getFallbackModel(): string {
  return asOptionalString(process.env.OPENROUTER_MODEL) ?? AGENT_DEFAULT_MODEL
}

function getAvailableModels(): string[] {
  const models = MODEL_ENV_KEYS.map((key) => asOptionalString(process.env[key]))
  const fallbackModel = getFallbackModel()
  const unique = new Set<string>()

  for (const model of models) {
    if (model) {
      unique.add(model)
    }
  }

  unique.add(fallbackModel)
  return Array.from(unique)
}

function resolveAgentModel(requestedModel: string | undefined): string {
  const availableModels = getAvailableModels()
  if (requestedModel && availableModels.includes(requestedModel)) {
    return requestedModel
  }

  return getFallbackModel()
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

function asToolName(value: unknown): ToolName | null {
  if (typeof value !== 'string') return null
  return TOOL_NAMES.includes(value as ToolName) ? (value as ToolName) : null
}

function readNumber(input: Record<string, unknown>, key: string): number | null {
  const value = input[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatNumber(value: number, fractionDigits: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  return safeValue
    .toFixed(fractionDigits)
    .replace(/\.00$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1')
}

function buildToolStartLabel(toolName: ToolName, rawArgs: Record<string, unknown>): string {
  if (toolName === 'get_trade_history') {
    return 'Dang lay lich su giao dich...'
  }

  if (toolName === 'get_pnl_stats') {
    return 'Dang tinh toan thong ke PNL...'
  }

  if (toolName === 'get_market_quotes') {
    const symbols = asOptionalString(rawArgs.symbols) ?? asOptionalString(rawArgs.query) ?? 'thi truong'
    return `Dang lay gia thi truong ${symbols.toUpperCase()}...`
  }

  const query = asOptionalString(rawArgs.query) ?? 'crypto'
  return `Dang tim tin tuc ${query.toUpperCase()}...`
}

function buildToolDoneSummary(
  toolName: ToolName,
  rawArgs: Record<string, unknown>,
  result: Record<string, unknown>
): string {
  if (toolName === 'get_trade_history') {
    const count = Math.max(0, Math.trunc(readNumber(result, 'count') ?? 0))
    const exchange = asOptionalString(rawArgs.exchange) ?? readString(result, 'exchange') ?? 'all'
    return `Lay duoc ${count} giao dich tu ${exchange}`
  }

  if (toolName === 'get_pnl_stats') {
    const winRate = formatNumber(readNumber(result, 'winRate') ?? 0, 2)
    const totalPnl = formatNumber(readNumber(result, 'totalPnl') ?? 0, 2)
    return `Win rate ${winRate}%, tong PNL ${totalPnl} USDT`
  }

  if (toolName === 'get_market_quotes') {
    const count = Math.max(0, Math.trunc(readNumber(result, 'count') ?? 0))
    if (count === 0) {
      return 'Khong lay duoc du lieu gia cho symbol yeu cau'
    }

    const items = Array.isArray(result.items) ? result.items : []
    const symbolList = items
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null
        }
        const record = item as Record<string, unknown>
        return readString(record, 'symbol')
      })
      .filter((symbol): symbol is string => Boolean(symbol))
      .slice(0, 3)

    const suffix = symbolList.length > 0 ? `: ${symbolList.join(', ')}` : ''
    return `Lay duoc ${count} ma gia thi truong${suffix}`
  }

  const count = Math.max(0, Math.trunc(readNumber(result, 'count') ?? 0))
  const query = asOptionalString(rawArgs.query) ?? readString(result, 'query') ?? 'crypto'
  return `Tim duoc ${count} bai lien quan den ${query}`
}

function buildNewsToolLinks(result: Record<string, unknown>): AgentReferenceLink[] {
  const rawItems = Array.isArray(result.items) ? result.items : []
  const links: AgentReferenceLink[] = []

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue
    }

    const item = rawItem as Record<string, unknown>
    const url = asOptionalString(item.link)
    if (!url) {
      continue
    }

    links.push({
      title: asOptionalString(item.title) ?? 'Chi tiet',
      url,
      source: asOptionalString(item.source),
    })

    if (links.length >= 8) {
      break
    }
  }

  return links
}

function buildMarketToolLinks(result: Record<string, unknown>): AgentReferenceLink[] {
  const rawItems = Array.isArray(result.items) ? result.items : []
  const links: AgentReferenceLink[] = []

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      continue
    }

    const item = rawItem as Record<string, unknown>
    const url = asOptionalString(item.url)
    if (!url) {
      continue
    }

    links.push({
      title: asOptionalString(item.symbol) ?? asOptionalString(item.name) ?? 'Market Detail',
      url,
      source: asOptionalString(item.source),
    })

    if (links.length >= 6) {
      break
    }
  }

  return links
}

function emitError(onEvent: (event: AgentEvent) => void, message: string): void {
  onEvent({
    type: 'error',
    payload: { message },
  })
}

async function executeToolCall(
  userId: string,
  toolCall: OpenRouterToolCall,
  rawArgs: Record<string, unknown>,
  toolName: ToolName
): Promise<ExecuteToolCallResult> {
  let result: Record<string, unknown>

  if (toolName === 'get_trade_history') {
    const limit = clampNumber(asOptionalNumber(rawArgs.limit) ?? 20, 1, 50)
    result = await getTradeHistoryTool(userId, {
      exchange: asToolExchange(rawArgs.exchange),
      symbol: asOptionalString(rawArgs.symbol),
      limit,
    })
  } else if (toolName === 'get_pnl_stats') {
    result = await getPnlStatsTool(userId, {
      period: asToolPeriod(rawArgs.period),
      exchange: asToolExchange(rawArgs.exchange),
    })
  } else if (toolName === 'get_market_quotes') {
    result = await getMarketQuotesTool({
      symbols: asOptionalString(rawArgs.symbols),
      query: asOptionalString(rawArgs.query),
    })
  } else {
    const limit = clampNumber(asOptionalNumber(rawArgs.limit) ?? 8, 1, 12)
    result = await getCryptoNewsTool({
      query: asOptionalString(rawArgs.query),
      limit,
    })
  }

  const links =
    toolName === 'get_crypto_news'
      ? buildNewsToolLinks(result)
      : toolName === 'get_market_quotes'
        ? buildMarketToolLinks(result)
        : []

  return {
    toolCallId: toolCall.id,
    payload: JSON.stringify(result),
    summary: buildToolDoneSummary(toolName, rawArgs, result),
    links: links.length > 0 ? links : undefined,
  }
}

async function emitByWords(content: string, onEvent: (event: AgentEvent) => void): Promise<void> {
  const parts = content.match(/\S+\s*/g) ?? [content]

  for (const part of parts) {
    onEvent({
      type: 'content_chunk',
      payload: { text: part },
    })
    await sleep(10)
  }
}

export async function runAgentLoop(
  userMessage: string,
  history: AgentHistoryMessage[],
  userId: string,
  onEvent: (event: AgentEvent) => void,
  requestedModel?: string
): Promise<Result<{ content: string; tokensUsed: number }>> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    emitError(onEvent, 'OPENROUTER_API_KEY_MISSING')
    return { success: false, error: 'OPENROUTER_API_KEY_MISSING' }
  }

  const model = resolveAgentModel(asOptionalString(requestedModel))

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT.trim() },
    ...history.slice(-12).map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userMessage },
  ]

  let tokensUsed = 0

  onEvent({
    type: 'thinking_start',
    payload: {
      message: 'Dang phan tich cau hoi...',
    },
  })

  for (let step = 0; step < AGENT_MAX_STEPS; step += 1) {
    if (step > 0) {
      onEvent({
        type: 'thinking_step',
        payload: {
          message: 'Da co du lieu tu tool, dang tiep tuc suy luan...',
        },
      })
    }

    const response = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'Track PNL Pro',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      const errorMessage = `OPENROUTER_REQUEST_FAILED:${response.status}:${errorText.slice(0, 180)}`
      emitError(onEvent, errorMessage)
      return {
        success: false,
        error: errorMessage,
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
      emitError(onEvent, 'OPENROUTER_EMPTY_RESPONSE')
      return { success: false, error: 'OPENROUTER_EMPTY_RESPONSE' }
    }

    const toolCalls = assistantMessage.tool_calls ?? []
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? '',
        tool_calls: toolCalls,
      })

      for (const toolCall of toolCalls) {
        const toolName = asToolName(toolCall.function.name)
        const rawArgs = parseJsonObject(toolCall.function.arguments)

        if (!toolName) {
          emitError(onEvent, `UNKNOWN_TOOL:${toolCall.function.name}`)
          return { success: false, error: `UNKNOWN_TOOL:${toolCall.function.name}` }
        }

        onEvent({
          type: 'tool_start',
          payload: {
            tool: toolName,
            args: rawArgs,
            label: buildToolStartLabel(toolName, rawArgs),
          },
        })

        const toolResult = await executeToolCall(userId, toolCall, rawArgs, toolName)

        onEvent({
          type: 'tool_done',
          payload: {
            tool: toolName,
            summary: toolResult.summary,
            links: toolResult.links,
          },
        })

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
      emitError(onEvent, 'ASSISTANT_EMPTY_CONTENT')
      return { success: false, error: 'ASSISTANT_EMPTY_CONTENT' }
    }

    if (choice?.finish_reason !== 'stop') {
      const errorMessage = `ASSISTANT_UNEXPECTED_FINISH_REASON:${choice?.finish_reason ?? 'unknown'}`
      emitError(onEvent, errorMessage)
      return { success: false, error: errorMessage }
    }

    await emitByWords(finalContent, onEvent)
    onEvent({
      type: 'done',
      payload: {},
    })

    return {
      success: true,
      data: {
        content: finalContent,
        tokensUsed,
      },
    }
  }

  emitError(onEvent, 'AGENT_LOOP_TIMEOUT')
  return { success: false, error: 'AGENT_LOOP_TIMEOUT' }
}