# Feature Specification: Dashboard Analytics

## Overview

Dashboard là màn hình chính sau khi đăng nhập, cung cấp tổng quan toàn diện về hiệu suất giao dịch của user. Bao gồm PNL overview, các biểu đồ phân tích, balance portfolio từng sàn, và bộ lọc thời gian linh hoạt.

## Goals

- Hiển thị tổng quan PNL trực quan và dễ đọc
- Cung cấp charts phân tích chuyên sâu: cumulative PNL, daily profit, trade distribution
- Hiển thị balance real-time từ tất cả exchanges đã kết nối
- Cho phép lọc dữ liệu theo khoảng thời gian và exchange cụ thể
- Load nhanh với server-side data fetching và client-side caching

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-DASH-001 | Trader | Xem PNL tổng hợp ngay khi vào dashboard | Nắm bắt tình hình nhanh |
| US-DASH-002 | Trader | Lọc PNL theo ngày/tuần/tháng/năm | Phân tích theo kỳ |
| US-DASH-003 | Trader | Xem biểu đồ PNL theo thời gian | Visualize xu hướng |
| US-DASH-004 | Trader | Xem balance từng sàn | Phân bổ tài sản |
| US-DASH-005 | Trader | Filter dữ liệu theo exchange | So sánh sàn giao dịch |
| US-DASH-006 | Trader | Xem win rate và các metrics | Đánh giá kỹ năng trading |
| US-DASH-007 | Trader | Xem danh sách trades gần đây | Review giao dịch |
| US-DASH-008 | Trader | Dashboard tải nhanh | Không mất thời gian chờ |

## Functional Requirements

### FR-DASH-001: PNL Overview Section

Các metrics cards hiển thị ở đầu trang:

| Metric | Source | Display |
|---|---|---|
| Total PNL | `pnl_snapshots` | Green/red colored, with percentage change |
| Win Rate | `pnl_snapshots` | Percentage, bar indicator |
| Total Trades | `pnl_snapshots` | Integer count |
| Best Trade | `pnl_snapshots.best_trade_pnl` | Absolute value with symbol |
| Worst Trade | `pnl_snapshots.worst_trade_pnl` | Absolute value with symbol |
| Daily Change | Difference from yesterday | +/- PNL today |

### FR-DASH-002: Time Filter

- Dropdown/button group: **Today | 7D | 30D | 1Y | All**
- Mặc định: **30D**
- Thay đổi time filter trigger reload tất cả widgets trên dashboard
- Filter state persist trong URL query params: `?range=month`
- Exchange filter dropdown: hiện tất cả exchanges + "All Exchanges" option

### FR-DASH-003: Cumulative PNL Chart

- Line chart hiển thị `cumulative_pnl` theo ngày
- X-axis: ngày (format theo range: `dd MMM` cho week/month, `MMM yyyy` cho year)
- Y-axis: USD value
- Tooltip: `Date, PNL: $xxx, Cumulative: $xxx`
- Highlight ngày positive (màu xanh) và negative (màu đỏ)
- Hiển thị zero line reference
- Tương tác: hover tooltip, zoom (future)

### FR-DASH-004: Daily Profit Bar Chart

- Bar chart hiển thị PNL từng ngày
- Bars màu xanh nếu dương, đỏ nếu âm
- Tooltip: `Date, Win: x, Loss: y, Net PNL: $xxx`
- Stagger animation khi load
- Responsive height theo viewport

### FR-DASH-005: Trade Distribution Pie Chart

- Pie/donut chart hiển thị phân bổ trades theo exchange
- Legend hiển thị exchange name, trade count, percentage
- Hover highlight slice
- Click filter data theo exchange (optional)

### FR-DASH-006: Portfolio Balance Overview

- Danh sách exchange accounts với total USD balance
- Mỗi exchange hiển thị: logo, name, total balance (USD), top 3 assets
- Tổng portfolio balance = sum of all exchange balances
- Loading skeleton khi fetch balance
- Error state nếu balance fetch thất bại (show cached value + error badge)
- Balance tự động refresh mỗi 5 phút

### FR-DASH-007: Recent Trades Table

- Paginated table hiển thị 20 trades gần nhất
- Columns: Exchange, Symbol, Side, Quantity, Price, PNL, Date
- Color-coded: PNL positive (xanh), negative (đỏ), side buy (xanh), sell (đỏ)
- Sort theo `traded_at DESC` mặc định
- Link đến full trade history page

### FR-DASH-008: Empty State

- Khi user chưa kết nối exchange: Hiển thị CTA "Connect your first exchange"
- Khi đã kết nối nhưng chưa sync: Hiển thị "Syncing trades..."
- Khi không có trades trong range đã chọn: Hiển thị "No trades in this period"

## Non-Functional Requirements

- First Contentful Paint < 1.5 giây (với Server Components)
- PNL metrics load < 500ms (từ snapshot cache)
- Chart data load < 800ms
- Balance fetch với skeleton loading (không block page)
- Dashboard sử dụng React Server Components cho initial data
- TanStack Query cho client-side refetch và caching
- Stale time: 5 phút cho PNL data, 2 phút cho balance
- Responsive: hoạt động tốt trên mobile (min-width: 375px)

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Tất cả trades có PNL âm | Hiển thị đỏ, không crash charts |
| User mới chưa kết nối exchange | Empty state với CTA rõ ràng |
| Exchange API timeout khi fetch balance | Show cached data + "Refresh failed" badge |
| Khoảng thời gian không có trades | Charts hiển thị empty/zero values |
| Rất nhiều exchanges (5) | Layout scroll horizontally cho balance cards |
| Số PNL rất lớn ($1,000,000+) | Format với K/M notation |
| Số PNL rất nhỏ ($0.0001) | Hiển thị đủ decimal places |
| Session hết hạn khi đang xem | Tự động redirect về login |

