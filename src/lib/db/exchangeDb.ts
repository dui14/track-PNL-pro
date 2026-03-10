import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExchangeAccount, ApiKeyRow } from '@/lib/types'

export async function createExchangeAccount(
  supabase: SupabaseClient,
  userId: string,
  exchange: string,
  label: string | null
): Promise<ExchangeAccount | null> {
  const { data, error } = await supabase
    .from('exchange_accounts')
    .insert({ user_id: userId, exchange, label })
    .select()
    .single()

  if (error) return null
  return data as ExchangeAccount
}

export async function createApiKey(
  supabase: SupabaseClient,
  exchangeAccountId: string,
  keyEncrypted: string,
  secretEncrypted: string,
  keyIv: string,
  secretIv: string
): Promise<boolean> {
  const { error } = await supabase.from('api_keys').insert({
    exchange_account_id: exchangeAccountId,
    key_encrypted: keyEncrypted,
    secret_encrypted: secretEncrypted,
    key_iv: keyIv,
    secret_iv: secretIv,
  })

  return !error
}

export async function getExchangeAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<ExchangeAccount[]> {
  const { data, error } = await supabase
    .from('exchange_accounts')
    .select('id, exchange, label, is_active, last_synced, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as ExchangeAccount[]
}

export async function getExchangeAccountById(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): Promise<ExchangeAccount | null> {
  const { data, error } = await supabase
    .from('exchange_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single()

  if (error) return null
  return data as ExchangeAccount
}

export async function getApiKey(
  supabase: SupabaseClient,
  exchangeAccountId: string
): Promise<ApiKeyRow | null> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('exchange_account_id', exchangeAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) return null
  return data as ApiKeyRow
}

export async function updateLastSynced(
  supabase: SupabaseClient,
  accountId: string
): Promise<void> {
  await supabase
    .from('exchange_accounts')
    .update({ last_synced: new Date().toISOString() })
    .eq('id', accountId)
}

export async function deleteExchangeAccount(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('exchange_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId)

  return !error
}

export async function updateExchangeActive(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  isActive: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('exchange_accounts')
    .update({ is_active: isActive })
    .eq('id', accountId)
    .eq('user_id', userId)

  return !error
}

export async function updateApiKeyRecord(
  supabase: SupabaseClient,
  exchangeAccountId: string,
  keyEncrypted: string,
  secretEncrypted: string,
  keyIv: string,
  secretIv: string
): Promise<boolean> {
  const { error } = await supabase
    .from('api_keys')
    .update({
      key_encrypted: keyEncrypted,
      secret_encrypted: secretEncrypted,
      key_iv: keyIv,
      secret_iv: secretIv,
    })
    .eq('exchange_account_id', exchangeAccountId)

  return !error
}

export async function exchangeAccountExists(
  supabase: SupabaseClient,
  userId: string,
  exchange: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('exchange_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('exchange', exchange)

  if (error) return false
  return (count ?? 0) > 0
}
