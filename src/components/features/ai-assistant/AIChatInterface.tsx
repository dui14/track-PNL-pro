'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChatMessage } from '@/components/chat/ChatMessage'
import type { AgentThinkingLink, AgentThinkingStep } from '@/components/chat/AgentThinkingPanel'
import type {
  AgentAnalysisStep,
  ChatMessage as ChatMessageModel,
  ChatMessageAnalysisMeta,
} from '@/lib/types'

type StreamEvent = {
  type?: string
  payload?: Record<string, unknown>
  content?: string
  conversationId?: string
  error?: string
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getEventPayload(event: StreamEvent): Record<string, unknown> {
  if (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) {
    return event.payload
  }

  return event as Record<string, unknown>
}

function getFallbackToolLabel(tool: string): string {
  if (tool === 'get_trade_history') return 'Đang lấy lịch sử giao dịch...'
  if (tool === 'get_pnl_stats') return 'Đang tính toán thống kê PNL...'
  if (tool === 'get_market_quotes') return 'Đang lấy giá thị trường...'
  if (tool === 'get_crypto_news') return 'Đang tìm tin tức thị trường...'
  return `Đang chạy ${tool}...`
}

function getElapsedSeconds(startedAt: number): number {
  return Math.max(1, Math.floor((Date.now() - startedAt) / 1000))
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  return null
}

function readThinkingLinks(value: unknown): AgentThinkingLink[] | undefined {
  if (!Array.isArray(value)) return undefined

  const links: AgentThinkingLink[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }

    const record = item as Record<string, unknown>
    const url = readText(record.url)
    if (!url) {
      continue
    }

    links.push({
      title: readText(record.title) ?? 'Chi tiet',
      url,
      source: readText(record.source) ?? undefined,
    })
  }

  return links.length > 0 ? links : undefined
}

function readAnalysisMeta(value: unknown): ChatMessageAnalysisMeta | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const raw = value as Record<string, unknown>
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  const steps: AgentAnalysisStep[] = []

  for (const rawStep of rawSteps) {
    if (!rawStep || typeof rawStep !== 'object' || Array.isArray(rawStep)) {
      continue
    }

    const step = rawStep as Record<string, unknown>
    const type = readText(step.type)

    if (type === 'thinking_start' || type === 'thinking_step') {
      const message = readText(step.message)
      if (message) {
        steps.push({ type, message })
      }
      continue
    }

    if (type === 'tool') {
      const tool = readText(step.tool)
      const label = readText(step.label)
      const status = readText(step.status)
      if (!tool || !label || (status !== 'loading' && status !== 'done')) {
        continue
      }

      steps.push({
        type: 'tool',
        tool,
        label,
        status,
        summary: readText(step.summary) ?? undefined,
        links: readThinkingLinks(step.links),
      })
    }
  }

  if (steps.length === 0) {
    return null
  }

  const elapsedSeconds = readNumber(raw.elapsedSeconds)
  const completedAt = readText(raw.completedAt) ?? undefined
  const normalizedElapsedSeconds =
    typeof elapsedSeconds === 'number' && elapsedSeconds > 0 ? elapsedSeconds : undefined

  return {
    steps,
    elapsedSeconds: normalizedElapsedSeconds,
    completedAt,
  }
}

function mapAnalysisStepsToThinkingSteps(
  steps: AgentAnalysisStep[],
  messageId: string
): AgentThinkingStep[] {
  return steps.map((step, index) => {
    const id = `analysis-${messageId}-${index}`

    if (step.type === 'thinking_start' || step.type === 'thinking_step') {
      return {
        id,
        type: step.type,
        message: step.message,
      }
    }

    return {
      id,
      type: 'tool',
      tool: step.tool,
      label: step.label,
      status: step.status,
      summary: step.summary,
      links: step.links,
    }
  })
}

export type AIModelOption = {
  id: string
  label: string
}

export type AIChatInterfaceProps = {
  modelOptions: AIModelOption[]
  defaultModelId: string
}

