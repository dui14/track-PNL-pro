'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { DemoTrade } from '@/lib/types'

declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => void
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

const TV_CONTAINER_ID = 'tv_demo_chart'

export function DemoTradingTerminal(): React.JSX.Element {
  const [selectedPair, setSelectedPair] = useState('ETH/USDT')
  const [orderSide, setOrderSide] = useState<OrderSide>('buy')
  const [orderType, setOrderType] = useState<OrderType>('Limit')
  const [orderPrice, setOrderPrice] = useState('')
  const [orderSize, setOrderSize] = useState('')
  const [bottomTab, setBottomTab] = useState<BottomTab>('positions')
  const [balance, setBalance] = useState<number | null>(null)
  const [openPositions, setOpenPositions] = useState<DemoTrade[]>([])
  const [closedTrades, setClosedTrades] = useState<DemoTrade[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const tvScriptRef = useRef(false)

  const selectedPairData = MARKET_PAIRS.find((p) => p.symbol === selectedPair)
  const baseAsset = selectedPairData?.baseAsset ?? selectedPair.split('/')[0]
  const tvSymbol = selectedPairData?.tvSymbol ?? 'BINANCE:ETHUSDT'

  const cost = (() => {
    const p = parseFloat(orderPrice)
    const s = parseFloat(orderSize)
    if (!isNaN(p) && !isNaN(s) && p > 0 && s > 0) return (p * s).toLocaleString('en-US', { maximumFractionDigits: 2 })
    return '--'
  })()

  const maxBuy = (() => {
    if (balance === null) return '--'
    const p = parseFloat(orderPrice)
    if (!isNaN(p) && p > 0) return (balance / p).toLocaleString('en-US', { maximumFractionDigits: 4 })
    return '--'
  })()

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

  useEffect(() => {
    fetchBalance()
    fetchOpenPositions()
    fetchClosedTrades()
  }, [fetchBalance, fetchOpenPositions, fetchClosedTrades])

  useEffect(() => {
    const container = document.getElementById(TV_CONTAINER_ID)
    if (!container) return
    container.innerHTML = ''

    const initWidget = (): void => {
      new window.TradingView.widget({
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
      })
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
    const price = parseFloat(orderPrice)
    const quantity = parseFloat(orderSize)
    if (isNaN(price) || price <= 0 || isNaN(quantity) || quantity <= 0) {
      setOrderError('Nhập giá và số lượng hợp lệ')
      return
    }

    setIsSubmitting(true)
    const res = await fetch('/api/demo/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: selectedPair.replace('/', ''),
        side: orderSide,
        orderType: orderType === 'Limit' ? 'limit' : 'market',
        quantity,
        price,
      }),
    })
    const result = await res.json()
    setIsSubmitting(false)

    if (result.success) {
      setOrderPrice('')
      setOrderSize('')
      fetchOpenPositions()
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
    const exitPrice = parseFloat(orderPrice) || trade.entry_price
    const res = await fetch('/api/demo/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tradeId: trade.id, exitPrice }),
    })
    const result = await res.json()
    if (result.success) {
      fetchOpenPositions()
      fetchClosedTrades()
      fetchBalance()
    }
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <aside className="w-64 border-r border-primary/10 bg-background-light dark:bg-background-dark flex flex-col shrink-0">
        <div className="p-3 border-b border-primary/10">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1.5 text-slate-500 text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Tìm cặp..."
              className="w-full bg-slate-800/50 border-none rounded-lg pl-8 py-1.5 text-xs focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-background-dark text-slate-500 font-bold border-b border-primary/10">
              <tr>
                <th className="p-3 uppercase">Cặp</th>
                <th className="p-3 uppercase text-right">Biểu đồ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {MARKET_PAIRS.map((pair) => (
                <tr
                  key={pair.symbol}
                  onClick={() => setSelectedPair(pair.symbol)}
                  className={`cursor-pointer transition-colors ${
                    selectedPair === pair.symbol
                      ? 'bg-primary/10 border-l-2 border-primary'
                      : 'hover:bg-primary/5'
                  }`}
                >
                  <td className="p-3 font-bold">{pair.symbol}</td>
                  <td className="p-3 text-right font-mono text-slate-500 text-[10px]">
                    {selectedPair === pair.symbol ? (
                      <span className="text-primary">Live</span>
                    ) : (
                      'TV'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 bg-background-dark">
        <div className="h-12 border-b border-primary/10 flex items-center px-4 gap-6 shrink-0 bg-panel-dark/50">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg">{selectedPair.replace('/', ' / ')}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-accent text-background-dark font-bold uppercase">
              Demo
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase font-bold">TradingView Chart</span>
            <span className="font-mono text-primary font-bold text-xs">Live Data</span>
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
                { key: 'orderHistory', label: `Lịch sử lệnh (${closedTrades.length})` },
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
                    <th className="p-2">Loại</th>
                    <th className="p-2 text-right">Đóng</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos) => (
                    <tr key={pos.id} className="border-b border-primary/5">
                      <td className="p-2 font-bold">{pos.symbol}</td>
                      <td className={`p-2 font-bold ${pos.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pos.side === 'buy' ? 'MUA' : 'BÁN'}
                      </td>
                      <td className="p-2 font-mono">{pos.quantity}</td>
                      <td className="p-2 font-mono">{pos.entry_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
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
                  ))}
                </tbody>
              </table>
            )}
            {bottomTab === 'positions' && openPositions.length === 0 && (
              <div className="flex items-center justify-center h-full text-slate-600 text-xs">
                Không có vị thế mở
              </div>
            )}

            {bottomTab === 'orderHistory' && closedTrades.length > 0 && (
              <table className="w-full text-left text-[11px]">
                <thead className="text-slate-500 border-b border-primary/5 sticky top-0 bg-panel-dark">
                  <tr>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Side</th>
                    <th className="p-2">Số lượng</th>
                    <th className="p-2">Giá vào</th>
                    <th className="p-2">Giá ra</th>
                    <th className="p-2">Realized PNL</th>
                    <th className="p-2">Đóng lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((trade) => (
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
                      <td className={`p-2 font-mono font-bold ${(trade.realized_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {trade.realized_pnl != null
                          ? `${trade.realized_pnl >= 0 ? '+' : ''}${trade.realized_pnl.toFixed(2)}`
                          : '--'}
                      </td>
                      <td className="p-2 text-slate-500">
                        {trade.closed_at
                          ? new Date(trade.closed_at).toLocaleDateString('vi-VN', {
                              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                            })
                          : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {bottomTab === 'orderHistory' && closedTrades.length === 0 && (
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

          <div className="space-y-2">
            <label className="text-[10px] uppercase text-slate-500 font-bold">Số lượng ({baseAsset})</label>
            <input
              type="number"
              min="0"
              value={orderSize}
              onChange={(e) => setOrderSize(e.target.value)}
              placeholder="0.00"
              className="w-full bg-panel-dark border border-primary/20 rounded-lg text-sm font-mono font-bold text-right pr-4 py-2 focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          <div className="border-t border-primary/10 pt-4 mt-2 space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Số dư khả dụng</span>
              <span className="font-mono font-bold">
                {balance !== null ? `${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDT` : '--'}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Tổng chi phí</span>
              <span className="font-mono font-bold">{cost !== '--' ? `${cost} USDT` : '--'}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-500">Tối đa {orderSide === 'buy' ? 'mua' : 'bán'}</span>
              <span className="font-mono font-bold text-emerald-400">{maxBuy !== '--' ? `${maxBuy} ${baseAsset}` : '--'}</span>
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
