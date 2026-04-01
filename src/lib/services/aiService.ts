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
import { runAgentLoop } from '@/lib/agent-loop'

type StreamCallback = (chunk: {
  content?: string
  conversationId?: string
  error?: string
}) => void

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

  const history = await getConversationMessages(supabase, conversation.id, userId)
  const historyForAgent = history
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({
      role: item.role as 'user' | 'assistant',
      content: item.content,
    }))

  const userMessage = await createChatMessage(supabase, conversation.id, 'user', message)
  if (!userMessage) {
    onChunk({ error: 'INTERNAL_ERROR', conversationId: conversation.id })
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  onChunk({ conversationId: conversation.id })

  let assistantContent = ''
  const agentResult = await runAgentLoop(
    message,
    historyForAgent,
    userId,
    (contentChunk) => {
      assistantContent += contentChunk
      onChunk({ content: contentChunk, conversationId: conversation.id })
    }
  )

  if (!agentResult.success) {
    console.error('[aiService] runAgentLoop failed:', agentResult.error)
    onChunk({ error: agentResult.error, conversationId: conversation.id })
    return { success: false, error: agentResult.error }
  }

  const finalAssistantContent = assistantContent.trim() || agentResult.data.content
  const assistantMessage = await createChatMessage(
    supabase,
    conversation.id,
    'assistant',
    finalAssistantContent,
    agentResult.data.tokensUsed
  )

  if (!assistantMessage) {
    onChunk({ error: 'INTERNAL_ERROR', conversationId: conversation.id })
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  if (history.length === 0) {
    await updateConversationTitle(supabase, conversation.id, message.slice(0, 60))
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
