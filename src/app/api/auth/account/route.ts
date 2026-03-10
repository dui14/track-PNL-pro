import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db/supabase-server'

export async function DELETE(_req: NextRequest): Promise<NextResponse> {
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

  const serviceClient = createSupabaseServiceClient()
  const { error } = await serviceClient.auth.admin.deleteUser(user.id)

  if (error) {
    return NextResponse.json(
      { success: false, data: null, error: 'DELETE_FAILED' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, data: null, error: null })
}
