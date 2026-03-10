import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExchangeAccount, SyncResult, Result } from '@/lib/types'
import {
  createExchangeAccount,
  createApiKey,
  getExchangeAccounts,
  getExchangeAccountById,
  getApiKey,
  deleteExchangeAccount,
  exchangeAccountExists,
  updateLastSynced,
  updateExchangeActive,
  updateApiKeyRecord,
} from '@/lib/db/exchangeDb'
import { upsertTrades, getTradeCount } from '@/lib/db/tradesDb'
import { encrypt, decrypt } from '@/lib/adapters/encryption'
import { createExchangeAdapter } from '@/lib/adapters/exchangeFactory'

export async function connectExchange(
  supabase: SupabaseClient,
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  label?: string
): Promise<Result<ExchangeAccount>> {
  const exists = await exchangeAccountExists(supabase, userId, exchange)
  if (exists) {
    return { success: false, error: 'CONFLICT' }
  }

  let adapter
  try {
    adapter = await createExchangeAdapter(exchange)
  } catch {
    return { success: false, error: 'UNSUPPORTED_EXCHANGE' }
  }

  const isValid = await adapter.validateApiKey(apiKey, apiSecret)
  if (!isValid) {
    return { success: false, error: 'INVALID_API_KEY' }
  }

  const encryptedKey = encrypt(apiKey)
  const encryptedSecret = encrypt(apiSecret)

  const account = await createExchangeAccount(supabase, userId, exchange, label ?? null)
  if (!account) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()

  const keyCreated = await createApiKey(
    serviceSupabase,
    account.id,
    encryptedKey.encrypted,
    encryptedSecret.encrypted,
    encryptedKey.iv,
    encryptedSecret.iv
  )
  if (!keyCreated) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  return { success: true, data: account }
}

export async function listExchangeAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<Result<ExchangeAccount[]>> {
  const accounts = await getExchangeAccounts(supabase, userId)
  return { success: true, data: accounts }
}

export async function syncExchangeAccount(
  supabase: SupabaseClient,
  userId: string,
  exchangeAccountId: string
): Promise<Result<SyncResult>> {
  const account = await getExchangeAccountById(supabase, exchangeAccountId, userId)
  if (!account) {
    return { success: false, error: 'NOT_FOUND' }
  }

  if (!account.is_active) {
    return { success: false, error: 'ACCOUNT_INACTIVE' }
  }

  const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()
  const apiKeyRow = await getApiKey(serviceSupabase, exchangeAccountId)
  if (!apiKeyRow) {
    return { success: false, error: 'API_KEY_NOT_FOUND' }
  }

  let decryptedKey: string
  let decryptedSecret: string

  try {
    decryptedKey = decrypt(apiKeyRow.key_encrypted, apiKeyRow.key_iv)
    decryptedSecret = decrypt(apiKeyRow.secret_encrypted, apiKeyRow.secret_iv)
  } catch {
    return { success: false, error: 'DECRYPTION_FAILED' }
  }

  const adapter = await createExchangeAdapter(account.exchange)
  const since = account.last_synced ? new Date(account.last_synced) : undefined

  let trades
  try {
    trades = await adapter.fetchTrades(decryptedKey, decryptedSecret, since)
  } catch (err) {
    console.error('[exchangeService] fetchTrades failed:', err)
    return { success: false, error: 'EXCHANGE_ERROR' }
  }

  const prevCount = await getTradeCount(serviceSupabase, exchangeAccountId)
  const newTrades = await upsertTrades(serviceSupabase, exchangeAccountId, userId, trades)
  const lastSynced = new Date().toISOString()

  await updateLastSynced(supabase, exchangeAccountId)

  return {
    success: true,
    data: {
      synced_trades: trades.length,
      new_trades: newTrades,
      last_synced: lastSynced,
    },
  }
}

export async function removeExchangeAccount(
  supabase: SupabaseClient,
  userId: string,
  accountId: string
): Promise<Result<{ deleted: boolean }>> {
  const account = await getExchangeAccountById(supabase, accountId, userId)
  if (!account) {
    return { success: false, error: 'NOT_FOUND' }
  }

  const deleted = await deleteExchangeAccount(supabase, accountId, userId)
  if (!deleted) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  return { success: true, data: { deleted: true } }
}

export async function toggleExchangeActive(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  isActive: boolean
): Promise<Result<ExchangeAccount>> {
  const account = await getExchangeAccountById(supabase, accountId, userId)
  if (!account) {
    return { success: false, error: 'NOT_FOUND' }
  }

  const updated = await updateExchangeActive(supabase, accountId, userId, isActive)
  if (!updated) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  return { success: true, data: { ...account, is_active: isActive } }
}

export async function updateExchangeApiKeys(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  apiKey: string,
  apiSecret: string,
  label?: string
): Promise<Result<ExchangeAccount>> {
  const account = await getExchangeAccountById(supabase, accountId, userId)
  if (!account) {
    return { success: false, error: 'NOT_FOUND' }
  }

  let adapter
  try {
    adapter = await createExchangeAdapter(account.exchange)
  } catch {
    return { success: false, error: 'UNSUPPORTED_EXCHANGE' }
  }

  const isValid = await adapter.validateApiKey(apiKey, apiSecret)
  if (!isValid) {
    return { success: false, error: 'INVALID_API_KEY' }
  }

  const encryptedKey = encrypt(apiKey)
  const encryptedSecret = encrypt(apiSecret)

  const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()

  const keyUpdated = await updateApiKeyRecord(
    serviceSupabase,
    accountId,
    encryptedKey.encrypted,
    encryptedSecret.encrypted,
    encryptedKey.iv,
    encryptedSecret.iv
  )
  if (!keyUpdated) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  if (label !== undefined) {
    await supabase
      .from('exchange_accounts')
      .update({ label: label ?? null })
      .eq('id', accountId)
      .eq('user_id', userId)
  }

  const updated = await getExchangeAccountById(supabase, accountId, userId)
  return { success: true, data: updated ?? account }
}
