import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { PNLChartQuerySchema } from '@/lib/validators/pnl'
import { fetchPNLChart } from '@/lib/services/pnlService'

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
  const parsed = PNLChartQuerySchema.safeParse({
    range: searchParams.get('range') ?? undefined,
    exchangeAccountId: searchParams.get('exchangeAccountId') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { range, exchangeAccountId } = parsed.data
  const result = await fetchPNLChart(supabase, user.id, range, exchangeAccountId)

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: result.data, error: null })
}
