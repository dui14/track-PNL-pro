import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { listConversations } from '@/lib/services/aiService'

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

  const result = await listConversations(supabase, user.id)
  if (!result.success) {
    return NextResponse.json({ success: false, data: null, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: result.data, error: null })
}
