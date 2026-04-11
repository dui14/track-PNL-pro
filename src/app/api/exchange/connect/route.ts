import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { ConnectExchangeSchema } from '@/lib/validators/exchange'
import { connectExchange } from '@/lib/services/exchangeService'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let supabase
  let user
  try {
    supabase = await createSupabaseServerClient()
    const authResult = await supabase.auth.getUser()
    user = authResult.data.user
  } catch (error) {
    console.error('[exchange/connect] auth service unavailable:', error)
    return NextResponse.json(
      { success: false, data: null, error: 'AUTH_SERVICE_UNAVAILABLE' },
      { status: 503 }
    )
  }

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

  const { exchange, apiKey, apiSecret, passphrase, label, proxy } = parsed.data

  if (!process.env.ENCRYPTION_MASTER_KEY) {
    return NextResponse.json(
      { success: false, data: null, error: 'ENCRYPTION_NOT_CONFIGURED' },
      { status: 500 }
    )
  }

  let result
  try {
    result = await connectExchange(
      supabase,
      user.id,
      exchange,
      apiKey,
      apiSecret,
      passphrase,
      label,
      proxy
    )
  } catch (error) {
    console.error('[exchange/connect] unexpected error:', error)

    const isEncryptionError =
      error instanceof Error && error.message.includes('ENCRYPTION_MASTER_KEY')

    return NextResponse.json(
      {
        success: false,
        data: null,
        error: isEncryptionError ? 'ENCRYPTION_NOT_CONFIGURED' : 'INTERNAL_ERROR',
      },
      { status: 500 }
    )
  }

  if (!result.success) {
    const statusMap: Record<string, number> = {
      CONFLICT: 409,
      PASSPHRASE_REQUIRED: 400,
      INVALID_API_KEY: 400,
      EXCHANGE_REGION_BLOCKED: 400,
      EXCHANGE_TIME_DRIFT: 400,
      EXCHANGE_UNREACHABLE: 502,
      WITHDRAW_PERMISSION_DETECTED: 400,
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
