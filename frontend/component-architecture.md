# Frontend Component Architecture

## Overview

The frontend uses Next.js 15 App Router with a clear distinction between Server Components (default) and Client Components (opt-in with `'use client'`).

## Directory Structure

```
src/
  app/
    (auth)/
      login/
        page.tsx              <- Login page (Server Component)
      callback/
        route.ts              <- OAuth callback handler
    (routes)/
      layout.tsx              <- Root layout with sidebar
      dashboard/
        page.tsx              <- Dashboard page (Server Component)
        loading.tsx           <- Skeleton loader
      demo/
        page.tsx              <- Demo trading page
        loading.tsx
      ask/
        page.tsx              <- AI chat page
        loading.tsx
      profile/
        page.tsx              <- Profile page
        loading.tsx
    api/
      exchange/
        connect/route.ts
        accounts/route.ts
        sync/route.ts
        accounts/[id]/route.ts
      pnl/
        summary/route.ts
        chart/route.ts
        trades/route.ts
      demo/
        order/route.ts
        order/[id]/close/route.ts
        orders/route.ts
      ai/
        chat/route.ts
        conversations/route.ts
        conversations/[id]/messages/route.ts
      profile/
        route.ts
        avatar/route.ts
    globals.css
    layout.tsx                <- Root HTML layout
  components/
    ui/                       <- shadcn/ui primitives
      button.tsx
      card.tsx
      input.tsx
      badge.tsx
      dialog.tsx
      dropdown-menu.tsx
      separator.tsx
      skeleton.tsx
      avatar.tsx
      tooltip.tsx
    layout/
      Sidebar.tsx             <- Left sidebar navigation
      Header.tsx              <- Top header bar
      PageWrapper.tsx         <- Consistent page padding
    features/
      dashboard/
        PNLSummaryCard.tsx
        PNLChart.tsx
        TradeTable.tsx
        ExchangeBalanceCard.tsx
        TimeRangeFilter.tsx
        ExchangeAccountList.tsx
        SyncButton.tsx
      demo/
        TradingViewChart.tsx
        OrderPanel.tsx
        OpenOrdersTable.tsx
        DemoPNLSummary.tsx
        PriceDisplay.tsx
      ask/
        ChatInterface.tsx
        ChatMessage.tsx
        ChatInput.tsx
        ConversationList.tsx
        ConversationItem.tsx
      profile/
        ProfileForm.tsx
        AvatarUpload.tsx
        ExchangeKeyManager.tsx
        ExchangeKeyCard.tsx
        AddExchangeDialog.tsx
        PasswordChangeForm.tsx
  lib/
    actions/
      pnlActions.ts
      exchangeActions.ts
      demoActions.ts
      profileActions.ts
    services/
      pnlService.ts
      exchangeService.ts
      demoService.ts
      aiService.ts
    engines/
      pnlEngine.ts
      demoTradingEngine.ts
    adapters/
      binanceAdapter.ts
      okxAdapter.ts
      bybitAdapter.ts
      bitgetAdapter.ts
      mexcAdapter.ts
      llmAdapter.ts
    db/
      tradesDb.ts
      pnlSnapshotsDb.ts
      exchangeAccountsDb.ts
      demoTradesDb.ts
      chatDb.ts
      usersDb.ts
    hooks/
      usePNLSummary.ts
      usePNLChart.ts
      useTrades.ts
      useDemoOrders.ts
      useConversations.ts
      useChatStream.ts
      useExchangeAccounts.ts
    utils/
      encryption.ts
      formatCurrency.ts
      formatDate.ts
      rateLimit.ts
    validators/
      exchangeSchemas.ts
      pnlSchemas.ts
      demoSchemas.ts
      aiSchemas.ts
      profileSchemas.ts
    types/
      index.ts
      exchange.ts
      pnl.ts
      demo.ts
      chat.ts
      user.ts
  middleware.ts
```

## Component Categories

### Server Components

Used for: initial page load, data fetching, SEO, static content

```typescript
// src/app/(routes)/dashboard/page.tsx
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { fetchPNLSummary } from '@/lib/actions/pnlActions'
import { PNLSummaryCard } from '@/components/features/dashboard/PNLSummaryCard'
import { PNLChart } from '@/components/features/dashboard/PNLChart'

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const summaryResult = await fetchPNLSummary('month')

  return (
    <PageWrapper>
      <PNLSummaryCard data={summaryResult.data} />
      <PNLChart userId={user.id} />
    </PageWrapper>
  )
}
```

### Client Components

Used for: interactivity, real-time updates, browser APIs, forms

```typescript
'use client'

// src/components/features/dashboard/TimeRangeFilter.tsx
import { useState } from 'react'
import type { TimeRange } from '@/lib/types'

type TimeRangeFilterProps = {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

const RANGES: TimeRange[] = ['day', 'week', 'month', 'year']

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors
            ${value === range
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
            }`}
        >
          {range.charAt(0).toUpperCase() + range.slice(1)}
        </button>
      ))}
    </div>
  )
}
```

## Sidebar Navigation

```
+--------------------+
|  aiTrackProfit     |  <- Logo / brand
+--------------------+
|                    |
|  [charts] Dashboard|  <- Active: highlighted
|  [chart] Demo      |
|  [bot] Ask         |
|                    |
+--------------------+
|  [user] Profile    |  <- Bottom section
+--------------------+
```

The sidebar is a Server Component with the active route detected via `usePathname()` hook in a client sub-component.

## Layout Structure

```
+----------------------------------------+
|              Header                    |
+--------+-------------------------------+
|        |                               |
|        |                               |
|Sidebar |         Page Content          |
|        |                               |
|        |                               |
+--------+-------------------------------+
```

Mobile: Sidebar collapses to bottom navigation or hamburger menu.

## Data Fetching Patterns

### Server-side (initial load)
```typescript
// In Server Component or Server Action
const result = await fetchPNLSummary('month')
```

### Client-side (interactive updates)
```typescript
// In Client Component via TanStack Query
const { data, isLoading } = useQuery({
  queryKey: ['pnl-summary', range],
  queryFn: () => fetch(`/api/pnl/summary?range=${range}`).then(r => r.json()),
  staleTime: 5 * 60 * 1000  // 5 minutes
})
```

## Loading States

Every page has a `loading.tsx` with skeleton:

```typescript
// src/app/(routes)/dashboard/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-64 rounded-xl md:col-span-3" />
    </div>
  )
}
```

## Theme

Dark theme by default. TailwindCSS config uses CSS variables for theming:

```css
:root {
  --background: 224 71.4% 4.1%;
  --foreground: 210 20% 98%;
  --card: 224 71.4% 4.1%;
  --muted: 215 27.9% 16.9%;
  --muted-foreground: 217.9 10.6% 64.9%;
  --primary: 263.4 70% 50.4%;
  --destructive: 0 72.2% 50.6%;
}
```

PNL colors:
- Positive PNL: `text-emerald-400` / `#34d399`
- Negative PNL: `text-red-400` / `#f87171`
- Neutral: `text-muted-foreground`
