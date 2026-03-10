# Chat History Storage

## Overview

Chat histories are stored in Supabase PostgreSQL in two tables:
- `chat_conversations` — conversation threads
- `chat_messages` — individual messages within threads

Row Level Security ensures users can only access their own conversations.

## Database Queries Module

```typescript
// src/lib/db/chatDb.ts

import { createSupabaseServerClient } from './supabase-server'
import type { Result } from '@/lib/types'

type CreateConversationInput = {
  userId: string
  title?: string
}

type Conversation = {
  id: string
  userId: string
  title: string | null
  createdAt: string
  updatedAt: string
}

type SaveMessageInput = {
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokensUsed?: number
}

type ChatMessage = {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tokensUsed: number | null
  createdAt: string
}

export const chatDb = {
  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: input.userId, title: input.title ?? null })
      .select()
      .single()

    if (error) throw new Error(`Failed to create conversation: ${error.message}`)
    return data as Conversation
  },

  async getConversations(userId: string): Promise<Result<Conversation[]>> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('id, user_id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50)

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as Conversation[] }
  },

  async getRecentMessages(conversationId: string, limit: number): Promise<ChatMessage[]> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, role, content, tokens_used, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return []
    return (data as ChatMessage[]).reverse()
  },

  async getMessages(conversationId: string): Promise<Result<ChatMessage[]>> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, role, content, tokens_used, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) return { success: false, error: error.message }
    return { success: true, data: data as ChatMessage[] }
  },

  async saveMessage(input: SaveMessageInput): Promise<Result<ChatMessage>> {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        tokens_used: input.tokensUsed ?? null
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    // Update conversation updated_at
    await supabase
      .from('chat_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', input.conversationId)

    return { success: true, data: data as ChatMessage }
  },

  async deleteConversation(conversationId: string, userId: string): Promise<Result<void>> {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: undefined }
  },

  async updateConversationTitle(conversationId: string, title: string): Promise<Result<void>> {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase
      .from('chat_conversations')
      .update({ title })
      .eq('id', conversationId)

    if (error) return { success: false, error: error.message }
    return { success: true, data: undefined }
  }
}
```

## Conversation Lifecycle

```
1. User sends first message
   |
   +-> conversationId is null in request
   +-> createConversation() with title = first 50 chars of message
   +-> Return conversationId to client
   +-> Client stores conversationId in state

2. User sends subsequent messages in same conversation
   |
   +-> conversationId is passed in request
   +-> Load last 20 messages for context
   +-> Append new messages and AI response

3. User opens previous conversation
   |
   +-> GET /api/ai/conversations/:id/messages
   +-> Load all messages
   +-> Render full conversation history

4. User deletes conversation
   |
   +-> DELETE /api/ai/conversations/:id
   +-> Cascades to delete all messages (ON DELETE CASCADE)
```

## Auto-Title Generation

When a new conversation is created, the title is set to the first 50 characters of the user's opening message.

For better UX, after the first AI response, generate a meaningful title using the LLM:

```typescript
async function generateConversationTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string> {
  const prompt = `Given this conversation exchange, generate a short 4-6 word title:
User: "${userMessage.slice(0, 200)}"
Assistant: "${assistantResponse.slice(0, 200)}"
Respond with only the title, no quotes.`

  const chunks: string[] = []
  for await (const delta of openaiAdapter.stream({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 20,
    temperature: 0.3
  })) {
    chunks.push(delta)
  }

  return chunks.join('').trim()
}
```

## Retention Policy

- Chat messages are retained indefinitely (user's data)
- Old conversations are not auto-deleted
- Export feature (future): allow users to export conversation as JSON/PDF
- Admin cleanup: archive conversations older than 1 year for inactive accounts

## Privacy Considerations

- Chat messages are stored in Supabase with RLS
- No conversation data is used to train LLM models
- System prompts include user's PNL summary — this is opt-in by nature (user chose to use the assistant)
- No conversation content is shared with third parties beyond the LLM API call
- LLM API calls are direct (no logging middleware that stores content)
