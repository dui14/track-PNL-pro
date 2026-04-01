'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { buildTradingViewRssNewsFeedParams } from '@/lib/config/rss-feeds'
import type { DemoTrade } from '@/lib/types'
import type { TradingViewWidgetConfig } from '@/lib/types'

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: TradingViewWidgetConfig) => void
    }
  }
}

type MarketPair = {
  symbol: string
  baseAsset: string
  tvSymbol: string
}

const MARKET_PAIRS: MarketPair[] = [
  { symbol: 'BTC/USDT', baseAsset: 'BTC', tvSymbol: 'BINANCE:BTCUSDT' },
  { symbol: 'ETH/USDT', baseAsset: 'ETH', tvSymbol: 'BINANCE:ETHUSDT' },
  { symbol: 'SOL/USDT', baseAsset: 'SOL', tvSymbol: 'BINANCE:SOLUSDT' },
  { symbol: 'AVAX/USDT', baseAsset: 'AVAX', tvSymbol: 'BINANCE:AVAXUSDT' },
  { symbol: 'BNB/USDT', baseAsset: 'BNB', tvSymbol: 'BINANCE:BNBUSDT' },
  { symbol: 'XRP/USDT', baseAsset: 'XRP', tvSymbol: 'BINANCE:XRPUSDT' },
]

type BottomTab = 'positions' | 'orderHistory' | 'tradeHistory'
type OrderSide = 'buy' | 'sell'
type OrderType = 'Limit' | 'Market'
type MarginMode = 'cross' | 'isolated'

const TV_CONTAINER_ID = 'tv_demo_chart'
const TAKER_FEE_RATE = 0.001

