import { z } from 'zod'

export const ChatMessageSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(4000).trim(),
})

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>
