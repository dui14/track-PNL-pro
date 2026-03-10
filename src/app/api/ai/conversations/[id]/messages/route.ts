import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { fetchConversationMessages } from '@/lib/services/aiService'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  const { id } = await params
  const result = await fetchConversationMessages(supabase, user.id, id)

  if (!result.success) {
    return NextResponse.json(
      { success: false, data: null, error: result.error },
      { status: result.error === 'NOT_FOUND' ? 404 : 500 }
    )
  }

  return NextResponse.json({ success: true, data: result.data, error: null })
}
