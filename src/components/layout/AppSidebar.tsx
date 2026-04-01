'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/db/supabase-browser'
import type { ChatConversation, UserProfile } from '@/lib/types'

const navItems = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/exchange', icon: 'account_balance_wallet', label: 'Exchange' },
  { href: '/demo-trading', icon: 'query_stats', label: 'Demo Trading' },
  { href: '/ai-assistant', icon: 'robot_2', label: 'AI' },
  { href: '/profile', icon: 'settings', label: 'Profile' },
]

export function AppSidebar(): React.JSX.Element {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [convsLoaded, setConvsLoaded] = useState(false)
  const [convsLoading, setConvsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isOnAI = pathname.startsWith('/ai-assistant')

  useEffect(() => {
    let cancelled = false
    fetch('/api/profile')
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res.success && res.data) setProfile(res.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isOnAI && !aiOpen) setAiOpen(true)
  }, [isOnAI])

  useEffect(() => {
    if (!openMenuId) return
    const handleClick = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenuId])

  const loadConversations = useCallback(async (): Promise<void> => {
    setConvsLoading(true)
    try {
      const res = await fetch('/api/ai/conversations')
      if (res.ok) {
        const data = await res.json()
        if (data.success) setConversations(data.data ?? [])
      }
    } finally {
      setConvsLoaded(true)
      setConvsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (aiOpen && !convsLoaded) loadConversations()
  }, [aiOpen, convsLoaded, loadConversations])

  useEffect(() => {
    const handler = (): void => {
      loadConversations()
    }
    window.addEventListener('ai-conv-change', handler)
    return () => window.removeEventListener('ai-conv-change', handler)
  }, [loadConversations])

  const activeConvId = searchParams.get('conv')

  const handleAIToggle = (): void => {
    if (collapsed) {
      router.push('/ai-assistant')
      return
    }
    setAiOpen((prev) => !prev)
    if (!isOnAI) router.push('/ai-assistant')
  }

  const handleDeleteConv = async (id: string): Promise<void> => {
    setDeletingId(id)
    setOpenMenuId(null)
    try {
      await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' })
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeConvId === id) router.push('/ai-assistant')
    } finally {
      setDeletingId(null)
    }
  }

  const handleLogout = async (): Promise<void> => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const displayName = profile?.display_name ?? profile?.email?.split('@')[0] ?? ''

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} transition-[width] duration-300 border-r border-slate-200 dark:border-primary/20 bg-background-light dark:bg-background-dark flex flex-col shrink-0 overflow-hidden`}
    >
      <div
        className={`p-4 flex items-center shrink-0 ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="size-8 bg-primary rounded-lg flex items-center justify-center text-accent shrink-0">
              <span className="material-symbols-outlined text-sm">analytics</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight truncate">Track PNL Pro</h1>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="size-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-primary/10 transition-colors text-slate-400 shrink-0"
        >
          <span className="material-symbols-outlined text-lg">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Menu
          </p>
        )}

        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const isAI = item.href === '/ai-assistant'

          if (isAI) {
            return (
              <div key={item.href}>
                <button
                  onClick={handleAIToggle}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-slate-200 dark:hover:bg-primary/5'
                  }`}
                >
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.label}</span>
                      <span className="material-symbols-outlined text-sm text-slate-400">
                        {aiOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </>
                  )}
                </button>

                {!collapsed && aiOpen && (
                  <div className="ml-4 mt-1 mb-1 border-l border-slate-200 dark:border-primary/20 pl-3 space-y-0.5">
                    <button
                      onClick={() => router.push('/ai-assistant')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-base">add_circle</span>
                      <span className="font-medium">New Chat</span>
                    </button>

                    {convsLoading && (
                      <div className="flex justify-center py-2">
                        <span className="material-symbols-outlined animate-spin text-primary/40 text-base">
                          refresh
                        </span>
                      </div>
                    )}

                    {!convsLoading && convsLoaded && conversations.length === 0 && (
                      <p className="text-xs text-slate-500 px-3 py-1">No conversations yet</p>
                    )}

                    {conversations.slice(0, 15).map((conv) => (
                      <div
                        key={conv.id}
                        className={`relative group flex items-center rounded-lg transition-all ${
                          activeConvId === conv.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-400 hover:bg-primary/5 hover:text-slate-200'
                        }`}
                      >
                        <button
                          onClick={() => router.push(`/ai-assistant?conv=${conv.id}`)}
                          className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0"
                        >
                          <span className="material-symbols-outlined text-base shrink-0">
                            chat_bubble
                          </span>
                          <p className="text-xs font-medium truncate">{conv.title ?? 'Untitled'}</p>
                        </button>

                        <div className="relative shrink-0" ref={openMenuId === conv.id ? menuRef : null}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(openMenuId === conv.id ? null : conv.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 dark:hover:bg-primary/20 transition-all mr-1"
                          >
                            <span className="material-symbols-outlined text-sm">more_horiz</span>
                          </button>

                          {openMenuId === conv.id && (
                            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-primary/20 rounded-lg shadow-xl py-1 min-w-[110px]">
                              <button
                                onClick={() => handleDeleteConv(conv.id)}
                                disabled={deletingId === conv.id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-sm">delete</span>
                                {deletingId === conv.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-slate-200 dark:hover:bg-primary/5'
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-primary/10 space-y-2 shrink-0">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="size-9 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-primary text-sm">person</span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="size-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 p-2 bg-primary/5 rounded-xl border border-primary/20">
              <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="material-symbols-outlined text-primary">person</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {displayName ? (
                  <p className="text-sm font-bold truncate">{displayName}</p>
                ) : (
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                )}
                <p className="text-xs text-slate-400 truncate">{profile?.email ?? ''}</p>
              </div>
              <Link href="/profile">
                <span className="material-symbols-outlined text-slate-400 text-sm cursor-pointer hover:text-primary transition-colors">
                  settings
                </span>
              </Link>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
