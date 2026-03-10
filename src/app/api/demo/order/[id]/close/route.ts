import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { CloseDemoOrderSchema } from '@/lib/validators/demo'
import { closeDemoOrder } from '@/lib/services/demoService'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const parsed = CloseDemoOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { id } = await params
  const result = await closeDemoOrder(supabase, user.id, id, parsed.data.exitPrice)

  if (!result.success) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      TRADE_NOT_OPEN: 400,
      INTERNAL_ERROR: 500,
    }
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: statusMap[result.error] ?? 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
