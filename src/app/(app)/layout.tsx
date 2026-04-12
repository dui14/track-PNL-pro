import { Suspense } from 'react'
import { AppSidebar } from '@/components/layout/AppSidebar'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      <Suspense fallback={<div className="hidden md:block w-16 md:w-64 border-r border-slate-200 dark:border-primary/20" />}>
        <AppSidebar />
      </Suspense>
      <main className="flex-1 flex flex-col overflow-hidden pb-24 md:pb-0">
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
