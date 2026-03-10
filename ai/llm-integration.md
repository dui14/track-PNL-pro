# LLM Integration

## Overview

The AI assistant uses a pluggable LLM adapter that supports multiple providers. The default provider is OpenAI (GPT-4o), with Groq as a faster/cheaper alternative.

## LLM Adapter Interface

```typescript
// src/lib/adapters/llmAdapter.ts

type LLMMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type LLMStreamOptions = {
  model: string
  messages: LLMMessage[]
  maxTokens?: number
  temperature?: number
}

interface LLMAdapter {
  stream(options: LLMStreamOptions): AsyncGenerator<string>
}
```

## OpenAI Adapter

```typescript
// src/lib/adapters/openaiAdapter.ts

const OPENAI_BASE = 'https://api.openai.com/v1'

export const openaiAdapter: LLMAdapter = {
  async *stream({ model, messages, maxTokens = 1000, temperature = 0.7 }) {
    const response = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        stream: true
      })
    })

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI API error: ${response.status}`)
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
        if (raw === '[DONE]') return

        const parsed = JSON.parse(raw) as {
          choices: Array<{ delta: { content?: string } }>
        }
        const delta = parsed.choices[0]?.delta?.content
        if (delta) yield delta
      }
    }
  }
}
```

## AI Service

```typescript
// src/lib/services/aiService.ts

import { openaiAdapter } from '@/lib/adapters/openaiAdapter'
import { chatDb } from '@/lib/db/chatDb'
import { buildSystemPrompt } from './aiPromptBuilder'

const LLM_MODEL = 'gpt-4o'

export async function streamChatResponse(
  userId: string,
  conversationId: string | null,
  userMessage: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<string> {
  const encoder = new TextEncoder()

  function emit(event: object) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }

  // Get or create conversation
  let convId = conversationId
  if (!convId) {
    const conv = await chatDb.createConversation({
      userId,
      title: userMessage.slice(0, 50)
    })
    convId = conv.id
  }

  // Load conversation history (last 20 messages for context window)
  const history = await chatDb.getRecentMessages(convId, 20)

  const systemPrompt = await buildSystemPrompt(userId)

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage }
  ]

  // Save user message
  await chatDb.saveMessage({ conversationId: convId, role: 'user', content: userMessage })

  // Stream LLM response
  let fullResponse = ''

  for await (const delta of openaiAdapter.stream({ model: LLM_MODEL, messages })) {
    fullResponse += delta
    emit({ type: 'delta', content: delta })
  }

  // Save assistant response with token count estimate
  const tokensUsed = Math.ceil(fullResponse.length / 4)
  await chatDb.saveMessage({
    conversationId: convId,
    role: 'assistant',
    content: fullResponse,
    tokensUsed
  })

  emit({ type: 'done', conversationId: convId })

  return convId
}
```

## AI Chat API Route

```typescript
// src/app/api/ai/chat/route.ts

import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { aiService } from '@/lib/services/aiService'
import { ChatRequestSchema } from '@/lib/validators/aiSchemas'
import { rateLimiter } from '@/lib/utils/rateLimit'

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 })
  }

  // Rate limit: 20 messages per hour per user
  const limited = await rateLimiter.check(`ai:${user.id}`, 20, 60 * 60 * 1000)
  if (limited) {
    return new Response(JSON.stringify({ error: 'RATE_LIMITED' }), { status: 429 })
  }

  const body = await req.json()
  const parsed = ChatRequestSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'VALIDATION_ERROR' }), { status: 400 })
  }

  const { conversationId, message } = parsed.data

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await aiService.streamChatResponse(user.id, conversationId, message, controller)
      } catch (e) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Stream failed' })}\n\n`)
        )
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
```

## Supported LLM Models

| Provider | Model | Use Case |
|---|---|---|
| OpenAI | gpt-4o | Primary — best quality |
| OpenAI | gpt-4o-mini | Fast responses, lower cost |
| Groq | llama-3.3-70b-versatile | Alternative — very fast |
| Anthropic | claude-3-5-sonnet-20241022 | Optional — strong reasoning |

Model is configurable via `NEXT_PUBLIC_LLM_MODEL` env var or user settings.

## Token Management

- Max conversation history: last 20 messages (avoid context overflow)
- Max tokens per response: 1000 (configurable)
- Track `tokens_used` in chat_messages for usage monitoring
- Alert if user exceeds monthly token budget (future feature)

## Error Handling

| Error | Response |
|---|---|
| API key invalid | 502 with `LLM_AUTH_ERROR` |
| Model overloaded | 503 with `LLM_UNAVAILABLE` |
| Rate limited by LLM provider | 429 with `RATE_LIMITED` |
| Context too long | Truncate oldest messages, retry |
| Network timeout | Return partial response if any, emit error event |
