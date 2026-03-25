import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ExchangeAccount,
  ExchangeAccountWithStats,
  SyncResult,
  Result,
  ExchangeCredentials,
  ExchangeBalanceResult,
  ExchangePositionsResult,
} from '@/lib/types'
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
  updateSyncStatus,
} from '@/lib/db/exchangeDb'
import { upsertTrades } from '@/lib/db/tradesDb'
import { encrypt, decrypt } from '@/lib/adapters/encryption'
import { createExchangeAdapter } from '@/lib/adapters/exchangeFactory'

const MAX_SYNC_LOOKBACK_MS = 360 * 24 * 60 * 60 * 1000

export async function connectExchange(
  supabase: SupabaseClient,
  userId: string,
  exchange: string,
  apiKey: string,
  apiSecret: string,
  passphrase?: string,
  label?: string
): Promise<Result<ExchangeAccount>> {
  if ((exchange === 'okx' || exchange === 'bitget') && !passphrase) {
    return { success: false, error: 'PASSPHRASE_REQUIRED' }
  }

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

  const credentials: ExchangeCredentials = {
    apiKey,
    apiSecret,
    passphrase,
  }

  const isValid = await adapter.validateCredentials(credentials)
  if (!isValid) {
    return { success: false, error: 'INVALID_API_KEY' }
  }

  const hasWithdrawPermission = await adapter.hasWithdrawPermission(credentials)
  if (hasWithdrawPermission) {
    return { success: false, error: 'WITHDRAW_PERMISSION_DETECTED' }
  }

  const encryptedKey = encrypt(apiKey)
  const encryptedSecret = encrypt(apiSecret)
  const encryptedPassphrase = passphrase ? encrypt(passphrase) : null

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
    encryptedSecret.iv,
    encryptedPassphrase?.encrypted ?? null,
    encryptedPassphrase?.iv ?? null
  )
  if (!keyCreated) {
    return { success: false, error: 'INTERNAL_ERROR' }
  }

  return { success: true, data: account }
}

export async function listExchangeAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<Result<ExchangeAccountWithStats[]>> {
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

  await updateSyncStatus(supabase, exchangeAccountId, 'syncing', null)

  const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()
  const apiKeyRow = await getApiKey(serviceSupabase, exchangeAccountId)
  if (!apiKeyRow) {
    return { success: false, error: 'API_KEY_NOT_FOUND' }
  }

  const credentials = decryptCredentials(apiKeyRow)
  if (!credentials) {
    await updateSyncStatus(supabase, exchangeAccountId, 'error', 'DECRYPTION_FAILED')
    return { success: false, error: 'DECRYPTION_FAILED' }
  }

  const adapter = await createExchangeAdapter(account.exchange)
  const maxLookbackDate = new Date(Date.now() - MAX_SYNC_LOOKBACK_MS)
  const since = account.last_synced
    ? new Date(Math.max(new Date(account.last_synced).getTime(), maxLookbackDate.getTime()))
    : maxLookbackDate

  let trades
  try {
    trades = await adapter.fetchTrades(credentials, since)
  } catch (err) {
    console.error('[exchangeService] fetchTrades failed:', err)
    await updateSyncStatus(supabase, exchangeAccountId, 'error', 'EXCHANGE_ERROR')
    return { success: false, error: 'EXCHANGE_ERROR' }
  }

  const newTrades = await upsertTrades(serviceSupabase, exchangeAccountId, userId, trades)
  const lastSynced = new Date().toISOString()

  await updateLastSynced(supabase, exchangeAccountId, 'synced', null)

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
  passphrase?: string,
  label?: string
): Promise<Result<ExchangeAccount>> {
  const account = await getExchangeAccountById(supabase, accountId, userId)
  if (!account) {
    return { success: false, error: 'NOT_FOUND' }
  }

  if ((account.exchange === 'okx' || account.exchange === 'bitget') && !passphrase) {
    return { success: false, error: 'PASSPHRASE_REQUIRED' }
  }

  let adapter
  try {
    adapter = await createExchangeAdapter(account.exchange)
  } catch {
    return { success: false, error: 'UNSUPPORTED_EXCHANGE' }
  }

  const credentials: ExchangeCredentials = {
    apiKey,
    apiSecret,
    passphrase,
  }

  const isValid = await adapter.validateCredentials(credentials)
  if (!isValid) {
    return { success: false, error: 'INVALID_API_KEY' }
  }

  const hasWithdrawPermission = await adapter.hasWithdrawPermission(credentials)
  if (hasWithdrawPermission) {
    return { success: false, error: 'WITHDRAW_PERMISSION_DETECTED' }
  }

  const encryptedKey = encrypt(apiKey)
  const encryptedSecret = encrypt(apiSecret)
  const encryptedPassphrase = passphrase ? encrypt(passphrase) : null

  const serviceSupabase = (await import('@/lib/db/supabase-server')).createSupabaseServiceClient()

  const keyUpdated = await updateApiKeyRecord(
    serviceSupabase,
    accountId,
    encryptedKey.encrypted,
    encryptedSecret.encrypted,
    encryptedKey.iv,
    encryptedSecret.iv,
    encryptedPassphrase?.encrypted ?? null,
    encryptedPassphrase?.iv ?? null
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

export async function fetchExchangeBalance(
  supabase: SupabaseClient,
  userId: string,
  exchangeAccountId: string
): Promise<Result<ExchangeBalanceResult>> {
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

  const credentials = decryptCredentials(apiKeyRow)
  if (!credentials) {
    return { success: false, error: 'DECRYPTION_FAILED' }
  }

  const adapter = await createExchangeAdapter(account.exchange)
  const assets = await adapter.fetchBalances(credentials)
  const totalUsd = assets.reduce((sum, asset) => sum + asset.usdValue, 0)

  return {
    success: true,
    data: {
      exchange_account_id: exchangeAccountId,
      exchange: account.exchange,
      total_usd: totalUsd,
      assets,
      fetched_at: new Date().toISOString(),
    },
  }
}

export async function fetchExchangePositions(
  supabase: SupabaseClient,
  userId: string,
  exchangeAccountId: string
): Promise<Result<ExchangePositionsResult>> {
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

  const credentials = decryptCredentials(apiKeyRow)
  if (!credentials) {
    return { success: false, error: 'DECRYPTION_FAILED' }
  }

  const adapter = await createExchangeAdapter(account.exchange)
  const positions = await adapter.fetchOpenPositions(credentials)
  const totalUnrealizedPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0)

  return {
    success: true,
    data: {
      exchange_account_id: exchangeAccountId,
      total_unrealized_pnl: totalUnrealizedPnl,
      positions,
      fetched_at: new Date().toISOString(),
    },
  }
}

function decryptCredentials(apiKeyRow: {
  key_encrypted: string
  key_iv: string
  secret_encrypted: string
  secret_iv: string
  passphrase_encrypted: string | null
  passphrase_iv: string | null
}): ExchangeCredentials | null {
  try {
    const apiKey = decrypt(apiKeyRow.key_encrypted, apiKeyRow.key_iv)
    const apiSecret = decrypt(apiKeyRow.secret_encrypted, apiKeyRow.secret_iv)
    const passphrase =
      apiKeyRow.passphrase_encrypted && apiKeyRow.passphrase_iv
        ? decrypt(apiKeyRow.passphrase_encrypted, apiKeyRow.passphrase_iv)
        : undefined

    return {
      apiKey,
      apiSecret,
      passphrase,
    }
  } catch {
    return null
  }
}
