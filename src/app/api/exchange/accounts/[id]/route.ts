import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { removeExchangeAccount, toggleExchangeActive, updateExchangeApiKeys } from '@/lib/services/exchangeService'
import { UpdateExchangeActiveSchema, UpdateExchangeKeysSchema } from '@/lib/validators/exchange'

async function getAuthenticatedUser(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const user = await getAuthenticatedUser(supabase)

  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  const { id } = await params
  const result = await removeExchangeAccount(supabase, user.id, id)

  if (!result.success) {
    const status = result.error === 'NOT_FOUND' ? 404 : 500
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const user = await getAuthenticatedUser(supabase)

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

  const parsed = UpdateExchangeActiveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { id } = await params
  const result = await toggleExchangeActive(supabase, user.id, id, parsed.data.is_active)

  if (!result.success) {
    const status = result.error === 'NOT_FOUND' ? 404 : 500
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const user = await getAuthenticatedUser(supabase)

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

  const parsed = UpdateExchangeKeysSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const { id } = await params
  const { apiKey, apiSecret, label } = parsed.data
  const result = await updateExchangeApiKeys(
    supabase,
    user.id,
    id,
    apiKey,
    apiSecret,
    label === undefined ? undefined : (label ?? undefined)
  )

  if (!result.success) {
    const statusMap: Record<string, number> = {
      NOT_FOUND: 404,
      INVALID_API_KEY: 400,
      UNSUPPORTED_EXCHANGE: 400,
      INTERNAL_ERROR: 500,
    }
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: statusMap[result.error] ?? 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
