import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { DemoOrdersQuerySchema } from '@/lib/validators/demo'
import { listDemoOrders } from '@/lib/services/demoService'

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const { searchParams } = req.nextUrl
  const parsed = DemoOrdersQuerySchema.safeParse({
    status: searchParams.get('status') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const result = await listDemoOrders(supabase, user.id, parsed.data.status)
  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: result.data, error: null })
}
