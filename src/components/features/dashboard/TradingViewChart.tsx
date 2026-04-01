'use client'

import { useEffect, useRef, useState } from 'react'
import { buildTradingViewRssNewsFeedParams } from '@/lib/config/rss-feeds'
import type { TradingViewWidgetConfig } from '@/lib/types'

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: TradingViewWidgetConfig) => void
    }
  }
}

const SYMBOLS = [
  { label: 'BTC/USDT', value: 'BINANCE:BTCUSDT' },
  { label: 'ETH/USDT', value: 'BINANCE:ETHUSDT' },
  { label: 'SOL/USDT', value: 'BINANCE:SOLUSDT' },
  { label: 'BNB/USDT', value: 'BINANCE:BNBUSDT' },
]

const CONTAINER_ID = 'tv_chart_main'

export function TradingViewChart(): React.JSX.Element {
  const [symbol, setSymbol] = useState('BINANCE:BTCUSDT')
  const scriptLoaded = useRef(false)

  useEffect(() => {
    const container = document.getElementById(CONTAINER_ID)
    if (!container) return
    container.innerHTML = ''

    const initWidget = () => {
      const tradingView = window.TradingView
      if (!tradingView) return

      const widgetConfig: TradingViewWidgetConfig = {
        container_id: CONTAINER_ID,
        symbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        width: '100%',
        height: 420,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        withdateranges: true,
        studies: [],
        rss_news_feed: buildTradingViewRssNewsFeedParams(),
      }

      new tradingView.widget(widgetConfig)
    }

    if (window.TradingView) {
      initWidget()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://s3.tradingview.com/tv.js"]'
    )

    if (existing && !scriptLoaded.current) {
      existing.addEventListener('load', initWidget)
      return
    }

    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://s3.tradingview.com/tv.js'
      script.async = true
      script.onload = () => {
        scriptLoaded.current = true
        initWidget()
      }
      document.head.appendChild(script)
    }
  }, [symbol])

  return (
    <div className="bg-background-light dark:bg-background-dark p-6 rounded-xl border border-slate-200 dark:border-primary/20 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Market Chart</h2>
        <div className="flex gap-2">
          {SYMBOLS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSymbol(s.value)}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                symbol === s.value
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div id={CONTAINER_ID} />
    </div>
  )
}
