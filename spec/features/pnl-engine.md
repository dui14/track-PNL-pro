# Feature Specification: PNL Tracking Engine

## Overview

Engine tính toán và tổng hợp Profit & Loss (PNL) từ nhiều sàn giao dịch. Hệ thống normalize trade data từ các sàn khác nhau, tính toán PNL theo nhiều chiều thời gian, lưu trữ snapshots để tăng hiệu suất query, và tự động tái tính toán theo lịch trình định kỳ.

## Goals

- Tổng hợp trades từ tất cả exchanges của một user
- Tính toán PNL chính xác cho spot, futures và margin trades
- Cung cấp metrics: total PNL, daily/monthly/yearly PNL, win rate, trade count
- Normalize trade format từ 5 sàn giao dịch về một schema chuẩn
- Lưu PNL snapshots để query nhanh trên dashboard
- Recalculate định kỳ và sau mỗi sync event

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-PNL-001 | Trader | Xem tổng PNL all-time | Đánh giá hiệu suất tổng thể |
| US-PNL-002 | Trader | Xem PNL theo ngày/tuần/tháng/năm | Phân tích hiệu suất theo kỳ |
| US-PNL-003 | Trader | Xem win rate của mình | Biết tỉ lệ giao dịch có lãi |
| US-PNL-004 | Trader | Xem PNL riêng từng sàn | So sánh hiệu suất giữa các sàn |
| US-PNL-005 | Trader | Xem PNL chart theo thời gian | Visualize xu hướng performance |
| US-PNL-006 | Trader | Xem best trade và worst trade | Nhận diện chiến lược tốt nhất |
| US-PNL-007 | Trader | PNL tự động cập nhật sau sync | Không cần trigger thủ công |
| US-PNL-008 | Trader | Xem cumulative PNL theo thời gian | Theo dõi tăng trưởng portfolio |

## Functional Requirements

### FR-PNL-001: PNL Calculation Logic

**Spot Trades:**
- Matched buy/sell pairs theo FIFO (First In, First Out)
- Realized PNL = (sell_price - avg_buy_price) × quantity - fees
- Unrealized PNL = (current_price - avg_buy_price) × holding_quantity (optional, future feature)

**Futures Trades:**
- Exchange cung cấp `realized_pnl` trực tiếp trên mỗi trade
- Aggregate realized_pnl từ exchange data
- Fee được tính vào realized_pnl đã có từ exchange

**Margin Trades:**
- Tương tự futures, sử dụng realized_pnl từ exchange
- Bổ sung tracking funding fees nếu exchange cung cấp

**Fee Handling:**
- Trừ fee ra khỏi PNL: `net_pnl = realized_pnl - fee_in_usd`
- Convert fee sang USD nếu fee_currency không phải USD

### FR-PNL-002: Trade Normalization

Mỗi exchange cung cấp data theo format khác nhau. Engine phải normalize về `NormalizedTrade`:

```
Binance Spot  ──┐
OKX Trades    ──┼──→ NormalizerAdapter ──→ NormalizedTrade ──→ PNL Engine
Bybit Fills   ──┤
Bitget Orders ──┤
MEXC Trades   ──┘
```

**Binance Spot format:**
- `orderId`, `symbol`, `side`, `executedQty`, `price`, `commission`, `commissionAsset`, `time`

**OKX format:**
- `tradeId`, `instId`, `side`, `fillSz`, `fillPx`, `fee`, `feeCcy`, `fillTime`, `pnl`

**Bybit format:**
- `execId`, `symbol`, `side`, `execQty`, `execPrice`, `execFee`, `closedPnl`, `execTime`

**Bitget format:**
- `tradeId`, `symbol`, `side`, `size`, `priceAvg`, `fee`, `profit`, `cTime`

**MEXC format:**
- `id`, `symbol`, `side`, `qty`, `price`, `commission`, `commissionAsset`, `time`

### FR-PNL-003: Aggregation và Snapshots

**Period Types:** `day`, `week`, `month`, `year`, `all`

Mỗi snapshot chứa:
- `total_pnl`: Tổng PNL trong kỳ
- `win_count`: Số giao dịch có lãi
- `loss_count`: Số giao dịch lỗ
- `trade_count`: Tổng số giao dịch
- `win_rate`: `win_count / trade_count * 100`
- `best_trade_pnl`: Trade lãi nhiều nhất
- `worst_trade_pnl`: Trade lỗ nhiều nhất

**Snapshot scope:**
- Per user (all exchanges combined)
- Per user + per exchange_account (filter by exchange)

