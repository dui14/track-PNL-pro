import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatConversation, ChatMessage, Result } from '@/lib/types'
import {
  createConversation,
  getConversations,
  getConversationById,
  getConversationMessages,
  createChatMessage,
  updateConversationTitle,
  deleteConversation,
} from '@/lib/db/chatDb'
import { streamChatCompletion, buildSystemPrompt } from '@/lib/adapters/llmAdapter'

type StreamCallback = (chunk: { type: 'delta' | 'done' | 'error'; content?: string; conversationId?: string }) => void

export async function startOrContinueChat(
  supabase: SupabaseClient,
  userId: string,
  message: string,
  conversationId: string | null | undefined,
  onChunk: StreamCallback
): Promise<Result<{ conversationId: string }>> {
  let conversation: ChatConversation | null = null

  if (conversationId) {
    conversation = await getConversationById(supabase, conversationId, userId)
    if (!conversation) {
      return { success: false, error: 'CONVERSATION_NOT_FOUND' }
    }
  } else {
    const title = message.slice(0, 60)
    conversation = await createConversation(supabase, userId, title)
    if (!conversation) {
      return { success: false, error: 'INTERNAL_ERROR' }
    }
  }

  await createChatMessage(supabase, conversation.id, 'user', message)

  const history = await getConversationMessages(supabase, conversation.id, userId)
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt() },
    ...history
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
  ]

  try {
    const { content, tokensUsed } = await streamChatCompletion(messages, (chunk) => {
      onChunk(chunk)
    })

    await createChatMessage(supabase, conversation.id, 'assistant', content, tokensUsed)

    if (history.length === 1) {
      await updateConversationTitle(supabase, conversation.id, message.slice(0, 60))
    }

    onChunk({ type: 'done', conversationId: conversation.id })
  } catch (err) {
    console.error('[aiService] streamChatCompletion failed:', err)
    onChunk({ type: 'error', content: 'INTERNAL_ERROR' })
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  return { success: true, data: { conversationId: conversation.id } }
}

export async function listConversations(
  supabase: SupabaseClient,
  userId: string
): Promise<Result<ChatConversation[]>> {
  const conversations = await getConversations(supabase, userId)
  return { success: true, data: conversations }
}

export async function fetchConversationMessages(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<Result<ChatMessage[]>> {
  const conversation = await getConversationById(supabase, conversationId, userId)
  if (!conversation) {
    return { success: false, error: 'NOT_FOUND' }
  }

  const messages = await getConversationMessages(supabase, conversationId, userId)
  return { success: true, data: messages }
}

export async function removeConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<Result<null>> {
  const conversation = await getConversationById(supabase, conversationId, userId)
  if (!conversation) {
    return { success: false, error: 'NOT_FOUND' }
  }

  const deleted = await deleteConversation(supabase, conversationId, userId)
  if (!deleted) return { success: false, error: 'INTERNAL_ERROR' }
  return { success: true, data: null }
}
