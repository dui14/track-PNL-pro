# UI Prompt: Demo Trading

## Context

Môi trường paper trading với TradingView chart, real-time price từ Binance WebSocket, đặt lệnh Market/Limit, theo dõi positions và PNL realtime, quản lý virtual balance. Giao diện phải giống với trading terminal thực tế — dense information, functional, không dư thừa.

## Design Direction

- Full-screen trading layout — không scroll
- Dark theme cực đậm: bg `zinc-950`, panels `zinc-900`, borders `zinc-800`
- Accent: BUY `emerald-500`, SELL `red-500`
- Monospace font cho giá và số (font-mono)
- Compact spacing — information density cao
- Responsive: trên mobile, panels stack dọc và scroll

## Layout

```
+----------------------------------------------------------+
| Header: Logo | Pair Selector | Live Price | Balance      |
+--------------------+-------------------------------------+
|                    |  TradingView Chart (main area)      |
|  Order Panel       +-------------------------------------+
|  - Order type tabs |  Positions / Orders / History tabs  |
|  - Buy/Sell tabs   |  (table, scrollable)                |
|  - Form            |                                     |
|  - Submit button   |                                     |
+--------------------+-------------------------------------+
```

Desktop: 2-column layout (order panel fixed `w-72` bên trái, chart + tables chiếm phần còn lại)
Mobile: chart on top (full width), order panel + tables bên dưới (tabs để switch)

## Components

### Header Bar

- Left: logo nhỏ + "Demo Trading" label (badge `zinc-700` text `zinc-300`: "PAPER")
- Center: Pair selector dropdown
  - Trigger: "BTCUSDT" với icon `ChevronDown`
  - Dropdown items: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT
  - Mỗi item có icon coin + name + 24h change %
- Right cluster:
  - Live price: large monospace, màu theo 24h change (emerald/red), badge nhỏ "LIVE" với dot pulse
  - 24h change %
  - Separator
  - Virtual Balance: icon `Wallet`, "10,000.00 USDT" text emerald
  - WebSocket status dot: xanh (connected) / vàng (connecting) / đỏ (disconnected)

### TradingView Chart

- Container chiếm toàn bộ không gian còn lại
- Embed TradingView Lightweight Charts widget (iframe hoặc library)
- Timeframe selector bar bên trên chart: `1m | 5m | 15m | 1h | 4h | 1D` — pills, active highlight
- Chart frame không có padding thừa — edge to edge
- Loading state: skeleton với màu tối

### Order Panel (trái)

**Order Type Tabs** (Market | Limit):
- 2 tabs, pill style, active bg `zinc-700`

**Side Tabs** (Buy | Sell):
- 2 tabs kịch size, BUY active = solid `emerald-500` bg, SELL active = solid `red-500` bg

**Form content:**

Market Order:
- Row "Price": value = "Market" (disabled, italic), text `zinc-400`
- Row "Quantity": input số, suffix "USDT" | toggle "Units" / "USDT"
- Quick fill buttons: "25%" | "50%" | "75%" | "100%" — pills nhỏ
- Row "Est. Cost": calculated value, monospace

Limit Order:
- Row "Limit Price": input số, suffix token (BTC), current price hint bên dưới
- Row "Quantity": input + quick fill buttons
- Row "Est. Cost": calculated

**Order Summary Box** (bg `zinc-800`, rounded, text nhỏ):
- Available Balance: xxx USDT
- Fee (0.1%): $x.xx
- Total: $xxx.xx

**Submit Button**:
- Full width, large, bold
- BUY → bg `emerald-500` hover `emerald-400`, text "Buy BTC"
- SELL → bg `red-500` hover `red-400`, text "Sell BTC"
- Loading state: spinner + "Placing order..."
- Disabled với tooltip nếu không đủ balance

### Bottom Panel — Positions / Open Orders / Trade History

**Tabs**: "Positions ({count})" | "Open Orders ({count})" | "History"

**Positions Tab**:
Table columns: Symbol | Side | Qty | Entry Price | Current Price | Unrealized PNL | Unrealized % | Duration | Actions

- Unrealized PNL: emerald nếu dương, red nếu âm, update realtime
- Duration: "2h 30m" relative
- Actions: button "Close" (outline red, nhỏ) → confirmation popover ("Close at market price $xxx. Confirm?")
- Mỗi row có subtle background tint: emerald-950 nếu profitable, red-950 nếu loss

**Open Orders Tab** (Limit orders đang chờ):
Table: Symbol | Side | Type | Qty | Limit Price | Current Price | Status | Actions

- Status badge: "Pending" `yellow-500`, "Filled" `emerald-500`, "Cancelled" `zinc-500`
- Actions: "Cancel" button

**History Tab**:
Table: Symbol | Side | Qty | Entry | Exit | PNL | Date

- Sortable by date
- PNL colored
- Pagination

### Reset Demo Account

- Button nhỏ ở cuối order panel: "Reset Account" — outline zinc, icon `RotateCcw`
- Confirmation dialog: "Reset your demo account to 10,000 USDT? All positions and history will be cleared."
- 2 buttons: "Cancel" + "Reset" (red)

## Real-time Updates

- Live price tag: update mỗi tick từ WebSocket, số thay đổi với micro-animation (flash xanh/đỏ 200ms)
- Unrealized PNL trong positions table: update theo price tick
- WebSocket connection indicator xử lý reconnect UI

## Loading & Error States

- Chart loading: skeleton dark
- Order placement loading: button spinner
- WebSocket disconnected: toast warning "Price feed disconnected. Reconnecting..."
- Insufficient balance: inline error dưới submit button "Insufficient balance"
- No open positions: empty state "No open positions. Place your first trade above."

## Component Library

shadcn/ui: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Input`, `Button`, `Badge`, `Select`, `Table`, `Dialog`, `DialogContent`, `Popover`, `Tooltip`, `Separator`

Lucide: `TrendingUp`, `TrendingDown`, `Wallet`, `RotateCcw`, `ChevronDown`, `Zap`, `Clock`, `X`, `Check`

## File Structure Target

```
src/
  app/
    (dashboard)/
      demo/page.tsx
  components/
    features/
      demo/
        DemoHeader.tsx
        PairSelector.tsx
        LivePriceDisplay.tsx
        TradingViewChart.tsx
        OrderPanel.tsx
        MarketOrderForm.tsx
        LimitOrderForm.tsx
        OrderSummary.tsx
        PositionsTable.tsx
        OpenOrdersTable.tsx
        TradeHistoryTable.tsx
        ResetDemoDialog.tsx
        WebSocketStatusIndicator.tsx
```
