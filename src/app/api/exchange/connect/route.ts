import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { ConnectExchangeSchema } from '@/lib/validators/exchange'
import { connectExchange } from '@/lib/services/exchangeService'

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

  const parsed = ConnectExchangeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { exchange, apiKey, apiSecret, label } = parsed.data
  const result = await connectExchange(supabase, user.id, exchange, apiKey, apiSecret, label)

  if (!result.success) {
    const statusMap: Record<string, number> = {
      CONFLICT: 409,
      INVALID_API_KEY: 400,
      UNSUPPORTED_EXCHANGE: 400,
      INTERNAL_ERROR: 500,
    }
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: statusMap[result.error] ?? 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null }, { status: 201 })
}
