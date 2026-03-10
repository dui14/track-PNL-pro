'use client'

export function AppHeader(): React.JSX.Element {
  return (
    <header className="h-14 border-b border-slate-200 dark:border-primary/20 bg-background-light dark:bg-background-dark px-6 flex items-center justify-end z-10 shrink-0">
      <button className="size-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-primary/10 transition-colors relative">
        <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">
          notifications
        </span>
        <span className="absolute top-2 right-2 size-2 bg-primary rounded-full ring-2 ring-white dark:ring-background-dark" />
      </button>
    </header>
  )
}
