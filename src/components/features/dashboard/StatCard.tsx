type StatCardProps = {
  title: string
  value: string
  change?: string
  changePositive?: boolean
  icon: string
  progressBar?: number
  note?: string
  valueHighlight?: boolean
}

export function StatCard({
  title,
  value,
  change,
  changePositive,
  icon,
  progressBar,
  note,
  valueHighlight,
}: StatCardProps): React.JSX.Element {
  return (
    <div className="bg-background-light dark:bg-background-dark p-6 rounded-xl border border-slate-200 dark:border-primary/20 flex flex-col justify-between shadow-sm">
      <div className="flex justify-between items-start">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
      </div>
      <div className="mt-4">
        <h3
          className={`text-2xl font-bold tracking-tight ${
            valueHighlight ? 'text-accent' : ''
          }`}
        >
          {value}
        </h3>
        {change && (
          <p
            className={`text-sm font-bold mt-1 flex items-center gap-1 ${
              changePositive ? 'text-emerald-500' : 'text-rose-500'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {changePositive ? 'trending_up' : 'trending_down'}
            </span>
            {change}
          </p>
        )}
        {progressBar !== undefined && (
          <div className="w-full bg-slate-200 dark:bg-primary/10 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${progressBar}%` }}
            />
          </div>
        )}
        {note && <p className="text-sm text-slate-400 font-medium mt-1">{note}</p>}
      </div>
    </div>
  )
}