### FR-PNL-004: Recalculation Triggers
- Sau khi sync trade history hoàn thành
- Cron job mỗi 6 giờ (`pg_cron` hoặc Supabase Edge Function)
- Manual trigger từ user (rate limit: 1 lần/5 phút)
- Incremental recalc: chỉ recalc period có trades mới

### FR-PNL-005: Chart Data Generation

**Cumulative PNL chart:**
- Array of `{ date: string, daily_pnl: number, cumulative_pnl: number }`
- Time granularity: ngày (cho week/month), tuần (cho year), tháng (cho all)

**Daily Profit chart:**
- Bar chart data: `{ date: string, pnl: number, win_count: number, loss_count: number }`

**Trade Distribution:**
- Pie chart: `{ exchange: string, trade_count: number, percentage: number }`

## Non-Functional Requirements

- PNL calculation cho 10,000 trades < 5 giây
- Snapshot query response < 200ms (indexed)
- Recalculation không block user requests (background job)
- Incremental recalculation để tránh re-compute toàn bộ history
- Snapshot data tự động invalidated sau recalculation
- Support tối thiểu 100,000 trades per user (với pagination)

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Trade bị cancel / partial fill | Chỉ tính filled quantity, skip cancelled orders |
| Fee currency khác USD (ví dụ BNB) | Convert sang USD sử dụng giá tại thời điểm trade |
| Duplicate trades sau sync | UPSERT với unique constraint, không tính 2 lần |
| Spot trade chưa bán (holding) | Chỉ tính realized PNL, mark unrealized riêng |
| Exchange không cung cấp realized_pnl | Tính theo FIFO từ matched trades |
| PNL âm (lỗ) | Hiển thị bình thường với màu đỏ |
| User không có trade nào | Return empty array, total_pnl = 0 |
| Trade xảy ra trong khoảng thoát/trong period | Assign vào period chứa `traded_at` |
| Recalc đang chạy, user request summary | Return cached snapshot, queue recalc |
| Futures realized_pnl từ exchange có sai lệch nhỏ | Dùng exchange data as source of truth |

## Data Models

### trades
```sql
CREATE TABLE trades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_trade_id   TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity            NUMERIC(28,10) NOT NULL,
  price               NUMERIC(28,10) NOT NULL,
  fee                 NUMERIC(28,10) NOT NULL DEFAULT 0,
  fee_currency        TEXT,
  realized_pnl        NUMERIC(28,10),
  trade_type          TEXT NOT NULL CHECK (trade_type IN ('spot','futures','margin')),
  traded_at           TIMESTAMPTZ NOT NULL,
  raw_data            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_account_id, external_trade_id)
);
```

### pnl_snapshots
```sql
CREATE TABLE pnl_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  period_type         TEXT NOT NULL CHECK (period_type IN ('day','week','month','year','all')),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  total_pnl           NUMERIC(28,10) NOT NULL DEFAULT 0,
  win_count           INT NOT NULL DEFAULT 0,
  loss_count          INT NOT NULL DEFAULT 0,
  trade_count         INT NOT NULL DEFAULT 0,
  win_rate            NUMERIC(5,2),
  best_trade_pnl      NUMERIC(28,10),
  worst_trade_pnl     NUMERIC(28,10),
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange_account_id, period_type, period_start)
);
```

## PNL Engine Interface

```typescript
interface PNLEngine {
  calculatePNL(trades: NormalizedTrade[]): PNLResult
  aggregateByPeriod(trades: NormalizedTrade[], period: PeriodType): PNLSnapshot[]
  generateChartData(trades: NormalizedTrade[], range: ChartRange): ChartDataPoint[]
  calculateWinRate(trades: NormalizedTrade[]): number
}

type PNLResult = {
  totalPnl: number
  winCount: number
  lossCount: number
  tradeCount: number
  winRate: number
  bestTradePnl: number
  worstTradePnl: number
}

type ChartDataPoint = {
  date: string
  dailyPnl: number
  cumulativePnl: number
  winCount: number
  lossCount: number
}

type PeriodType = 'day' | 'week' | 'month' | 'year' | 'all'
type ChartRange = 'day' | 'week' | 'month' | 'year'
```

## API Endpoints

### GET /api/pnl/summary

Lấy PNL tổng hợp theo khoảng thời gian.

Query params:
- `range`: `day` | `week` | `month` | `year` | `all` (default: `all`)
- `exchangeAccountId`: UUID (optional) - filter theo sàn

