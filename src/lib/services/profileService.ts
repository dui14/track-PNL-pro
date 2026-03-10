import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserProfile, Result } from '@/lib/types'
import { getUserById, updateUser } from '@/lib/db/usersDb'
import { createSupabaseServiceClient } from '@/lib/db/supabase-server'

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AVATAR_SIZE = 2 * 1024 * 1024

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Result<UserProfile>> {
  const profile = await getUserById(supabase, userId)
  if (!profile) {
    return { success: false, error: 'NOT_FOUND' }
  }
  return { success: true, data: profile }
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  updates: { displayName?: string; email?: string }
): Promise<Result<UserProfile>> {
  const dbUpdates: Partial<Pick<UserProfile, 'display_name' | 'email'>> = {}

  if (updates.displayName !== undefined) {
    dbUpdates.display_name = updates.displayName
  }
  if (updates.email !== undefined) {
    const { error } = await supabase.auth.updateUser({ email: updates.email })
    if (error) {
      return { success: false, error: 'EMAIL_UPDATE_FAILED' }
    }
    dbUpdates.email = updates.email
  }

  if (Object.keys(dbUpdates).length === 0) {
    return { success: false, error: 'NO_CHANGES' }
  }

  const profile = await updateUser(supabase, userId, dbUpdates)
  if (!profile) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  return { success: true, data: profile }
}

export async function uploadAvatar(
  userId: string,
  file: File
): Promise<Result<{ avatar_url: string }>> {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return { success: false, error: 'INVALID_FILE_TYPE' }
  }
  if (file.size > MAX_AVATAR_SIZE) {
    return { success: false, error: 'FILE_TOO_LARGE' }
  }

  const ext = file.type.split('/')[1]
  const fileName = `${userId}.${ext}`
  const serviceClient = createSupabaseServiceClient()

  const { error: uploadError } = await serviceClient.storage
    .from('avatars')
    .upload(fileName, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    console.error('[profileService] uploadAvatar failed:', uploadError.message)
    return { success: false, error: 'UPLOAD_FAILED' }
  }

  const { data: urlData } = serviceClient.storage
    .from('avatars')
    .getPublicUrl(fileName)

  const avatarUrl = urlData.publicUrl

  const userClient = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()
  await updateUser(userClient, userId, { avatar_url: avatarUrl })

  return { success: true, data: { avatar_url: avatarUrl } }
}
