# UI Prompt: Dashboard Analytics

## Context

Màn hình chính sau khi đăng nhập. Hiển thị tổng hợp PNL, các biểu đồ phân tích hiệu suất giao dịch, portfolio balance từng sàn, và danh sách trades gần đây. Đây là trang được sử dụng nhiều nhất — ưu tiên tốc độ nhận thông tin và clarity.

## Design Direction

- Dark theme nhất quán: bg `zinc-950`, cards `zinc-900`, border `zinc-800`
- Màu PNL: positive `emerald-400`, negative `red-400`
- Side `BUY` = `emerald-400`, `SELL` = `red-400`
- Accent xanh lá cho interactive elements
- Layout: sidebar trái cố định + main content area
- Responsive: sidebar collapse thành bottom nav trên mobile

## Layout

```
+---------------------+------------------------------------------+
|                     |  Header: filters + time range            |
|   Sidebar           +------------------------------------------+
|   - Logo            |  PNL Overview Cards (row)                |
|   - Nav items       +------------------------------------------+
|   - Exchange list   |  Cumulative PNL Chart  | Daily Bar Chart  |
|   (collapsible)     +------------------------------------------+
|                     |  Trade Distribution    | Portfolio Balance|
|                     +------------------------------------------+
|                     |  Recent Trades Table                     |
+---------------------+------------------------------------------+
```

## Components

### Sidebar

- Width: `w-64`, bg `zinc-900`, border-r `zinc-800`
- Logo aiTrackProfit ở đỉnh (icon + text)
- Nav items với Lucide icons:
  - Dashboard (`LayoutDashboard`) — active state: bg `zinc-800`, left border `emerald-500 w-1`
  - Demo Trading (`TrendingUp`)
  - Ask AI (`Bot`)
  - Profile (`UserCircle`)
- Bottom section: avatar + display name + Settings icon
- Collapse button (`ChevronLeft`) — khi collapsed chỉ hiện icons

### Header / Filter Bar

Sticky top trong main area:

- Left: Heading "Dashboard"
- Right: filter group
  - Exchange dropdown — `Select` component, options: "All Exchanges" + từng exchange có logo nhỏ
  - Time range button group: `Today | 7D | 30D | 1Y | All` — pill buttons, active bg `emerald-500`

### PNL Overview Cards (row)

6 metric cards trong một row (2 columns trên mobile, 3 trên tablet, 6 trên desktop):

Mỗi card:
- bg `zinc-900`, border `zinc-800`, rounded-xl, p-5
- Label nhỏ màu `zinc-400` (uppercase, letter-spacing)
- Value lớn (text-2xl font-bold) — màu emerald/red nếu là PNL
- Sub-info nhỏ bên dưới (ví dụ: "vs yesterday +$120")
- Icon phải (mờ 20%) liên quan: `TrendingUp`, `Trophy`, `BarChart2`, `Target`, `AlertTriangle`, `Calendar`

Cards:
1. Total PNL — `$12,450.00` — màu emerald nếu dương
2. Win Rate — `68.4%` — mini progress bar bên dưới
3. Total Trades — `347`
4. Best Trade — `+$2,100` — symbol tag
5. Worst Trade — `-$890` — symbol tag
6. Today's PNL — `+$320` — delta indicator

### Cumulative PNL Chart

- shadcn Card wrapper, header: "Cumulative PNL" + export icon (optional)
- Recharts `LineChart`:
  - Gradient fill dưới line: emerald khi above zero, red khi below
  - Zero reference line: dashed `zinc-600`
  - Custom Tooltip: card bg `zinc-800`, show Date + PNL + Cumulative
  - X-axis: `zinc-500` text, format adaptive theo range
  - Y-axis: USD format `$xx,xxx`
  - Responsive container, height `280px`
- Loading state: shimmer skeleton

### Daily Profit Bar Chart

- Recharts `BarChart`:
  - Bar màu: positive `emerald-500`, negative `red-500`
  - Custom Tooltip: Date, Wins, Losses, Net PNL
  - No legend (self-explanatory)
  - Height `180px`

### Trade Distribution Chart

- Recharts `PieChart` (donut):
  - Innerradius 60%, outerRadius 90%
  - Màu per exchange: Binance `yellow-400`, OKX `blue-400`, Bybit `orange-400`, Bitget `cyan-400`, Gate.io `emerald-500`
  - Center text: "Total Trades" + count
  - Legend bên dưới: tên exchange + count + %
  - Hover: slice scale up nhẹ + tooltip

### Portfolio Balance Overview

Card chia danh sách:
- Header: "Portfolio Balance" + tổng USD (text-xl bold emerald)
- Mỗi exchange row:
  - Exchange logo (`img` 24px) + name + label (badge)
  - Balance USD (text-right, bold)
  - Top 3 assets tags nhỏ: `BTC: 0.02 | ETH: 0.5`
  - Status badge: `Connected` (emerald) | `Error` (red) | `Inactive` (zinc)
- Loading: skeleton rows
- Error per exchange: inline warning icon + "Failed to load" + retry button

### Recent Trades Table

- shadcn `Table`
- Columns: Exchange logo, Symbol, Side (badge BUY/SELL), Qty, Entry Price, PNL, Date
- Row hover: bg `zinc-800`
- PNL cell: emerald / red với `+/-` prefix
- Pagination: "Showing 1-20 of 347 trades" + prev/next
- Link "View all trades →" ở footer table

### Empty States

Khi chưa có exchange:
- Centered trong main area
- Icon lớn: `PlugZap` (mờ, 80px)
- Text: "No exchanges connected"
- Button "Connect your first exchange" → mở Connect Exchange modal

Khi đang sync:
- Spinner + "Syncing trades from Binance..."
- Progress bar

Khi không có data trong range:
- Icon: `CalendarX`, text "No trades in this period"

## Component Library

shadcn/ui: `Card`, `CardHeader`, `CardContent`, `Button`, `Badge`, `Select`, `Table`, `TableRow`, `TableCell`, `Skeleton`, `Separator`

Recharts: `LineChart`, `BarChart`, `PieChart`, `ResponsiveContainer`, `Tooltip`, `Legend`, `ReferenceLine`, `Cell`

Lucide: `LayoutDashboard`, `TrendingUp`, `Bot`, `UserCircle`, `ChevronLeft`, `TrendingDown`, `Trophy`, `Target`, `AlertTriangle`, `Calendar`, `PlugZap`, `CalendarX`, `RefreshCw`, `Download`

## Interactions

- Time range change → refetch tất cả widgets với loading skeleton
- Exchange filter change → filter data client-side nếu đã fetched, else refetch
- Hover chart → tooltip hiển thị
- Resize window → charts reflow responsive
- Balance auto-refresh: badge "Updated just now" → "Updated 5m ago" (relative time)

## File Structure Target

```
src/
  app/
    (dashboard)/
      dashboard/page.tsx
  components/
    features/
      dashboard/
        PNLOverviewCards.tsx
        CumulativePNLChart.tsx
        DailyProfitChart.tsx
        TradeDistributionChart.tsx
        PortfolioBalanceCard.tsx
        RecentTradesTable.tsx
        DashboardFilters.tsx
        DashboardEmptyState.tsx
    layout/
      Sidebar.tsx
      SidebarNav.tsx
```