export function AIChatInterface({
  modelOptions,
  defaultModelId,
}: AIChatInterfaceProps): React.JSX.Element {
  const preferredModel =
    modelOptions.find((option) => option.id === defaultModelId)?.id ??
    modelOptions[0]?.id ??
    defaultModelId

  const router = useRouter()
  const searchParams = useSearchParams()
  const convParam = searchParams.get('conv')

  const [activeConvId, setActiveConvId] = useState<string | null>(convParam)
  const [messages, setMessages] = useState<ChatMessageModel[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [convTitle, setConvTitle] = useState<string | null>(null)
  const [thinkingSteps, setThinkingSteps] = useState<AgentThinkingStep[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [collapsedByMessageId, setCollapsedByMessageId] = useState<Record<string, boolean>>({})
  const [thinkingMessageId, setThinkingMessageId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState(preferredModel)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const thinkingStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setActiveConvId(convParam)
  }, [convParam])

  useEffect(() => {
    if (!activeConvId) {
      setMessages([])
      setConvTitle(null)
      return
    }
    setLoadingMessages(true)
    fetch(`/api/ai/conversations/${activeConvId}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setMessages(data.data ?? [])
        else setMessages([])
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingMessages(false))
  }, [activeConvId])

  useEffect(() => {
    if (!isThinking) return
    const intervalId = window.setInterval(() => {
      const startedAt = thinkingStartedAtRef.current
      if (!startedAt) return
      setElapsedTime(getElapsedSeconds(startedAt))
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [isThinking])

  useEffect(() => {
    if (messages.length === 0) return

    setCollapsedByMessageId((prev) => {
      let changed = false
      const next = { ...prev }

      for (const message of messages) {
        const analysisMeta = readAnalysisMeta(message.analysis_meta)
        if (!analysisMeta) {
          continue
        }

        if (typeof next[message.id] !== 'boolean') {
          next[message.id] = true
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [messages])

  useEffect(() => {
    setSelectedModel((prev) => {
      if (modelOptions.some((option) => option.id === prev)) {
        return prev
      }

      return preferredModel
    })
  }, [modelOptions, preferredModel])

  const toggleThinkingCollapsed = useCallback(
    (messageId: string): void => {
      if (isThinking && thinkingMessageId === messageId) {
        return
      }

      setCollapsedByMessageId((prev) => ({
        ...prev,
        [messageId]: !(prev[messageId] ?? false),
      }))
    },
    [isThinking, thinkingMessageId]
  )

  const handleSend = useCallback(async (): Promise<void> => {
    const trimmed = inputValue.trim()
    if (!trimmed || isSending) return

    const tempUserMsg: ChatMessageModel = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId ?? '',
      role: 'user',
      content: trimmed,
      tokens_used: null,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, tempUserMsg])
    setInputValue('')
    setIsSending(true)

    const tempAssistantMsg: ChatMessageModel = {
      id: `temp-assistant-${Date.now()}`,
      conversation_id: activeConvId ?? '',
      role: 'assistant',
      content: '',
      tokens_used: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempAssistantMsg])

    const turnStartedAt = Date.now()
    let stepIndex = 0
    let contentRafId: number | null = null
    let queuedAssistantContent: string | null = null

    const makeStepId = (prefix: string): string => {
      stepIndex += 1
      return `${prefix}-${turnStartedAt}-${stepIndex}`
    }

    const setThinkingPanelCollapsed = (collapsed: boolean): void => {
      setCollapsedByMessageId((prev) => {
        if (prev[tempAssistantMsg.id] === collapsed) {
          return prev
        }

        return {
          ...prev,
          [tempAssistantMsg.id]: collapsed,
        }
      })
    }

    const patchTempAssistantMessage = (nextContent: string): void => {
      setMessages((prev) => {
        const index = prev.findIndex((message) => message.id === tempAssistantMsg.id)
        if (index < 0) {
          return prev
        }

        const currentMessage = prev[index]
        if (currentMessage.content === nextContent) {
          return prev
        }

        const next = [...prev]
        next[index] = {
          ...currentMessage,
          content: nextContent,
        }

        return next
      })
    }

    const flushQueuedAssistantContent = (): void => {
      if (queuedAssistantContent === null) {
        return
      }

      const nextContent = queuedAssistantContent
      queuedAssistantContent = null
      patchTempAssistantMessage(nextContent)
    }

    const scheduleAssistantContentFlush = (): void => {
      if (contentRafId !== null) {
        return
      }

      contentRafId = window.requestAnimationFrame(() => {
        contentRafId = null
        flushQueuedAssistantContent()
      })
    }

    const stopAssistantContentFlush = (): void => {
      if (contentRafId !== null) {
        window.cancelAnimationFrame(contentRafId)
        contentRafId = null
      }

      flushQueuedAssistantContent()
    }

    setThinkingMessageId(tempAssistantMsg.id)
    setThinkingSteps([])
    setIsThinking(true)
    setElapsedTime(0)
    setThinkingPanelCollapsed(false)
    thinkingStartedAtRef.current = turnStartedAt

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConvId,
          model: selectedModel,
        }),
      })

      if (!res.ok) {
        let apiError = 'CHAT_REQUEST_FAILED'
        try {
          const payload = (await res.json()) as { error?: string }
          if (typeof payload.error === 'string' && payload.error.length > 0) {
            apiError = payload.error
          }
        } catch {}
        throw new Error(apiError)
      }

      if (!res.body) {
        throw new Error('EMPTY_STREAM')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let newConvId: string | null = null
      let streamError: string | null = null
      let doneReceived = false
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line.startsWith('data:')) continue

          const payloadText = line.slice(5).trim()
          if (!payloadText) continue
          if (payloadText === '[DONE]') {
            doneReceived = true
            setIsThinking(false)
            setThinkingPanelCollapsed(true)
            setElapsedTime(getElapsedSeconds(turnStartedAt))
            thinkingStartedAtRef.current = null
            continue
          }

          try {
            const parsed = JSON.parse(payloadText) as unknown
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              continue
            }

            const event = parsed as StreamEvent
            const eventPayload = getEventPayload(event)

            const conversationId =
              typeof eventPayload.conversationId === 'string'
                ? eventPayload.conversationId
                : typeof event.conversationId === 'string'
                  ? event.conversationId
                  : null

            if (conversationId && conversationId.length > 0) {
              newConvId = conversationId
            }

            if (event.type === 'error') {
              const payloadMessage = readText(eventPayload.message)
              const eventMessage = readText(event.error)
              if (payloadMessage) {
                streamError = payloadMessage
              } else if (eventMessage) {
                streamError = eventMessage
              }
              setIsThinking(false)
              setElapsedTime(getElapsedSeconds(turnStartedAt))
              thinkingStartedAtRef.current = null
            }

            if (event.type === 'thinking_start') {
              const message = readText(eventPayload.message) ?? 'Đang suy nghĩ...'
              setThinkingSteps((prev) => [
                ...prev,
                {
                  id: makeStepId('thinking-start'),
                  type: 'thinking_start',
                  message,
                },
              ])
            }

            if (event.type === 'thinking_step') {
              const message = readText(eventPayload.message)
              if (message) {
                setThinkingSteps((prev) => [
                  ...prev,
                  {
                    id: makeStepId('thinking-step'),
                    type: 'thinking_step',
                    message,
                  },
                ])
              }
            }

            if (event.type === 'tool_start') {
              const tool = readText(eventPayload.tool) ?? 'tool'
              const label = readText(eventPayload.label) ?? getFallbackToolLabel(tool)

              setThinkingSteps((prev) => [
                ...prev,
                {
                  id: makeStepId('tool'),
                  type: 'tool',
                  tool,
                  label,
                  status: 'loading',
                },
              ])
            }

            if (event.type === 'tool_done') {
              const tool = readText(eventPayload.tool) ?? 'tool'
              const summary = readText(eventPayload.summary) ?? undefined
              const links = readThinkingLinks(eventPayload.links)

              setThinkingSteps((prev) => {
                const next = [...prev]

                for (let idx = next.length - 1; idx >= 0; idx -= 1) {
                  const step = next[idx]
                  if (step.type === 'tool' && step.tool === tool && step.status === 'loading') {
                    next[idx] = {
                      ...step,
                      status: 'done',
                      summary,
                      links,
                    }
                    return next
                  }
                }

                return [
                  ...next,
                  {
                    id: makeStepId('tool'),
                    type: 'tool',
                    tool,
                    label: getFallbackToolLabel(tool),
                    status: 'done',
                    summary,
                    links,
                  },
                ]
              })
            }

            const contentPart =
              event.type === 'content_chunk' && typeof eventPayload.text === 'string'
                ? eventPayload.text
                : typeof event.content === 'string'
                  ? event.content
                  : ''

            if (contentPart) {
              fullContent += contentPart
              queuedAssistantContent = fullContent
              scheduleAssistantContentFlush()
            }

            if (event.type === 'done') {
              doneReceived = true
              setIsThinking(false)
              setThinkingPanelCollapsed(true)
              setElapsedTime(getElapsedSeconds(turnStartedAt))
              thinkingStartedAtRef.current = null
            }
          } catch {}
        }
      }

      stopAssistantContentFlush()

      if (!doneReceived && !streamError && fullContent.length === 0) {
        streamError = 'STREAM_TERMINATED'
      }

      if (streamError && fullContent.length === 0) {
        patchTempAssistantMessage(`Error: ${streamError}`)
      }

      if (newConvId) {
        if (newConvId !== activeConvId) {
          setActiveConvId(newConvId)
          router.replace(`/ai-assistant?conv=${newConvId}`)
          if (!convTitle) setConvTitle(trimmed.slice(0, 60))
        }
        window.dispatchEvent(new CustomEvent('ai-conv-change'))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'INTERNAL_ERROR'
      stopAssistantContentFlush()
      patchTempAssistantMessage(`Error: ${message}`)
    } finally {
      stopAssistantContentFlush()
      setIsThinking(false)
      setElapsedTime((prev) => (prev > 0 ? prev : getElapsedSeconds(turnStartedAt)))
      thinkingStartedAtRef.current = null
      setIsSending(false)
    }
  }, [inputValue, isSending, activeConvId, convTitle, router, selectedModel])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-background-dark overflow-hidden">
      <header className="h-14 border-b border-neutral-border flex items-center px-6 shrink-0 bg-background-dark/80 backdrop-blur-md z-10">
        <span className="material-symbols-outlined text-primary mr-3 text-lg">smart_toy</span>
        <h2 className="text-slate-100 font-bold text-sm tracking-tight truncate">
          {convTitle ?? (activeConvId ? 'Conversation' : 'New Conversation')}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-36">
        {loadingMessages && (
          <div className="flex justify-center py-8">
            <span className="material-symbols-outlined animate-spin text-primary/40 text-3xl">
              refresh
            </span>
          </div>
        )}
        {!loadingMessages && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <span className="material-symbols-outlined text-primary/30 text-6xl">smart_toy</span>
            <p className="text-slate-500 text-sm max-w-sm leading-relaxed">
              Ask me about market trends, technical analysis, PNL performance, or trading strategies.
            </p>
          </div>
        )}
        {messages.map((message) => {
          const analysisMeta = readAnalysisMeta(message.analysis_meta)
          const isActiveThinkingMessage =
            message.role === 'assistant' && message.id === thinkingMessageId
          const shouldShowStoredAnalysis =
            message.role === 'assistant' && !isActiveThinkingMessage && Boolean(analysisMeta)
          const showThinkingPanel =
            isActiveThinkingMessage
              ? isThinking || thinkingSteps.length > 0
              : shouldShowStoredAnalysis

          const panelSteps = isActiveThinkingMessage
            ? thinkingSteps
            : analysisMeta
              ? mapAnalysisStepsToThinkingSteps(analysisMeta.steps, message.id)
              : []

          const panelElapsedTime = isActiveThinkingMessage
            ? elapsedTime
            : analysisMeta?.elapsedSeconds ?? 1

          const panelCollapsed =
            collapsedByMessageId[message.id] ??
            (isActiveThinkingMessage ? false : Boolean(analysisMeta))

          const toggleCollapsed = (): void => {
            toggleThinkingCollapsed(message.id)
          }

          return (
            <ChatMessage
              key={message.id}
              message={message}
              showThinkingPanel={showThinkingPanel}
              thinkingSteps={showThinkingPanel ? panelSteps : []}
              isThinking={showThinkingPanel ? isActiveThinkingMessage && isThinking : false}
              elapsedTime={showThinkingPanel ? panelElapsedTime : 0}
              thinkingCollapsed={showThinkingPanel ? panelCollapsed : false}
              onToggleThinkingCollapsed={showThinkingPanel ? toggleCollapsed : undefined}
            />
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark via-background-dark/95 to-transparent">
        <div className="max-w-3xl mx-auto flex items-center gap-3 bg-neutral-dark border border-neutral-border rounded-2xl px-4 py-3 shadow-xl">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isSending}
            className="h-9 max-w-[180px] rounded-lg border border-neutral-border bg-background-dark px-3 text-xs text-slate-200 outline-none transition-colors focus:border-primary disabled:opacity-60"
          >
            {modelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your trades, PNL, or market analysis..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending}
            className="size-9 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <span className="material-symbols-outlined text-base">
              {isSending ? 'hourglass_top' : 'send'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
