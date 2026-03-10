# Chat UI Architecture

## Overview

The Ask AI page features a ChatGPT-style interface with streaming responses, conversation history, and a sidebar list of past conversations.

## Layout

```
+------------------+--------------------------------------+
|                  |                                      |
| Conversation     |           Chat Window                |
| List             |                                      |
|                  |  +---------------------------------+ |
| [New Chat]       |  | Message bubble (user)           | |
|                  |  +---------------------------------+ |
| > PNL Analysis   |  +---------------------------------+ |
|   March          |  | Message bubble (assistant)      | |
|                  |  +---------------------------------+ |
| > Strategy for   |  |                                 | |
|   BTC breakout   |  |                                 | |
|                  |  |           ...                   | |
| > Win rate       |  |                                 | |
|   question       |  +---------------------------------+ |
|                  |  | [Type your message...    ] [->] | |
+------------------+--------------------------------------+
```

On mobile: conversation list collapses into a top sheet or drawer.

## Component Tree

```
AskPage (Server Component)
  └── ChatInterface (Client Component)
        ├── ConversationList (Client Component)
        │     └── ConversationItem[] (Client Component)
        ├── ChatWindow (Client Component)
        │     └── ChatMessage[] (Client Component)
        └── ChatInput (Client Component)
```

## ChatInterface

```typescript
'use client'

import { useState } from 'react'
import { ConversationList } from './ConversationList'
import { ChatWindow } from './ChatWindow'
import { ChatInput } from './ChatInput'
import { useChatStream } from '@/lib/hooks/useChatStream'
import { useConversations } from '@/lib/hooks/useConversations'
import type { ChatMessage, Conversation } from '@/lib/types'

export function ChatInterface() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const { conversations, isLoading } = useConversations()
  const { sendMessage, isStreaming } = useChatStream({
    onDelta: (delta) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }]
        }
        return [...prev, { id: 'streaming', role: 'assistant', content: delta, created_at: new Date().toISOString() }]
      })
    },
    onDone: (conversationId) => {
      setActiveConversationId(conversationId)
    }
  })

  async function handleSend(message: string) {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      created_at: new Date().toISOString()
    }])

    await sendMessage({ conversationId: activeConversationId, message })
  }

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={(id) => setActiveConversationId(id)}
        onNew={() => { setActiveConversationId(null); setMessages([]) }}
      />
      <div className="flex flex-col flex-1">
        <ChatWindow messages={messages} isStreaming={isStreaming} />
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  )
}
```

## ChatMessage Component

```typescript
'use client'

import { cn } from '@/lib/utils/cn'
import type { ChatMessage as ChatMessageType } from '@/lib/types'

type ChatMessageProps = {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3 px-4 py-3 max-w-3xl mx-auto w-full',
      isUser ? 'flex-row-reverse' : 'flex-row'
    )}>
      <div className={cn('flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}>
        {isUser ? 'U' : 'AI'}
      </div>
      <div className={cn('rounded-2xl px-4 py-2 max-w-[80%] text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'bg-muted text-foreground rounded-tl-sm'
      )}>
        {message.content}
      </div>
    </div>
  )
}
```

## ChatInput Component

```typescript
'use client'

import { useState, useRef } from 'react'

type ChatInputProps = {
  onSend: (message: string) => void
  disabled: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div className="border-t border-border p-4">
      <div className="flex gap-2 items-end max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your trading performance..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-muted rounded-xl px-4 py-3 text-sm outline-none
                     focus:ring-1 focus:ring-primary disabled:opacity-50 max-h-32
                     overflow-y-auto scrollbar-thin"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground
                     flex items-center justify-center disabled:opacity-50 hover:bg-primary/90
                     transition-colors"
        >
          ->
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
```

## Streaming Hook

```typescript
'use client'

type UseChatStreamOptions = {
  onDelta: (delta: string) => void
  onDone: (conversationId: string) => void
}

export function useChatStream({ onDelta, onDone }: UseChatStreamOptions) {
  const [isStreaming, setIsStreaming] = useState(false)

  async function sendMessage(payload: { conversationId: string | null; message: string }) {
    setIsStreaming(true)

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.body) {
      setIsStreaming(false)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const raw = line.slice(6)
        const parsed = JSON.parse(raw) as { type: string; content?: string; conversationId?: string }

        if (parsed.type === 'delta' && parsed.content) {
          onDelta(parsed.content)
        } else if (parsed.type === 'done' && parsed.conversationId) {
          onDone(parsed.conversationId)
        }
      }
    }

    setIsStreaming(false)
  }

  return { sendMessage, isStreaming }
}
```

## Auto-scroll Behavior

The chat window auto-scrolls to the latest message:

```typescript
const bottomRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages])
```

## Conversation List

- Lists all conversations sorted by `updated_at DESC`
- Active conversation is highlighted
- Shows first 40 characters of title
- "New Chat" button starts fresh session
- Lazy loads messages when conversation selected

## Empty State

When no messages exist, show a centered prompt:

```
         [AI icon]
    Ask me anything about
       your trading

  "What is my win rate this week?"
  "How can I improve my strategy?"
  "Explain my biggest loss trade"
```
