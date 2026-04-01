import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { ChatMessageSchema } from '@/lib/validators/ai'
import type { AgentEvent } from '@/lib/agent-loop'
import { startOrContinueChat } from '@/lib/services/aiService'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const parsed = ChatMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const sendEvent = (event: AgentEvent) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        await startOrContinueChat(
          supabase,
          user.id,
          parsed.data.message,
          parsed.data.conversationId,
          parsed.data.model,
          (event) => {
            sendEvent(event)
          }
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR'
        sendEvent({
          type: 'error',
          payload: { message },
        })
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
