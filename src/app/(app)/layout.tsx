import { AppSidebar } from '@/components/layout/AppSidebar'
import { AppHeader } from '@/components/layout/AppHeader'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">
      <AppSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <AppHeader />
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
