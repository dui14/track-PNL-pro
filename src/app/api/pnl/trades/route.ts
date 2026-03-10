import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { TradesQuerySchema } from '@/lib/validators/pnl'
import { fetchPaginatedTrades } from '@/lib/services/pnlService'

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
  const parsed = TradesQuerySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    exchangeAccountId: searchParams.get('exchangeAccountId') ?? undefined,
    symbol: searchParams.get('symbol') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { page, limit, exchangeAccountId, symbol } = parsed.data
  const result = await fetchPaginatedTrades(supabase, user.id, {
    page,
    limit,
    exchangeAccountId,
    symbol,
  })

  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    data: result.data.trades,
    meta: { page, limit, total: result.data.total },
    error: null,
  })
}
