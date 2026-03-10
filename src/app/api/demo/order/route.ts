import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { PlaceDemoOrderSchema, CloseDemoOrderSchema } from '@/lib/validators/demo'
import { placeDemoOrder, closeDemoOrder } from '@/lib/services/demoService'

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

  const parsed = PlaceDemoOrderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { symbol, side, orderType, quantity, price } = parsed.data
  const entryPrice = orderType === 'market' ? price ?? 0 : price!

  if (!entryPrice || entryPrice <= 0) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const result = await placeDemoOrder(supabase, user.id, {
    symbol,
    side,
    orderType,
    quantity,
    price: entryPrice,
  })

  if (!result.success) {
    const statusMap: Record<string, number> = {
      INSUFFICIENT_BALANCE: 400,
      INTERNAL_ERROR: 500,
    }
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: statusMap[result.error] ?? 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null }, { status: 201 })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

  const result = await closeDemoOrder(supabase, user.id, parsed.data.tradeId, parsed.data.exitPrice)

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
