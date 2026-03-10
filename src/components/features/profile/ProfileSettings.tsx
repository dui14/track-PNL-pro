'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createSupabaseBrowserClient } from '@/lib/db/supabase-browser'
import type { UserProfile, ExchangeAccount } from '@/lib/types'

const profileSchema = z.object({
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(100).trim(),
  email: z.string().email('Please enter a valid email'),
})

type ProfileFormValues = z.infer<typeof profileSchema>

type SettingsTab = 'general' | 'security' | 'exchanges'

const SETTINGS_TABS: { key: SettingsTab; icon: string; label: string }[] = [
  { key: 'general', icon: 'person', label: 'General' },
  { key: 'security', icon: 'shield', label: 'Security' },
  { key: 'exchanges', icon: 'currency_exchange', label: 'Exchanges' },
]

const EXCHANGE_LABELS: Record<string, string> = {
  binance: 'Binance',
  okx: 'OKX',
  bybit: 'Bybit',
  bitget: 'Bitget',
  mexc: 'MEXC',
}

function formatMemberSince(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function ProfileSettings(): React.JSX.Element {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [exchanges, setExchanges] = useState<ExchangeAccount[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: '', email: '' },
  })

  const loadProfile = useCallback(async (): Promise<void> => {
    setLoadingProfile(true)
    try {
      const [profileRes, exchangesRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/exchange/accounts'),
      ])

      if (profileRes.ok) {
        const profileData = await profileRes.json()
        if (profileData.success && profileData.data) {
          setProfile(profileData.data)
          reset({
            displayName: profileData.data.display_name ?? '',
            email: profileData.data.email ?? '',
          })
        }
      }

      if (exchangesRes.ok) {
        const exchangesData = await exchangesRes.json()
        if (exchangesData.success) {
          setExchanges(exchangesData.data ?? [])
        }
      }
    } finally {
      setLoadingProfile(false)
    }
  }, [reset])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const onSubmit = async (data: ProfileFormValues): Promise<void> => {
    setSaveSuccess(false)
    setSaveError(null)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: data.displayName, email: data.email }),
    })

    const result = await res.json()

    if (res.ok && result.success) {
      setProfile(result.data)
      reset({ displayName: result.data.display_name ?? '', email: result.data.email ?? '' })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      setSaveError(result.error ?? 'Update failed')
    }
  }

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true)
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleDeleteAccount = async (): Promise<void> => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setIsDeletingAccount(true)
    const res = await fetch('/api/auth/account', { method: 'DELETE' })
    if (res.ok) {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
      router.push('/login')
    } else {
      setIsDeletingAccount(false)
      setConfirmDelete(false)
    }
  }

  const displayName = profile?.display_name ?? profile?.email?.split('@')[0] ?? ''

  return (
    <div className="h-full overflow-y-auto">
      <main className="max-w-7xl mx-auto w-full px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3 flex flex-col gap-6">
            <div className="bg-white dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
              <nav className="flex flex-col gap-1">
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                      activeTab === tab.key
                        ? 'bg-primary text-white font-medium shadow-lg shadow-primary/20'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="material-symbols-outlined">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          <div className="lg:col-span-9 space-y-6">
            <section className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row items-center gap-8">
                <div className="relative">
                  <div className="size-32 rounded-full border-4 border-primary/20 p-1">
                    <div className="w-full h-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt="avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="material-symbols-outlined text-slate-400 text-5xl">
                          person
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left">
                  {loadingProfile ? (
                    <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
                  ) : (
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                      {displayName}
                    </h1>
                  )}
                  {loadingProfile ? (
                    <div className="h-4 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 font-medium">
                      {profile?.email} &bull; Member since{' '}
                      {profile ? formatMemberSince(profile.created_at) : ''}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {activeTab === 'general' && (
              <section className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    General Settings
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Manage your account information.
                  </p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Display Name
                        </label>
                        <input
                          {...register('displayName')}
                          type="text"
                          disabled={loadingProfile}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:border-primary transition-all p-3 outline-none disabled:opacity-60"
                        />
                        {errors.displayName && (
                          <p className="text-xs text-rose-500">{errors.displayName.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Email Address
                        </label>
                        <input
                          {...register('email')}
                          type="email"
                          disabled={loadingProfile}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:border-primary transition-all p-3 outline-none disabled:opacity-60"
                        />
                        {errors.email && (
                          <p className="text-xs text-rose-500">{errors.email.message}</p>
                        )}
                        <p className="text-xs text-slate-400">
                          Changing email will require confirmation.
                        </p>
                      </div>
                    </div>

                    {saveError && (
                      <p className="mt-4 text-sm text-rose-500">{saveError}</p>
                    )}
                    {saveSuccess && (
                      <p className="mt-4 text-sm text-emerald-500">Changes saved successfully.</p>
                    )}
                  </div>

                  <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-4">
                    <button
                      type="button"
                      disabled={!isDirty || isSubmitting}
                      onClick={() =>
                        reset({
                          displayName: profile?.display_name ?? '',
                          email: profile?.email ?? '',
                        })
                      }
                      className="px-6 py-2 rounded-lg text-slate-600 dark:text-slate-400 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Reset
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !isDirty || loadingProfile}
                      className="px-8 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {activeTab === 'security' && (
              <section className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Security
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Manage your session and account access.
                  </p>
                </div>

                <div className="p-8 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-4">
                      <div className="size-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <span className="material-symbols-outlined text-slate-500">logout</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          Sign Out
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          End your current session on this device.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="px-5 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isLoggingOut ? 'Signing out...' : 'Sign Out'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'exchanges' && (
              <section className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    Connected Exchanges
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Exchange accounts linked to your profile.
                  </p>
                </div>

                <div className="p-8">
                  {loadingProfile ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : exchanges.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">
                        link_off
                      </span>
                      <h3 className="text-base font-bold text-slate-600 dark:text-slate-400">
                        No exchanges connected
                      </h3>
                      <p className="text-sm text-slate-400 mt-1 mb-6">
                        Connect an exchange to start tracking your portfolio.
                      </p>
                      <a
                        href="/exchange"
                        className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
                      >
                        Connect Exchange
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {exchanges.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex items-center gap-4">
                            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <span className="material-symbols-outlined text-primary text-lg">
                                account_balance_wallet
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                {EXCHANGE_LABELS[account.exchange] ?? account.exchange}
                                {account.label ? ` — ${account.label}` : ''}
                              </p>
                              <p className="text-xs text-slate-400">
                                {account.last_synced
                                  ? `Last synced ${new Date(account.last_synced).toLocaleDateString()}`
                                  : 'Never synced'}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${
                              account.is_active
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {account.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-rose-600 dark:text-rose-400 font-bold">Delete Account</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Permanently delete your account and all associated trading data. This action cannot be undone.
                  </p>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                    confirmDelete
                      ? 'bg-rose-500 text-white'
                      : 'border border-rose-500 text-rose-500 hover:bg-rose-500 hover:text-white'
                  }`}
                >
                  {isDeletingAccount
                    ? 'Deleting...'
                    : confirmDelete
                    ? 'Confirm Delete'
                    : 'Delete Account'}
                </button>
              </div>
              {confirmDelete && !isDeletingAccount && (
                <p className="mt-3 text-xs text-rose-400">
                  Click again to confirm. This will permanently delete your account.{' '}
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="underline font-semibold"
                  >
                    Cancel
                  </button>
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
