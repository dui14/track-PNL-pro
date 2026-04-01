import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { PNLCalendarQuerySchema } from '@/lib/validators/pnl'
import { fetchPNLCalendar } from '@/lib/services/pnlService'

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
  const parsed = PNLCalendarQuerySchema.safeParse({
    view: searchParams.get('view') ?? undefined,
    year: searchParams.get('year') ?? undefined,
    month: searchParams.get('month') ?? undefined,
    exchange: searchParams.get('exchange') ?? undefined,
    segment: searchParams.get('segment') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { view, year, month, segment, exchange } = parsed.data

  if (view === 'daily' && !month) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const result = await fetchPNLCalendar(supabase, user.id, view, year, month, segment, exchange)

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
