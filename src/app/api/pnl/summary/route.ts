import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { PNLSummaryQuerySchema } from '@/lib/validators/pnl'
import { fetchPNLSummary } from '@/lib/services/pnlService'

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
  const parsed = PNLSummaryQuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    exchangeAccountId: searchParams.get('exchangeAccountId') ?? undefined,
    segment: searchParams.get('segment') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { range, exchangeAccountId, segment } = parsed.data
  const result = await fetchPNLSummary(supabase, user.id, range, exchangeAccountId, segment)

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: result.data, error: null })
}
