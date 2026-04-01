import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { ChatMessageSchema } from '@/lib/validators/ai'
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

      const sendRaw = (payload: string) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      }

      const sendJson = (payload: Record<string, unknown>) => {
        sendRaw(JSON.stringify(payload))
      }

      try {
        const result = await startOrContinueChat(
          supabase,
          user.id,
          parsed.data.message,
          parsed.data.conversationId,
          (chunk) => {
            sendJson(chunk)
          }
        )

        if (!result.success) {
          sendJson({ error: result.error })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'INTERNAL_ERROR'
        sendJson({ error: message })
      } finally {
        sendRaw('[DONE]')
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
