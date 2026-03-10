import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { uploadAvatar } from '@/lib/services/profileService'

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

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const file = formData.get('avatar')
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  const result = await uploadAvatar(user.id, file)

  if (!result.success) {
    const statusMap: Record<string, number> = {
      INVALID_FILE_TYPE: 400,
      FILE_TOO_LARGE: 400,
      UPLOAD_FAILED: 500,
    }
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: statusMap[result.error] ?? 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
