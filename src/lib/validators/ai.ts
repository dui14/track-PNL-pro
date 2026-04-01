import { z } from 'zod'

export const ChatMessageSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(4000).trim(),
  model: z.string().trim().min(1).max(120).optional(),
})

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>