## Data Models

Xem [pnl-engine.md](pnl-engine.md) cho `trades` và `pnl_snapshots`.

### Dashboard Data Types

```typescript
type DashboardSummary = {
  totalPnl: number
  pnlChange: number
  winRate: number
  tradeCount: number
  winCount: number
  lossCount: number
  bestTradePnl: number
  worstTradePnl: number
  period: PeriodType
}

type PortfolioBalance = {
  totalUsd: number
  exchanges: ExchangeBalance[]
}

type ExchangeBalance = {
  exchangeAccountId: string
  exchange: string
  label: string
  totalUsd: number
  topAssets: AssetBalance[]
  fetchedAt: string
  error: string | null
}
```

## API Endpoints

### GET /api/pnl/summary
(Xem spec pnl-engine.md)

### GET /api/pnl/chart
(Xem spec pnl-engine.md)

### GET /api/pnl/distribution
(Xem spec pnl-engine.md)

### GET /api/exchange/balance/all

Fetch balance tất cả active exchanges cùng lúc.

Response:
```json
{
  "success": true,
  "data": {
    "total_usd": 45230.50,
    "exchanges": [
      {
        "exchange_account_id": "uuid",
        "exchange": "binance",
        "label": "Binance Main",
        "total_usd": 32500.00,
        "top_assets": [
          { "asset": "BTC", "free": 0.5, "usd_value": 32500.0 }
        ],
        "fetched_at": "2026-03-07T10:00:00Z",
        "error": null
      }
    ]
  },
  "error": null
}
```

### GET /api/pnl/trades

(Xem spec pnl-engine.md - với default `limit: 20`, `sort: traded_at DESC`)

## UI Components

### Layout
- `DashboardLayout` — Server Component, layout wrapper với sidebar
- `DashboardPage` — Page component, orchestrate sections

### Sections
- `PNLOverviewSection` — Top metrics cards row
- `ChartsSection` — Charts grid (2-up sau đó 1-up trên mobile)
- `PortfolioBalanceSection` — Exchange balance cards
- `RecentTradesSection` — Recent trades table

### Cards
- `PNLMetricCard` — Generic metric card (title, value, change, icon)
- `TotalPNLCard` — Highlighted card với trend indication
- `WinRateCard` — Win rate với progress bar
- `TradeCountCard` — Trade count với win/loss split

### Charts
- `CumulativePNLChart` — Recharts LineChart component
- `DailyProfitChart` — Recharts BarChart component
- `TradeDistributionChart` — Recharts PieChart component
- `ChartSkeleton` — Loading skeleton cho charts

### Filters
- `TimeRangeSelector` — Button group: Today/7D/30D/1Y/All
- `ExchangeFilter` — Dropdown chọn exchange

### Table
- `TradesTable` — DataTable với pagination
- `TradeRow` — Row component với color-coded values

### Balance
- `PortfolioBalanceCard` — Exchange balance card
- `AssetList` — List của top assets trong card
- `PortfolioTotalBadge` — Tổng portfolio value

### States
- `DashboardEmptyState` — CTA khi chưa kết nối exchange
- `ChartEmptyState` — Empty state cho từng chart
- `ErrorBanner` — Error banner khi có sự cố

## Sequence Flow

### Initial Dashboard Load

```
Browser              Next.js Server        PNL Service       Database
 |                        |                     |               |
 |-- GET /dashboard ------>|                     |               |
 |                        |-- Auth check         |               |
 |                        |-- Fetch PNL summary->|               |
 |                        |                     |-- Query snapshot>|
 |                        |                     |<-- data --------|
 |                        |-- Fetch chart data ->|               |
 |                        |                     |-- Query trades ->|
 |                        |                     |<-- chart data ---|
 |                        |-- Render RSC         |               |
 |<-- HTML + initial data--|                     |               |
 |                        |                     |               |
 |-- TanStack Query hydrate|                     |               |
 |-- Fetch balance (client)|                     |               |
 |                        |-- GET /api/exchange/balance/all      |
 |                        |-- Decrypt keys       |               |
 |                        |-- Parallel exchange calls            |
 |<-- Balance data --------|                     |               |
```

### Time Range Filter Change

```
User            TimeRangeSelector      TanStack Query      API Route
 |                    |                    |                   |
 |-- Click "7D" ------>|                   |                   |
 |                    |-- Update URL param |                   |
 |                    |-- Invalidate cache |                   |
 |                    |                   |-- GET /pnl/summary?range=week -->|
 |                    |                   |-- GET /pnl/chart?range=week ---->|
 |                    |                   |<-- data --------------------------------|
 |                    |-- Update charts   |                   |
 |<-- Re-render -------|                  |                   |
```

## Security Considerations

- **Server-side Auth**: Dashboard page check Supabase session ở Server Component level
- **RLS Enforcement**: Tất cả database queries filter theo `user_id` từ authenticated session
- **Balance Security**: Balance fetch thực hiện qua server, không expose API keys ra client
- **XSS Prevention**: Trade symbols và labels được sanitize trước khi render
- **CORS**: API endpoints chỉ accept request từ app domain
- **Rate Limiting**: Balance fetch endpoint giới hạn 1 request / 30 giây / user
- **Data Privacy**: Không cache sensitive financial data ở localStorage hay session storage
