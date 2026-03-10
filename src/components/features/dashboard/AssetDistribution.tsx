export function AssetDistribution(): React.JSX.Element {
  return (
    <div className="bg-background-light dark:bg-background-dark p-6 rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm">
      <h2 className="text-lg font-bold mb-6">Asset Distribution</h2>
      <div className="flex flex-col items-center justify-center min-h-[200px] text-center gap-3">
        <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-5xl">pie_chart</span>
        <p className="text-sm text-slate-400 leading-relaxed max-w-[200px]">
          Connect an exchange to view your asset distribution
        </p>
      </div>
    </div>
  )
}