Response:
```json
{
  "success": true,
  "data": {
    "total_pnl": 1250.50,
    "win_rate": 68.5,
    "trade_count": 124,
    "win_count": 85,
    "loss_count": 39,
    "best_trade_pnl": 420.00,
    "worst_trade_pnl": -85.30,
    "period": "month",
    "calculated_at": "2026-03-07T10:00:00Z"
  },
  "error": null
}
```

### GET /api/pnl/chart

Lấy time-series data cho chart.

Query params:
- `range`: `day` | `week` | `month` | `year`
- `exchangeAccountId`: UUID (optional)

Response:
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-03-01",
      "daily_pnl": 120.5,
      "cumulative_pnl": 980.5,
      "win_count": 3,
      "loss_count": 1
    }
  ],
  "error": null
}
```

### GET /api/pnl/trades

Danh sách trades có phân trang.

Query params:
- `page`: number (default: 1)
- `limit`: number (default: 20, max: 100)
- `exchangeAccountId`: UUID (optional)
- `symbol`: string (optional)
- `range`: string (optional)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "symbol": "BTCUSDT",
      "side": "buy",
      "quantity": 0.05,
      "price": 65000,
      "realized_pnl": 125.5,
      "fee": 3.25,
      "trade_type": "futures",
      "traded_at": "2026-03-01T08:00:00Z",
      "exchange": "binance"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 124 },
  "error": null
}
```

### POST /api/pnl/recalculate

Trigger manual PNL recalculation.

Request:
```json
{ "exchangeAccountId": "uuid" }
```

Response:
```json
{
  "success": true,
  "data": {
    "queued": true,
    "estimated_completion": "2026-03-07T10:05:00Z"
  },
  "error": null
}
```

### GET /api/pnl/distribution

Trade distribution theo exchange để hiển thị pie chart.

Response:
```json
{
  "success": true,
  "data": [
    { "exchange": "binance", "trade_count": 80, "percentage": 64.5 },
    { "exchange": "okx", "trade_count": 44, "percentage": 35.5 }
  ],
  "error": null
}
```

## UI Components

- `PNLSummaryCard` — Card tổng hợp hiển thị total PNL, win rate, trade count
- `PNLMetricBadge` — Badge hiển thị positive/negative PNL với màu sắc
- `PeriodSelector` — Dropdown chọn day/week/month/year/all
- `PNLChartContainer` — Container quản lý chart state và data fetching
- (Xem thêm spec/features/dashboard.md cho chart components)

## Sequence Flow

### PNL Snapshot Generation

```
Sync Event          PNL Engine          Snapshot Store       Database
 |                      |                    |                  |
 |-- sync completed --->|                    |                  |
 |                      |-- Fetch trades --->|                  |
 |                      |                   |-- Query trades -->|
 |                      |                   |<-- trades data ---|
 |                      |-- Calculate PNL   |                  |
 |                      |   by period       |                  |
 |                      |-- Calculate       |                  |
 |                      |   win_rate        |                  |
 |                      |-- Upsert snapshot>|                  |
 |                      |                   |-- UPSERT pnl_ --->|
 |                      |                   |   snapshots      |
 |                      |<-- done -----------|                  |
```

### Dashboard PNL Query

```
Dashboard Page      PNL Service         Snapshot Store       Database
 |                      |                    |                  |
 |-- request summary -->|                    |                  |
 |                      |-- Check snapshot ->|                  |
 |                      |                   |-- Query snapshot->|
 |                      |                   |<-- snapshot data -|
 |                      |-- Return cached   |                  |
 |<-- PNL data ---------|                   |                  |
 |                      |                   |                  |
 |-- (if no snapshot) ->|                   |                  |
 |                      |-- Calculate live ->|                  |
 |                      |                   |-- Query trades -->|
 |                      |                   |<-- trades --------|
 |                      |-- Return result   |                  |
 |<-- PNL data ---------|                   |                  |
```

## Security Considerations

- **Data Isolation**: RLS đảm bảo user chỉ xem PNL data của chính mình
- **Recalculation Rate Limit**: Giới hạn 1 manual recalc / 5 phút để tránh abuse
- **Audit Trail**: Ghi lại `calculated_at` trong mỗi snapshot để debug inconsistency
- **Integer Arithmetic**: Sử dụng NUMERIC(28,10) để tránh floating-point errors
- **Exchange Account Ownership**: Validate user sở hữu `exchangeAccountId` trước khi query
- **No Raw PNL Leakage**: Snapshot query phải lọc theo `user_id` từ authenticated session
