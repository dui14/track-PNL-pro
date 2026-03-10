import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db/supabase-server'
import { UpdateProfileSchema } from '@/lib/validators/profile'
import { updateProfile, getProfile } from '@/lib/services/profileService'
import { upsertUser } from '@/lib/db/usersDb'

export async function GET(_req: NextRequest): Promise<NextResponse> {
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

  let result = await getProfile(supabase, user.id)

  if (!result.success && result.error === 'NOT_FOUND') {
    const serviceClient = createSupabaseServiceClient()
    await upsertUser(serviceClient, user.id, user.email ?? '')
    result = await getProfile(supabase, user.id)
  }

  if (!result.success) {
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
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

  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const result = await updateProfile(supabase, user.id, {
    displayName: parsed.data.displayName,
    email: parsed.data.email,
  })

  if (!result.success) {
    const statusMap: Record<string, number> = {
      EMAIL_UPDATE_FAILED: 400,
      NO_CHANGES: 400,
      INTERNAL_ERROR: 500,
    }
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: statusMap[result.error] ?? 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
