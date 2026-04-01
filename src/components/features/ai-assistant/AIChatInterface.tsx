'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ChatMessage } from '@/lib/types'

export function AIChatInterface(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()
  const convParam = searchParams.get('conv')

  const [activeConvId, setActiveConvId] = useState<string | null>(convParam)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [convTitle, setConvTitle] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  const handleSend = useCallback(async (): Promise<void> => {
    const trimmed = inputValue.trim()
    if (!trimmed || isSending) return

    const tempUserMsg: ChatMessage = {
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

    const tempAssistantMsg: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      conversation_id: activeConvId ?? '',
      role: 'assistant',
      content: '',
      tokens_used: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempAssistantMsg])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversationId: activeConvId }),
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
            continue
          }

          try {
            const chunk = JSON.parse(payloadText) as {
              type?: string
              content?: string
              conversationId?: string
              error?: string
            }

            if (typeof chunk.conversationId === 'string' && chunk.conversationId.length > 0) {
              newConvId = chunk.conversationId
            }

            if (typeof chunk.error === 'string' && chunk.error.length > 0) {
              streamError = chunk.error
            }

            const contentPart = typeof chunk.content === 'string' ? chunk.content : ''
            if (contentPart) {
              fullContent += contentPart
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantMsg.id ? { ...m, content: fullContent } : m
                )
              )
            }

            if (chunk.type === 'done' && typeof chunk.conversationId === 'string') {
              newConvId = chunk.conversationId
            }
          } catch {}
        }
      }

      if (!doneReceived && !streamError && fullContent.length === 0) {
        streamError = 'STREAM_TERMINATED'
      }

      if (streamError && fullContent.length === 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantMsg.id ? { ...m, content: `Error: ${streamError}` } : m
          )
        )
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
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantMsg.id ? { ...m, content: `Error: ${message}` } : m
        )
      )
    } finally {
      setIsSending(false)
    }
  }, [inputValue, isSending, activeConvId, convTitle, router])

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
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <span className="material-symbols-outlined text-primary text-base">smart_toy</span>
              </div>
            )}
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-primary text-white rounded-tr-none'
                  : 'bg-neutral-dark border border-neutral-border text-slate-200 rounded-tl-none'
              }`}
            >
              {message.content || (
                <span className="inline-flex gap-1 items-center text-slate-400">
                  <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                  <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                  <span className="size-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                </span>
              )}
            </div>
            {message.role === 'user' && (
              <div className="size-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                <span className="material-symbols-outlined text-primary text-base">person</span>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background-dark via-background-dark/95 to-transparent">
        <div className="max-w-3xl mx-auto flex items-center gap-3 bg-neutral-dark border border-neutral-border rounded-2xl px-4 py-3 shadow-xl">
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