export function DemoTradingTerminal(): React.JSX.Element {
  const [selectedPair, setSelectedPair] = useState('BTC/USDT')
  const [orderSide, setOrderSide] = useState<OrderSide>('buy')
  const [orderType, setOrderType] = useState<OrderType>('Limit')
  const [marginMode, setMarginMode] = useState<MarginMode>('cross')
  const [leverage, setLeverage] = useState('10')
  const [orderPrice, setOrderPrice] = useState('')
  const [initialMargin, setInitialMargin] = useState('')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [bottomTab, setBottomTab] = useState<BottomTab>('positions')
  const [balance, setBalance] = useState<number | null>(null)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [openPositions, setOpenPositions] = useState<DemoTrade[]>([])
  const [closedTrades, setClosedTrades] = useState<DemoTrade[]>([])
  const [orderHistory, setOrderHistory] = useState<DemoTrade[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [isPairPickerOpen, setIsPairPickerOpen] = useState(false)
  const [pairSearch, setPairSearch] = useState('')
  const [marketPriceMap, setMarketPriceMap] = useState<Record<string, number>>({})
  const tvScriptRef = useRef(false)
  const pairPickerRef = useRef<HTMLDivElement | null>(null)

  const selectedPairData = MARKET_PAIRS.find((p) => p.symbol === selectedPair)
  const selectedSymbol = selectedPair.replace('/', '')
  const baseAsset = selectedPairData?.baseAsset ?? selectedPair.split('/')[0]
  const tvSymbol = selectedPairData?.tvSymbol ?? 'BINANCE:ETHUSDT'
  const effectivePrice = orderType === 'Market' ? livePrice ?? NaN : parseFloat(orderPrice)
  const leverageValue = parseFloat(leverage)
  const initialMarginValue = parseFloat(initialMargin)
  const positionNotional =
    Number.isFinite(initialMarginValue) && initialMarginValue > 0 && Number.isFinite(leverageValue) && leverageValue > 0
      ? initialMarginValue * leverageValue
      : NaN
  const estimatedQuantity =
    Number.isFinite(positionNotional) && Number.isFinite(effectivePrice) && effectivePrice > 0
      ? positionNotional / effectivePrice
      : NaN
  const entryFee = Number.isFinite(positionNotional) ? positionNotional * TAKER_FEE_RATE : NaN
  const requiredBalance =
    Number.isFinite(initialMarginValue) && initialMarginValue > 0 && Number.isFinite(entryFee)
      ? initialMarginValue + entryFee
      : NaN

  const maxNotionalValue = (() => {
    if (balance === null) return null
    if (!Number.isFinite(leverageValue) || leverageValue <= 0) return null
    const denominator = 1 / leverageValue + TAKER_FEE_RATE
    if (denominator <= 0) return null
    const max = balance / denominator
    if (!Number.isFinite(max) || max <= 0) return null
    return max
  })()

  const maxNotional =
    maxNotionalValue !== null
      ? maxNotionalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : '--'

  const maxQuantity = (() => {
    if (maxNotionalValue === null) return '--'
    if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) return '--'
    return (maxNotionalValue / effectivePrice).toLocaleString('en-US', { maximumFractionDigits: 6 })
  })()

  const formattedPositionNotional = (() => {
    if (Number.isFinite(positionNotional) && positionNotional > 0) {
      return positionNotional.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
    return '--'
  })()

  const formattedEstimatedQuantity = (() => {
    if (Number.isFinite(estimatedQuantity) && estimatedQuantity > 0) {
      return estimatedQuantity.toLocaleString('en-US', { maximumFractionDigits: 6 })
    }
    return '--'
  })()

  const formattedEntryFee = (() => {
    if (Number.isFinite(entryFee) && entryFee >= 0) {
      return entryFee.toLocaleString('en-US', { maximumFractionDigits: 4 })
    }
    return '--'
  })()

  const formattedRequiredBalance = (() => {
    if (Number.isFinite(requiredBalance) && requiredBalance > 0) {
      return requiredBalance.toLocaleString('en-US', { maximumFractionDigits: 4 })
    }
    return '--'
  })()

  const filteredPairs = MARKET_PAIRS.filter((pair) => {
    const keyword = pairSearch.trim().toLowerCase()
    if (!keyword) return true
    return pair.symbol.toLowerCase().includes(keyword) || pair.baseAsset.toLowerCase().includes(keyword)
  })

  const getOpenPositionMetrics = (position: DemoTrade): {
    markPrice: number | null
    pnlValue: number | null
    pnlPercent: number | null
  } => {
    const rawMarkPrice = marketPriceMap[position.symbol] ?? (position.symbol === selectedSymbol ? livePrice : null)
    if (!Number.isFinite(rawMarkPrice) || rawMarkPrice <= 0) {
      return {
        markPrice: null,
        pnlValue: null,
        pnlPercent: null,
      }
    }

    const direction = position.side === 'buy' ? 1 : -1
    const pnlValue = (rawMarkPrice - position.entry_price) * position.quantity * direction
    const pnlBase =
      position.initial_margin != null && position.initial_margin > 0
        ? position.initial_margin
        : position.position_notional != null && position.position_notional > 0
          ? position.position_notional
          : null

    if (!Number.isFinite(pnlValue)) {
      return {
        markPrice: rawMarkPrice,
        pnlValue: null,
        pnlPercent: null,
      }
    }

    const pnlPercent = pnlBase !== null ? (pnlValue / pnlBase) * 100 : null

    return {
      markPrice: rawMarkPrice,
      pnlValue,
      pnlPercent: pnlPercent !== null && Number.isFinite(pnlPercent) ? pnlPercent : null,
    }
  }

  const fetchBalance = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/profile')
    if (res.ok) {
      const data = await res.json()
      if (data.success && data.data) setBalance(Number(data.data.demo_balance))
    }
  }, [])

  const fetchOpenPositions = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/demo/orders?status=open')
    if (res.ok) {
      const data = await res.json()
      if (data.success) setOpenPositions(data.data ?? [])
    }
  }, [])

  const fetchClosedTrades = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/demo/orders?status=closed')
    if (res.ok) {
      const data = await res.json()
      if (data.success) setClosedTrades(data.data ?? [])
    }
  }, [])

  const fetchOrderHistory = useCallback(async (): Promise<void> => {
    const res = await fetch('/api/demo/orders')
    if (res.ok) {
      const data = await res.json()
      if (data.success) setOrderHistory(data.data ?? [])
    }
  }, [])

  useEffect(() => {
    fetchBalance()
    fetchOpenPositions()
    fetchClosedTrades()
    fetchOrderHistory()
  }, [fetchBalance, fetchOpenPositions, fetchClosedTrades, fetchOrderHistory])

  useEffect(() => {
    const streamSymbol = selectedSymbol.toLowerCase()
    setLivePrice(null)
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSymbol}@ticker`)

    ws.onmessage = (event): void => {
      try {
        const payload = JSON.parse(event.data) as { c?: string }
        const next = Number(payload.c)
        if (Number.isFinite(next) && next > 0) {
          setLivePrice(next)
          setMarketPriceMap((prev) => ({
            ...prev,
            [selectedSymbol]: next,
          }))
        }
      } catch {
        return
      }
    }

    ws.onerror = (): void => {
      return
    }

    return () => {
      ws.close()
    }
  }, [selectedSymbol])

  useEffect(() => {
    const symbols = Array.from(
      new Set(openPositions.map((position) => position.symbol).filter((symbol) => symbol !== selectedSymbol))
    )

    if (symbols.length === 0) {
      return
    }

    const sockets = symbols.map((symbol) => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`)

      ws.onmessage = (event): void => {
        try {
          const payload = JSON.parse(event.data) as { c?: string }
          const next = Number(payload.c)
          if (Number.isFinite(next) && next > 0) {
            setMarketPriceMap((prev) => ({
              ...prev,
              [symbol]: next,
            }))
          }
        } catch {
          return
        }
      }

      ws.onerror = (): void => {
        return
      }

      return ws
    })

    return () => {
      sockets.forEach((socket) => socket.close())
    }
  }, [openPositions, selectedSymbol])

  useEffect(() => {
    if (!isPairPickerOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent): void => {
      if (pairPickerRef.current && !pairPickerRef.current.contains(event.target as Node)) {
        setIsPairPickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isPairPickerOpen])

  useEffect(() => {
    const container = document.getElementById(TV_CONTAINER_ID)
    if (!container) return
    container.innerHTML = ''

    const initWidget = (): void => {
      const tradingView = window.TradingView
      if (!tradingView) return

      const widgetConfig: TradingViewWidgetConfig = {
        container_id: TV_CONTAINER_ID,
        symbol: tvSymbol,
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        width: '100%',
        height: '100%',
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        withdateranges: true,
        studies: [],
        backgroundColor: 'rgba(13, 11, 16, 1)',
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

    if (existing) {
      existing.addEventListener('load', initWidget)
      tvScriptRef.current = true
      return
    }

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = (): void => {
      tvScriptRef.current = true
      initWidget()
    }
    document.head.appendChild(script)
  }, [tvSymbol])

  const handlePlaceOrder = async (): Promise<void> => {
    setOrderError(null)
    const leverageValue = parseFloat(leverage)
    const initialMarginValue = parseFloat(initialMargin)
    const limitPrice = parseFloat(orderPrice)
    const tpValue = parseFloat(takeProfit)
    const slValue = parseFloat(stopLoss)

    const entryPrice = orderType === 'Market' ? livePrice ?? NaN : limitPrice

    if (!Number.isInteger(leverageValue) || leverageValue < 1 || leverageValue > 125) {
      setOrderError('Đòn bẩy phải là số nguyên trong khoảng 1 - 125')
      return
    }

    if (!Number.isFinite(initialMarginValue) || initialMarginValue <= 0) {
      setOrderError('Ký quỹ ban đầu phải là số dương hợp lệ')
      return
    }

    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      setOrderError('Đảm bảo có giá hợp lệ để đặt lệnh')
      return
    }

    const positionNotional = initialMarginValue * leverageValue
    const quantity = positionNotional / entryPrice

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setOrderError('Không thể tính số lượng lệnh từ ký quỹ và đòn bẩy')
      return
    }

    const requiredBalance = initialMarginValue + positionNotional * TAKER_FEE_RATE
    if (balance !== null && requiredBalance > balance) {
      setOrderError('Số dư không đủ cho ký quỹ ban đầu và phí mở lệnh')
      return
    }

    const normalizedTakeProfit = Number.isFinite(tpValue) && tpValue > 0 ? tpValue : null
    const normalizedStopLoss = Number.isFinite(slValue) && slValue > 0 ? slValue : null

    if (takeProfit && normalizedTakeProfit === null) {
      setOrderError('TP phải là số dương hợp lệ')
      return
    }

    if (stopLoss && normalizedStopLoss === null) {
      setOrderError('SL phải là số dương hợp lệ')
      return
    }

    setIsSubmitting(true)
    const res = await fetch('/api/demo/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedSymbol,
        side: orderSide,
        orderType: orderType === 'Limit' ? 'limit' : 'market',
        quantity,
        price: orderType === 'Limit' ? entryPrice : null,
        marketPrice: livePrice ?? entryPrice,
        leverage: leverageValue,
        marginMode,
        initialMargin: initialMarginValue,
        takeProfit: normalizedTakeProfit,
        stopLoss: normalizedStopLoss,
      }),
    })
    const result = await res.json()
    setIsSubmitting(false)

    if (result.success) {
      setOrderPrice('')
      setInitialMargin('')
      setTakeProfit('')
      setStopLoss('')
      fetchOpenPositions()
      fetchClosedTrades()
      fetchOrderHistory()
      fetchBalance()
    } else {
      const errorMap: Record<string, string> = {
        INSUFFICIENT_BALANCE: 'Số dư không đủ',
        VALIDATION_ERROR: 'Dữ liệu không hợp lệ',
        INTERNAL_ERROR: 'Lỗi hệ thống',
      }
      setOrderError(errorMap[result.error] ?? result.error ?? 'Đặt lệnh thất bại')
    }
  }

  const handleClosePosition = async (trade: DemoTrade): Promise<void> => {
    const typedExitPrice = parseFloat(orderPrice)
    const fallbackExitPrice = livePrice ?? trade.entry_price
    const exitPrice = Number.isFinite(typedExitPrice) && typedExitPrice > 0 ? typedExitPrice : fallbackExitPrice
    const res = await fetch('/api/demo/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId: trade.id, exitPrice }),
    })
    const result = await res.json()
    if (result.success) {
      fetchOpenPositions()
      fetchClosedTrades()
      fetchOrderHistory()
      fetchBalance()
    }
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <section className="flex-1 flex flex-col min-w-0 bg-background-dark">
        <div className="relative h-12 border-b border-primary/10 flex items-center px-4 gap-6 shrink-0 bg-panel-dark/50">
          <div ref={pairPickerRef} className="relative flex items-center gap-2">
            <button
              onClick={() => setIsPairPickerOpen((prev) => !prev)}
              className="group inline-flex items-center gap-1 rounded-md border border-primary/20 px-2 py-1 hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <span className="font-bold text-lg leading-none">{selectedPair.replace('/', ' / ')}</span>
              <span className="material-symbols-outlined text-base text-slate-400 group-hover:text-primary">
                {isPairPickerOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            <span className="text-xs px-2 py-0.5 rounded bg-accent text-background-dark font-bold uppercase">
              Demo
            </span>

            {isPairPickerOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[490px] max-w-[calc(100vw-360px)] min-w-[280px] rounded-lg border border-primary/20 bg-[#202630] shadow-2xl">
                <div className="p-4 pb-2">
                  <div className="relative mb-3">
                    <span className="material-symbols-outlined absolute left-2 top-1.5 text-slate-500 text-lg">
                      search
                    </span>
                    <input
                      type="text"
                      value={pairSearch}
                      onChange={(event) => setPairSearch(event.target.value)}
                      placeholder="Tìm"
                      autoFocus
                      className="w-full bg-slate-800/50 border border-primary/20 rounded-lg pl-8 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-4 border-b border-primary/10 pb-2 text-xs font-semibold">
                    <span className="text-slate-300">Yêu thích</span>
                    <span className="text-primary border-b border-primary pb-1">USDⓈ-M</span>
                    <span className="text-slate-500">COIN-M</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-[11px]">Tất cả</span>
                    <span className="px-2 py-0.5 rounded text-slate-500 text-[11px]">Niêm yết mới</span>
                    <span className="px-2 py-0.5 rounded text-slate-500 text-[11px]">TradFi</span>
                    <span className="px-2 py-0.5 rounded text-slate-500 text-[11px]">Pre-Market</span>
                    <span className="px-2 py-0.5 rounded text-slate-500 text-[11px]">USDC</span>
                    <span className="px-2 py-0.5 rounded text-slate-500 text-[11px]">Alpha</span>
                  </div>
                </div>

                <div className="px-4 pb-3">
                  <div className="grid grid-cols-[1.6fr_1fr] text-[11px] text-slate-500 border-b border-primary/10 pb-2">
                    <span>Hợp đồng</span>
                    <span className="text-right">Giá gần nhất</span>
                  </div>

                  <div className="max-h-72 overflow-y-auto">
                    {filteredPairs.length === 0 && (
                      <div className="py-6 text-center text-xs text-slate-500">Không tìm thấy cặp phù hợp</div>
                    )}

                    {filteredPairs.map((pair) => {
                      const symbolKey = pair.symbol.replace('/', '')
                      const rawPrice = marketPriceMap[symbolKey] ?? (symbolKey === selectedSymbol ? livePrice : null)
                      const hasPrice = Number.isFinite(rawPrice) && rawPrice > 0

                      return (
                        <button
                          key={pair.symbol}
                          type="button"
                          onClick={() => {
                            setSelectedPair(pair.symbol)
                            setIsPairPickerOpen(false)
                            setPairSearch('')
                          }}
                          className={`w-full grid grid-cols-[1.6fr_1fr] items-center gap-2 px-2 py-2 text-left text-xs border-b border-primary/5 transition-colors ${
                            selectedPair === pair.symbol ? 'bg-primary/10' : 'hover:bg-primary/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined text-base text-primary">star</span>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-200 truncate">{symbolKey}</div>
                              <div className="text-[10px] text-slate-500">Vĩnh cửu</div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-slate-200">
                            {hasPrice
                              ? rawPrice.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 6,
                                })
                              : '--'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase font-bold">TradingView Chart</span>
            <span className="font-mono text-primary font-bold text-xs">
              {livePrice !== null
                ? `${livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`
                : 'Dang cap nhat...'}
            </span>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <div id={TV_CONTAINER_ID} className="w-full h-full" />
        </div>

        <div className="h-52 border-t border-primary/10 flex flex-col shrink-0 bg-panel-dark">
          <div className="flex border-b border-primary/10 shrink-0">
            {(
              [
                { key: 'positions', label: `Vị thế mở (${openPositions.length})` },
                { key: 'orderHistory', label: `Lịch sử lệnh (${orderHistory.length})` },
                { key: 'tradeHistory', label: 'Lịch sử giao dịch' },
              ] as { key: BottomTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setBottomTab(tab.key)}
                className={`px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  bottomTab === tab.key
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            {bottomTab === 'positions' && openPositions.length > 0 && (
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-500 border-b border-primary/5 sticky top-0 bg-panel-dark">
                  <tr>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Side</th>
                    <th className="p-2">Số lượng</th>
                    <th className="p-2">Giá vào</th>
                    <th className="p-2">Giá thị trường</th>
                    <th className="p-2">Realized PNL (%)</th>
                    <th className="p-2">Mode</th>
                    <th className="p-2">Leverage</th>
                    <th className="p-2">Ký quỹ</th>
                    <th className="p-2">Loại</th>
                    <th className="p-2 text-right">Đóng</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos) => {
                    const metrics = getOpenPositionMetrics(pos)
                    const pnlClass =
                      metrics.pnlValue == null
                        ? 'text-slate-500'
                        : metrics.pnlValue >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'

                    return (
                      <tr key={pos.id} className="border-b border-primary/5">
                        <td className="p-2 font-bold">{pos.symbol}</td>
                        <td className={`p-2 font-bold ${pos.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pos.side === 'buy' ? 'MUA' : 'BÁN'}
                        </td>
                        <td className="p-2 font-mono">{pos.quantity}</td>
                        <td className="p-2 font-mono">{pos.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="p-2 font-mono text-primary">
                          {metrics.markPrice != null
                            ? metrics.markPrice.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 6,
                              })
                            : '--'}
                        </td>
                        <td className={`p-2 font-mono font-bold ${pnlClass}`}>
                          {metrics.pnlValue != null
                            ? `${metrics.pnlValue >= 0 ? '+' : ''}${metrics.pnlValue.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4,
                              })} (${metrics.pnlPercent != null ? `${metrics.pnlPercent >= 0 ? '+' : ''}${metrics.pnlPercent.toFixed(2)}%` : '--'})`
                            : '--'}
                        </td>
                        <td className="p-2 uppercase">{pos.margin_mode ?? '--'}</td>
                        <td className="p-2 font-mono">{pos.leverage != null ? `${pos.leverage}x` : '--'}</td>
                        <td className="p-2 font-mono">
                          {pos.initial_margin != null
                            ? pos.initial_margin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                            : '--'}
                        </td>
                        <td className="p-2 capitalize">{pos.order_type}</td>
                        <td className="p-2 text-right">
                          <button
                            onClick={() => handleClosePosition(pos)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-[10px] transition-colors"
                          >
                            Đóng
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {bottomTab === 'positions' && openPositions.length === 0 && (
              <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                Không có vị thế mở
              </div>
            )}

            {bottomTab === 'orderHistory' && orderHistory.length > 0 && (
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-500 border-b border-primary/5 sticky top-0 bg-panel-dark">
                  <tr>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Order</th>
                    <th className="p-2">Size</th>
                    <th className="p-2">Notional</th>
                    <th className="p-2">Margin</th>
                    <th className="p-2">Lev</th>
                    <th className="p-2">Mode</th>
                    <th className="p-2">Entry</th>
                    <th className="p-2">TP</th>
                    <th className="p-2">SL</th>
                    <th className="p-2">Realtime giá đặt</th>
                    <th className="p-2">Thời gian</th>
                    <th className="p-2">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {orderHistory.map((trade) => (
                    <tr key={trade.id} className="border-b border-primary/5">
                      <td className="p-2 font-bold">{trade.symbol}</td>
                      <td className={`p-2 font-bold ${trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trade.side === 'buy' ? 'MUA' : 'BÁN'} {trade.order_type.toUpperCase()}
                      </td>
                      <td className="p-2 font-mono">{trade.quantity}</td>
                      <td className="p-2 font-mono">
                        {trade.position_notional != null
                          ? trade.position_notional.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                          : '--'}
                      </td>
                      <td className="p-2 font-mono">
                        {trade.initial_margin != null
                          ? trade.initial_margin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                          : '--'}
                      </td>
                      <td className="p-2 font-mono">{trade.leverage != null ? `${trade.leverage}x` : '--'}</td>
                      <td className="p-2 uppercase">{trade.margin_mode ?? '--'}</td>
                      <td className="p-2 font-mono">
                        {trade.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                      </td>
                      <td className="p-2 font-mono">
                        {trade.take_profit != null
                          ? trade.take_profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                          : '--'}
                      </td>
                      <td className="p-2 font-mono">
                        {trade.stop_loss != null
                          ? trade.stop_loss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                          : '--'}
                      </td>
                      <td className="p-2 font-mono text-primary">
                        {trade.market_price_at_open != null
                          ? trade.market_price_at_open.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                          : '--'}
                      </td>
                      <td className="p-2 text-slate-500">
                        {new Date(trade.opened_at).toLocaleDateString('vi-VN', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className={`p-2 text-[10px] font-bold uppercase ${trade.status === 'open' ? 'text-primary' : trade.status === 'closed' ? 'text-slate-300' : 'text-slate-500'}`}>
                        {trade.status === 'open' ? 'Mở' : trade.status === 'closed' ? 'Đóng' : 'Hủy'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {bottomTab === 'orderHistory' && orderHistory.length === 0 && (
              <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                Không có lịch sử lệnh
              </div>
            )}

            {bottomTab === 'tradeHistory' && (
              <>
                {[...openPositions, ...closedTrades].length > 0 ? (
                  <table className="w-full text-left text-[11px]">
                    <thead className="text-slate-500 border-b border-primary/5 sticky top-0 bg-panel-dark">
                      <tr>
                        <th className="p-2">Symbol</th>
                        <th className="p-2">Side</th>
                        <th className="p-2">KL</th>
                        <th className="p-2">Giá vào</th>
                        <th className="p-2">Giá ra</th>
                        <th className="p-2">Realized PNL</th>
                        <th className="p-2">Trạng thái</th>
                        <th className="p-2">Ngày mở</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...openPositions, ...closedTrades]
                        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
                        .map((trade) => (
                          <tr key={trade.id} className="border-b border-primary/5">
                            <td className="p-2 font-bold">{trade.symbol}</td>
                            <td className={`p-2 font-bold ${trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {trade.side === 'buy' ? 'MUA' : 'BÁN'}
                            </td>
                            <td className="p-2 font-mono">{trade.quantity}</td>
                            <td className="p-2 font-mono">
                              {trade.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 font-mono">
                              {trade.exit_price != null
                                ? trade.exit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })
                                : '--'}
                            </td>
                            <td className={`p-2 font-mono font-bold ${trade.realized_pnl == null ? 'text-slate-500' : trade.realized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {trade.realized_pnl != null
                                ? `${trade.realized_pnl >= 0 ? '+' : ''}${trade.realized_pnl.toFixed(2)}`
                                : '--'}
                            </td>
                            <td className={`p-2 text-[10px] font-bold uppercase ${trade.status === 'open' ? 'text-primary' : trade.status === 'closed' ? 'text-slate-400' : 'text-slate-600'}`}>
                              {trade.status === 'open' ? 'Mở' : trade.status === 'closed' ? 'Đóng' : 'Hủy'}
                            </td>
                            <td className="p-2 text-slate-500">
                              {new Date(trade.opened_at).toLocaleDateString('vi-VN', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                    Không có lịch sử giao dịch
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <aside className="w-72 border-l border-primary/10 bg-background-light dark:bg-background-dark flex flex-col shrink-0">
        <div className="flex p-2 gap-2 border-b border-primary/10 bg-panel-dark/30">
          <button
            onClick={() => setOrderSide('buy')}
            className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${
              orderSide === 'buy'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            MUA
          </button>
          <button
            onClick={() => setOrderSide('sell')}
            className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${
              orderSide === 'sell'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            BÁN
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 font-bold">Loại lệnh</span>
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value as OrderType)}
              className="bg-panel-dark border border-primary/20 rounded text-xs py-1 px-2 focus:ring-1 focus:ring-primary outline-none"
            >
              <option>Limit</option>
              <option>Market</option>
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] uppercase text-slate-500 font-bold">Chế độ ký quỹ</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMarginMode('cross')}
                className={`py-2 text-[11px] font-bold rounded border transition-colors ${
                  marginMode === 'cross'
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-primary/20 text-slate-400 bg-panel-dark'
                }`}
              >
                Cross
              </button>
              <button
                type="button"
                onClick={() => setMarginMode('isolated')}
                className={`py-2 text-[11px] font-bold rounded border transition-colors ${
                  marginMode === 'isolated'
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-primary/20 text-slate-400 bg-panel-dark'
                }`}
              >
                Isolated
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase text-slate-500 font-bold">Đòn bẩy (x)</label>
            <input
              type="number"
              min="1"
              max="125"
              step="1"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              placeholder="10"
              className="w-full bg-panel-dark border border-primary/20 rounded-lg text-sm font-mono font-bold text-right pr-4 py-2 focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          {orderType === 'Limit' && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold">Giá (USDT)</label>
              <input
                type="number"
                min="0"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-panel-dark border border-primary/20 rounded-lg text-sm font-mono font-bold text-right pr-4 py-2 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          )}

          {orderType === 'Market' && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold">Giá realtime (USDT)</label>
              <div className="w-full bg-panel-dark border border-primary/20 rounded-lg text-sm font-mono font-bold text-right pr-4 py-2 text-primary">
                {livePrice !== null
                  ? livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
                  : '--'}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] uppercase text-slate-500 font-bold">Ký quỹ ban đầu (USDT)</label>
            <input
              type="number"
              min="0"
              value={initialMargin}
              onChange={(e) => setInitialMargin(e.target.value)}
              placeholder="0.00"
              className="w-full bg-panel-dark border border-primary/20 rounded-lg text-sm font-mono font-bold text-right pr-4 py-2 focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold">Quy mô lệnh (USDT)</label>
              <div className="w-full bg-panel-dark border border-primary/20 rounded-lg text-xs font-mono font-bold text-right pr-3 py-2">
                {formattedPositionNotional !== '--' ? `${formattedPositionNotional} USDT` : '--'}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold">Số lượng ({baseAsset})</label>
              <div className="w-full bg-panel-dark border border-primary/20 rounded-lg text-xs font-mono font-bold text-right pr-3 py-2">
                {formattedEstimatedQuantity !== '--' ? `${formattedEstimatedQuantity} ${baseAsset}` : '--'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold">Take Profit</label>
              <input
                type="number"
                min="0"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                className="w-full bg-panel-dark border border-primary/20 rounded-lg text-xs font-mono font-bold text-right pr-3 py-2 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase text-slate-500 font-bold">Stop Loss</label>
              <input
                type="number"
                min="0"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className="w-full bg-panel-dark border border-primary/20 rounded-lg text-xs font-mono font-bold text-right pr-3 py-2 focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          </div>

          <div className="border-t border-primary/10 pt-4 mt-2 space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Số dư khả dụng</span>
              <span className="font-mono font-bold">
                {balance !== null ? `${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Phí mở lệnh</span>
              <span className="font-mono font-bold">{formattedEntryFee !== '--' ? `${formattedEntryFee} USDT` : '--'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Yêu cầu số dư</span>
              <span className="font-mono font-bold">{formattedRequiredBalance !== '--' ? `${formattedRequiredBalance} USDT` : '--'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Tối đa quy mô lệnh</span>
              <span className="font-mono font-bold text-emerald-400">{maxNotional !== '--' ? `${maxNotional} USDT` : '--'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Tối đa số lượng</span>
              <span className="font-mono font-bold text-emerald-400">{maxQuantity !== '--' ? `${maxQuantity} ${baseAsset}` : '--'}</span>
            </div>
          </div>

          {orderError && (
            <p className="text-[10px] text-rose-400 font-bold text-center">{orderError}</p>
          )}

          <button
            onClick={handlePlaceOrder}
            disabled={isSubmitting}
            className={`w-full py-3 mt-2 text-white font-bold rounded-xl shadow-lg transition-all uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              orderSide === 'buy'
                ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                : 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
            }`}
          >
            {isSubmitting ? 'Đang xử lý...' : orderSide === 'buy' ? 'Mở Long' : 'Mở Short'}
          </button>
        </div>
      </aside>
    </div>
  )
}
