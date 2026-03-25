# Feature Specification: Exchange API Integration & PNL Tracking

## Overview

Cho phép người dùng kết nối các tài khoản sàn giao dịch crypto (Binance, OKX, Bybit, Bitget) bằng API keys. Hệ thống mã hóa và lưu trữ API keys an toàn, xác thực permissions, đồng bộ lịch sử giao dịch từ các endpoint cụ thể của từng sàn, tính toán Realized PNL và Unrealized PNL, cập nhật balance real-time, và quản lý kết nối theo vòng đời đầy đủ.

## Goals

- Hỗ trợ kết nối 4 sàn giao dịch lớn: Binance, OKX, Bybit, Bitget
- Mã hóa API keys bằng AES-256-GCM trước khi lưu trữ
- Chỉ chấp nhận API keys có quyền read-only
- Fetch và normalize trade history từ các exchange-specific endpoints sang format thống nhất
- Tính Realized PNL từ lịch sử lệnh và phí
- Tính Unrealized PNL từ vị thế đang mở và giá mark real-time
- Xử lý rate limits theo từng sàn với exponential backoff

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-EX-001 | Trader | Kết nối Binance với API key | Tự động sync trade history Spot và Futures |
| US-EX-002 | Trader | Kết nối OKX với API key + Passphrase | Đồng bộ dữ liệu từ Unified Account |
| US-EX-003 | Trader | Kết nối Bybit bằng API key | Theo dõi lệnh Spot và Derivatives |
| US-EX-004 | Trader | Kết nối Bitget với API key + Passphrase | Đồng bộ Futures và Spot history |
| US-EX-005 | Trader | Xem Realized PNL từng sàn | Biết lãi lỗ thực tế đã chốt |
| US-EX-006 | Trader | Xem Unrealized PNL từ vị thế đang mở | Theo dõi lãi lỗ chưa chốt |
| US-EX-007 | Trader | Xem balance real-time từng sàn | Theo dõi tổng tài sản |
| US-EX-008 | Trader | Trigger manual sync | Cập nhật dữ liệu PNL mới nhất |
| US-EX-009 | Trader | Vô hiệu hóa kết nối tạm thời | Ngừng sync mà không xóa dữ liệu |
| US-EX-010 | Trader | Xóa kết nối sàn | Hủy hoàn toàn liên kết và dữ liệu |

## Functional Requirements

### FR-EX-001: Kết nối Exchange (Connect)

**Form nhập API credentials theo từng sàn:**

| Sàn | Trường bắt buộc | Trường tùy chọn |
|---|---|---|
| Binance | API Key, API Secret | Label |
| OKX | API Key, API Secret, Passphrase | Label |
| Bybit | API Key, API Secret | Label |
| Bitget | API Key, API Secret, Passphrase | Label |

- Validate input: API key và secret không rỗng, không chứa khoảng trắng
- Kiểm tra duplicate: mỗi user chỉ kết nối một account per exchange
- Gọi exchange test endpoint để verify credentials (xem bảng endpoint bên dưới)
- Kiểm tra permissions: chỉ chấp nhận read-only keys, block keys có withdraw permission
- Mã hóa API key, secret, và passphrase (nếu có) bằng AES-256-GCM trước khi lưu
- Tạo record `exchange_accounts` và `api_keys`
- Trigger initial sync sau khi kết nối thành công

**Validation endpoints theo sàn:**

| Sàn | Test Endpoint | Mục đích |
|---|---|---|
| Binance | `GET /api/v3/account` | Verify credentials + check permissions |
| OKX | `GET /api/v5/account/balance` | Verify credentials (cần Passphrase) |
| Bybit | `GET /v5/account/wallet-balance` | Verify credentials |
| Bitget | `GET /api/spot/v1/account/assets` | Verify credentials (cần Passphrase) |

### FR-EX-002: Cấu trúc API Keys

**Binance:**
- Yêu cầu: `API Key` + `API Secret`
- Quyền cần thiết: Read-only (Enable Reading)
- Không cần Passphrase
- Futures cần được kích hoạt riêng trên Binance Futures account

**OKX:**
- Yêu cầu: `API Key` + `API Secret` + `Passphrase`
- Passphrase là bắt buộc — được tạo bởi user khi generate API key trên OKX
- Quyền cần thiết: Read-only, không cần Trade hay Withdraw
- Unified Account: một bộ credentials cho cả Spot và Futures

**Bybit:**
- Yêu cầu: `API Key` + `API Secret`
- Không cần Passphrase
- Quyền cần thiết: Read-only
- Unified API v5 áp dụng cho Spot, Perps, Options cùng một bộ keys

**Bitget:**
- Yêu cầu: `API Key` + `API Secret` + `Passphrase`
- Passphrase là bắt buộc — được tạo bởi user khi generate API key trên Bitget
- Quyền cần thiết: Read-only
- Futures và Spot có endpoint riêng nhưng dùng chung credentials

### FR-EX-003: Sync Trade History để Tính Realized PNL

Mỗi adapter gọi đúng endpoint của từng sàn và normalize về `NormalizedTrade`.

#### Binance Adapter

**Spot — Lịch sử giao dịch:**
- Endpoint: `GET /api/v3/myTrades`
- Tham số bắt buộc: `symbol` — phải lặp qua từng cặp giao dịch
- Quy trình: Gọi `GET /api/v3/account` để lấy danh sách assets có balance > 0, xây dựng danh sách symbols (ví dụ BTC → BTCUSDT), sau đó gọi `/api/v3/myTrades` cho từng symbol
- Tham số phân trang: `fromId`, `limit` (max 1000)
- Trả về: `price`, `qty`, `commission`, `commissionAsset`, `isBuyer`, `time`

**Futures — Lịch sử thu nhập:**
- Endpoint chính: `GET /fapi/v1/income`
- Lọc theo `incomeType`:
  - `REALIZED_PNL` — lãi lỗ đã thực hiện khi đóng lệnh
  - `FUNDING_FEE` — phí funding theo chu kỳ 8 giờ
  - `COMMISSION` — phí giao dịch mở/đóng lệnh
- Tham số: `startTime`, `endTime`, `limit` (max 1000)
- Lưu ý: API chỉ trả về tối đa 3 tháng gần nhất; không chỉ định thời gian mặc định 7 ngày gần nhất
- Sync lần đầu: fetch 90 ngày, dùng `startTime = now - 90d`

**Công thức Realized PNL (Binance):**
```
Realized PNL = Σ(incomeType=REALIZED_PNL) + Σ(incomeType=FUNDING_FEE) + Σ(incomeType=COMMISSION)
```

#### OKX Adapter (API v5 — Unified Account)

**Lịch sử dòng tiền — Realized PNL:**
- Endpoint: `GET /api/v5/account/bills-archive`
- Lọc theo `type`:
  - `2` — Trade (giao dịch mua/bán)
  - `8` — Funding fee (phí tài trợ)
  - `14` — Settlement (thanh toán phí)
- Tham số: `begin`, `end` (milliseconds), `after` (cursor phân trang)
- Trả về tối đa 3 tháng gần nhất
- Trường PNL: `pnl` (Realized PNL của lệnh), `fee` (phí phát sinh)

**Vị thế đang mở — Unrealized PNL:**
- Endpoint: `GET /api/v5/account/positions`
- Trả về: `upl` (Unrealized PNL theo giá mark), `markPx` (giá mark hiện tại), `avgPx` (giá vào trung bình), `notionalUsd`

**Lịch sử vị thế đã đóng:**
- Endpoint: `GET /api/v5/account/positions-history`
- Trả về: `realizedPnl` (đã tính sẵn bởi OKX), `openAvgPx`, `closeAvgPx`, `openTime`, `closeTime`
- Giới hạn: 3 tháng gần nhất

**Công thức Realized PNL (OKX):**
```
Realized PNL = Σ(bills.pnl where type IN [2,8,14]) + Σ(bills.fee)
```

#### Bybit Adapter (API v5)

**Số dư tài khoản:**
- Endpoint: `GET /v5/account/wallet-balance`
- Tham số: `accountType` = `UNIFIED`
- Trả về: balance theo từng coin, `totalEquity`, `unrealisedPnl`, `cumRealisedPnl`

**Lịch sử khớp lệnh — Realized PNL:**
- Endpoint: `GET /v5/execution/list`
- Tham số: `category` = `linear` (Futures) hoặc `spot` (Spot), `startTime`, `endTime`, `limit` (max 100)
- Trả về: `execPrice`, `execQty`, `execFee`, `closedSize`, `execType`, `symbol`
- Source chính để tính PNL mỗi lần khớp lệnh

**Vị thế Futures đang mở:**
- Endpoint: `GET /v5/position/list`
- Tham số: `category` = `linear`, `settleCoin` = `USDT`
- Trả về: `unrealisedPnl`, `markPrice`, `avgPrice`, `positionValue`, `side`

**Công thức Realized PNL (Bybit):**
```
Realized PNL = Σ[(execPrice - avgEntryPrice) * execQty * sideMultiplier - execFee]
```

#### Bitget Adapter

**Futures — Lịch sử lệnh đã đóng:**
- Endpoint: `GET /api/mix/v1/trace/followerHistoryOrders`
- Trả về: `achievedProfits` (PNL đã thực hiện), `netProfit` (lợi nhuận ròng sau phí)
- Tham số: `startTime`, `endTime`, `pageNo`, `pageSize`

**Futures — Lịch sử dòng tiền:**
- Endpoint: `GET /api/mix/v1/account/accountBill`
- Phạm vi: 90 ngày gần nhất
- Trả về: phí giao dịch, phí funding, settled PNL
- Tham số: `productType` = `umcbl` (USDT-M Futures)

**Spot — Lịch sử lệnh:**
- Endpoint: `POST /api/spot/v1/trace/order/orderHistoryList`
- Body: `startTime`, `endTime`, `pageNo`, `pageSize`

**Vị thế Futures đang mở:**
- Endpoint: `GET /api/mix/v1/position/allPosition-v2`
- Tham số: `productType` = `umcbl`
- Trả về: `unrealizedPL` (Unrealized PNL), `markPrice`, `averageOpenPrice`, `holdSide`

**Công thức Realized PNL (Bitget):**
```
Realized PNL = Σ(netProfit from followerHistoryOrders)
             + Σ(funding fees from accountBill)
```

### FR-EX-004: Unrealized PNL — Vị thế đang mở

Gọi positions API của từng sàn theo lịch real-time (mỗi 30 giây hoặc khi user mở Dashboard):

| Sàn | Endpoint | Trường PNL |
|---|---|---|
| Binance | `GET /fapi/v2/positionRisk` | `unrealizedProfit` |
| OKX | `GET /api/v5/account/positions` | `upl` |
| Bybit | `GET /v5/position/list` | `unrealisedPnl` |
| Bitget | `GET /api/mix/v1/position/allPosition-v2` | `unrealizedPL` |

Normalize sang `UnrealizedPosition`:
```typescript
type UnrealizedPosition = {
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  markPrice: number
  unrealizedPnl: number
  leverage: number
  tradeType: 'futures'
}
```

### FR-EX-005: Fetch Balance Real-time

| Sàn | Endpoint | Trường balance |
|---|---|---|
| Binance Spot | `GET /api/v3/account` | `balances[].free`, `balances[].locked` |
| Binance Futures | `GET /fapi/v2/balance` | `balance`, `availableBalance` |
| OKX | `GET /api/v5/account/balance` | `details[].cashBal`, `details[].frozenBal` |
| Bybit | `GET /v5/account/wallet-balance` | `coin[].walletBalance`, `coin[].availableToWithdraw` |
| Bitget Spot | `GET /api/spot/v1/account/assets` | `available`, `frozen` |
| Bitget Futures | `GET /api/mix/v1/account/accounts` | `available`, `locked` |

- Chỉ hiển thị assets có balance > 0
- Convert tất cả về USD equivalent sử dụng giá thị trường hiện tại
- Cache balance 5 phút để giảm API calls
- Balance không lưu vào database (fetch on-demand)

### FR-EX-006: Sync Schedule

- Sync tự động background: mỗi 4 giờ (Supabase Edge Function cron)
- Sync incremental: từ `last_synced` đến hiện tại
- Sync lần đầu (initial): fetch 90 ngày gần nhất
- Unrealized PNL: refresh mỗi 30 giây qua Supabase Realtime hoặc polling
- Deduplicate bằng `external_trade_id` khi upsert

### FR-EX-007: Rate Limit Handling

| Sàn | Rate Limit | Strategy |
|---|---|---|
| Binance | 1200 req/min (weight-based) | Track request weight, sleep khi gần limit |
| OKX | 20 req/2s per endpoint | Token bucket per endpoint |
| Bybit | 120 req/s | Sliding window counter |
| Bitget | 20 req/s | Fixed window |

- Implement exponential backoff khi nhận 429: `min(2^attempt * 1000ms, 60000ms)` + jitter
- Log rate limit events để monitor, không log API keys

### FR-EX-008: Enable/Disable Connection

- Toggle `is_active` trên `exchange_accounts`
- Inactive accounts không tham gia sync jobs, fetch balance, hay positions
- User có thể re-enable bất kỳ lúc nào

### FR-EX-009: Xóa Exchange Account

- Soft warning trước khi xóa: "Xóa sẽ mất toàn bộ trade history và PNL data"
- Xóa cascade: `exchange_accounts` → `api_keys`, `trades`, `pnl_snapshots`
- Không thể hoàn tác

## Non-Functional Requirements

- API key encryption/decryption < 10ms
- Exchange API validation timeout: 10 giây
- Trade sync job timeout: 5 phút
- Parallel sync: tối đa 3 exchanges đồng thời per user
- Exchange API calls chỉ thực hiện từ server-side (Supabase Edge Functions)
- Log tất cả sync events với timestamps nhưng không log API keys
- Support ít nhất 10,000 trades per exchange account

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Binance Futures chưa kích hoạt | Chỉ sync Spot, log warning "Futures not enabled" |
| OKX Passphrase sai | Trả về lỗi 401 từ OKX, hiển thị "Invalid Passphrase" |
| Bitget Passphrase thiếu | Khi kết nối yêu cầu nhập Passphrase, không thể bỏ qua |
| Binance symbol không có trong whitelist | Bỏ qua symbol đó, tiếp tục các symbol khác |
| OKX bills-archive trả về rỗng | Không lỗi, log "No new bills", cập nhật last_synced |
| Bybit category=linear rỗng | Không có Futures position, trả về empty array |
| API key hợp lệ nhưng hết hạn | Đánh dấu account error, thông báo user |
| Exchange API bị timeout | Retry 3 lần, sau đó mark sync failed |
| Duplicate external_trade_id | Skip, không tạo duplicate (upsert by conflict) |
| Rate limit 429 kéo dài | Exponential backoff tối đa 60 giây, postpone job |
| Exchange bảo trì | Retry sau 30 phút, không block UI |
| API key bị xóa trên sàn | Sync thất bại, hiển thị "API key invalid" |

## Data Models

### exchange_accounts
```sql
CREATE TABLE exchange_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget')),
  label        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sync_status  TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','syncing','synced','error')),
  sync_error   TEXT,
  last_synced  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);
```

### api_keys
```sql
CREATE TABLE api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  key_encrypted       TEXT NOT NULL,
  secret_encrypted    TEXT NOT NULL,
  passphrase_encrypted TEXT,
  key_iv              TEXT NOT NULL,
  secret_iv           TEXT NOT NULL,
  passphrase_iv       TEXT,
  key_version         INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Lưu ý:** `passphrase_encrypted` và `passphrase_iv` chỉ được lưu với OKX và Bitget. Với Binance và Bybit, hai trường này là NULL.

### trades (normalized format)
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
  funding_fee         NUMERIC(28,10) DEFAULT 0,
  income_type         TEXT,
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
  snapshot_date       DATE NOT NULL,
  realized_pnl        NUMERIC(28,10) NOT NULL DEFAULT 0,
  unrealized_pnl      NUMERIC(28,10) NOT NULL DEFAULT 0,
  total_fees          NUMERIC(28,10) NOT NULL DEFAULT 0,
  funding_fees        NUMERIC(28,10) NOT NULL DEFAULT 0,
  trade_count         INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange_account_id, snapshot_date)
);
```

## Exchange Adapter Interface

```typescript
interface ExchangeAdapter {
  readonly exchange: ExchangeName

  validateCredentials(credentials: ExchangeCredentials): Promise<Result<ValidationResult>>

  fetchSpotTrades(credentials: ExchangeCredentials, since: Date): Promise<Result<NormalizedTrade[]>>
  fetchFuturesTrades(credentials: ExchangeCredentials, since: Date): Promise<Result<NormalizedTrade[]>>

  fetchOpenPositions(credentials: ExchangeCredentials): Promise<Result<UnrealizedPosition[]>>
  fetchBalances(credentials: ExchangeCredentials): Promise<Result<AssetBalance[]>>

  hasWithdrawPermission(credentials: ExchangeCredentials): Promise<boolean>
}

type ExchangeCredentials = {
  apiKey: string
  apiSecret: string
  passphrase?: string
}

type NormalizedTrade = {
  externalTradeId: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  fee: number
  feeCurrency: string
  realizedPnl: number | null
  fundingFee: number
  incomeType: string | null
  tradeType: 'spot' | 'futures' | 'margin'
  tradedAt: Date
  rawData: Record<string, unknown>
}

type UnrealizedPosition = {
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  markPrice: number
  unrealizedPnl: number
  leverage: number
  tradeType: 'futures'
}

type AssetBalance = {
  asset: string
  free: number
  locked: number
  usdValue: number
}
```

## REST API Endpoints (Hệ thống aiTrackProfit)

### POST /api/exchange/connect

Kết nối exchange account mới. Hỗ trợ OKX và Bitget với Passphrase.

Request:
```json
{
  "exchange": "okx",
  "apiKey": "xxxxx",
  "apiSecret": "yyyyy",
  "passphrase": "zzzzz",
  "label": "OKX Main"
}
```

Validation:
- `exchange` in ['binance','okx','bybit','bitget']
- `apiKey` string 10–512 ký tự
- `apiSecret` string 10–512 ký tự
- `passphrase` bắt buộc nếu exchange là `okx` hoặc `bitget`, tối đa 100 ký tự
- `label` optional, max 50 ký tự

Response success (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "exchange": "okx",
    "label": "OKX Main",
    "is_active": true,
    "sync_status": "pending",
    "created_at": "2026-03-18T00:00:00Z"
  },
  "error": null
}
```

Response error — passphrase thiếu (400):
```json
{
  "success": false,
  "data": null,
  "error": "PASSPHRASE_REQUIRED"
}
```

Response error — withdraw permission (400):
```json
{
  "success": false,
  "data": null,
  "error": "WITHDRAW_PERMISSION_DETECTED"
}
```

Response error — exchange đã kết nối (409):
```json
{
  "success": false,
  "data": null,
  "error": "EXCHANGE_ALREADY_CONNECTED"
}
```

---

### GET /api/exchange/accounts

Danh sách tất cả exchange accounts của user.

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "exchange": "binance",
      "label": "Binance Main",
      "is_active": true,
      "sync_status": "synced",
      "last_synced": "2026-03-18T10:00:00Z",
      "trade_count": 124,
      "has_passphrase": false
    },
    {
      "id": "uuid",
      "exchange": "okx",
      "label": "OKX Main",
      "is_active": true,
      "sync_status": "synced",
      "last_synced": "2026-03-18T10:00:00Z",
      "trade_count": 87,
      "has_passphrase": true
    }
  ],
  "error": null
}
```

> `has_passphrase` chỉ cho biết passphrase đã được lưu hay chưa — không trả về giá trị thực của passphrase. API keys không bao giờ được trả về trong response.

---

### POST /api/exchange/sync

Trigger manual sync cho một exchange account.

Request:
```json
{ "exchangeAccountId": "uuid" }
```

Response:
```json
{
  "success": true,
  "data": {
    "synced_trades": 45,
    "new_trades": 12,
    "realized_pnl_delta": 320.50,
    "last_synced": "2026-03-18T10:30:00Z"
  },
  "error": null
}
```

---

### GET /api/exchange/balance/:id

Fetch live balance cho một exchange account.

Response:
```json
{
  "success": true,
  "data": {
    "exchange_account_id": "uuid",
    "exchange": "bybit",
    "total_usd": 15420.50,
    "assets": [
      { "asset": "BTC", "free": 0.5, "locked": 0.0, "usd_value": 32500.0 },
      { "asset": "USDT", "free": 2500.0, "locked": 0.0, "usd_value": 2500.0 }
    ],
    "fetched_at": "2026-03-18T10:00:00Z"
  },
  "error": null
}
```

---

### GET /api/exchange/positions/:id

Fetch unrealized PNL từ vị thế đang mở của một exchange account.

Response:
```json
{
  "success": true,
  "data": {
    "exchange_account_id": "uuid",
    "total_unrealized_pnl": 215.30,
    "positions": [
      {
        "symbol": "BTCUSDT",
        "side": "long",
        "size": 0.1,
        "entry_price": 64000.0,
        "mark_price": 66153.0,
        "unrealized_pnl": 215.30,
        "leverage": 10,
        "trade_type": "futures"
      }
    ],
    "fetched_at": "2026-03-18T10:01:00Z"
  },
  "error": null
}
```

---

### GET /api/pnl/summary

PNL tổng hợp theo khoảng thời gian và sàn.

Query params:
- `range`: `day` | `week` | `month` | `year` | `all` (default: `all`)
- `exchangeAccountId`: UUID (optional)

Response:
```json
{
  "success": true,
  "data": {
    "realized_pnl": 1250.50,
    "unrealized_pnl": 215.30,
    "total_pnl": 1465.80,
    "total_fees": 42.30,
    "funding_fees": -18.50,
    "win_rate": 68.5,
    "trade_count": 124,
    "win_count": 85,
    "loss_count": 39,
    "best_trade": 420.00,
    "worst_trade": -85.30,
    "period": "month"
  },
  "error": null
}
```

---

### PATCH /api/exchange/accounts/:id

Toggle trạng thái active hoặc cập nhật label.

Request:
```json
{ "is_active": false }
```

Response:
```json
{
  "success": true,
  "data": { "id": "uuid", "is_active": false },
  "error": null
}
```

---

### DELETE /api/exchange/accounts/:id

Xóa exchange account và toàn bộ dữ liệu liên quan (cascade).

Response:
```json
{
  "success": true,
  "data": { "deleted": true },
  "error": null
}
```

## Logic Tính PNL trên Dashboard

### Bước 1 — Realized PNL

Thu thập từ exchange history endpoints:

```
Binance:
  Realized PNL = Σ income(REALIZED_PNL) + Σ income(FUNDING_FEE) + Σ income(COMMISSION)
  Source: GET /fapi/v1/income + GET /api/v3/myTrades

OKX:
  Realized PNL = Σ bill.pnl (type=2,8,14) + Σ bill.fee
  Source: GET /api/v5/account/bills-archive

Bybit:
  Realized PNL = Σ[(execPrice - avgEntry) * qty * side - execFee]
  Source: GET /v5/execution/list

Bitget:
  Realized PNL = Σ netProfit (from followerHistoryOrders)
               + Σ funding fees (from accountBill)
  Source: GET /api/mix/v1/trace/followerHistoryOrders + /api/mix/v1/account/accountBill
```

### Bước 2 — Unrealized PNL

Gọi positions API real-time:
```
OKX:    GET /api/v5/account/positions  → upl
Bybit:  GET /v5/position/list          → unrealisedPnl
Bitget: GET /api/mix/v1/position/allPosition-v2 → unrealizedPL
Binance: GET /fapi/v2/positionRisk     → unrealizedProfit
```

### Bước 3 — Total Balance

```
Binance: GET /api/v3/account (Spot) + GET /fapi/v2/balance (Futures)
OKX:     GET /api/v5/account/balance
Bybit:   GET /v5/account/wallet-balance (accountType=UNIFIED)
Bitget:  GET /api/spot/v1/account/assets + GET /api/mix/v1/account/accounts
```

### Bước 4 — Xử lý Thời gian

- Dữ liệu < 7 ngày: dùng endpoint mặc định (không cần startTime)
- Dữ liệu 7–90 ngày: truyền `startTime` và `endTime` vào các archive/history endpoint
- Dữ liệu > 90 ngày: sử dụng các snapshot đã lưu trong `pnl_snapshots` table (database caching), không gọi lại exchange API

## UI Components

### Pages
- `/profile` → Tab "Exchange Connections" — Quản lý tất cả kết nối
- Modal "Connect Exchange" — Form kết nối mới theo từng sàn

### Components
- `ExchangeConnectionList` — Danh sách tất cả connections với status badge
- `ConnectExchangeModal` — Modal form nhập API credentials (dynamic fields theo sàn)
- `ExchangeCard` — Card hiển thị 1 exchange connection với realized + unrealized PNL
- `ExchangeStatusBadge` — Badge màu cho trạng thái sync
- `PositionsList` — Danh sách vị thế đang mở với unrealized PNL
- `BalanceDisplay` — Tổng balance theo sàn quy đổi USD
- `SyncProgressIndicator` — Loading state khi sync đang chạy
- `PassphraseField` — Input trường passphrase (chỉ hiện với OKX và Bitget)
- `DeleteExchangeConfirmDialog` — Dialog xác nhận xóa với warning

### Exchange Status Colors
- `synced` → badge success (xanh)
- `syncing` → badge info (xanh lam) + spinner
- `pending` → badge warning (vàng)
- `error` → badge destructive (đỏ)
- `is_active = false` → badge secondary (xám)

## Sequence Flow

### Connect Exchange (OKX/Bitget với Passphrase)

```
User              ConnectModal         API Route           ExchangeAdapter       Database
 |                    |                    |                    |                   |
 |-- Fill form ------>|                    |                    |                   |
 |   (key+secret      |                    |                    |                   |
 |    +passphrase)    |                    |                    |                   |
 |-- Submit --------->|                    |                    |                   |
 |                    |-- POST /connect -->|                    |                   |
 |                    |                   |-- Zod validate      |                   |
 |                    |                   |   (req passphrase)  |                   |
 |                    |                   |-- validateCreds --->|                   |
 |                    |                   |                    |-- Call exchange -->|
 |                    |                   |                    |   test endpoint    |
 |                    |                   |                    |<-- 200 OK --------|
 |                    |                   |-- hasWithdrawPerm->|                   |
 |                    |                   |                    |-- Check perms ---->|
 |                    |                   |                    |<-- false ----------|
 |                    |                   |-- Encrypt key      |                   |
 |                    |                   |-- Encrypt secret   |                   |
 |                    |                   |-- Encrypt passph.  |                   |
 |                    |                   |-- INSERT accounts->|                   |
 |                    |                   |-- INSERT api_keys->|                   |
 |                    |                   |-- Trigger sync job |                   |
 |                    |<-- 201 Created ----|                   |                   |
 |<-- Show success -->|                   |                    |                   |
```

### PNL Sync Flow (Background Edge Function)

```
Cron (4h)        Edge Function        DB                Exchange APIs
 |                   |                 |                      |
 |-- Trigger ------->|                 |                      |
 |                   |-- Get active accounts --------------->  |
 |                   |<-- List --------|                      |
 |                   |                 |                      |
 |                   |-- For each account:                    |
 |                   |   Decrypt credentials (key+secret+passphrase)
 |                   |   fetchSpotTrades() ------------------>|
 |                   |   fetchFuturesTrades() --------------->|
 |                   |   (income endpoint / bills-archive)    |
 |                   |<-- NormalizedTrade[] ------------------|
 |                   |-- Calculate realized_pnl per trade     |
 |                   |-- Upsert trades -------> DB           |
 |                   |-- Upsert pnl_snapshots -> DB          |
 |                   |-- Update last_synced -----> DB        |
 |                   |-- fetchOpenPositions() ----------->    |
 |                   |<-- UnrealizedPosition[] -----------    |
 |                   |-- Push via Realtime -------> Client   |
```

## Security Considerations

- **API Key Encryption**: AES-256-GCM với per-account derived IV
- **Passphrase Encryption**: Mã hóa giống API key/secret, lưu riêng trong `passphrase_encrypted`
- **Key Version**: Hỗ trợ key rotation thông qua `key_version`
- **Server-only Decryption**: Tất cả credentials chỉ được giải mã trong Supabase Edge Functions
- **Permission Validation**: Bắt buộc kiểm tra withdraw permission trước khi lưu
- **No Key Return**: API response không bao giờ trả về giá trị key, secret, passphrase kể cả encrypted
- **Credential Masking trong Logs**: Format `api_key=xxx***xxx` (mask giữa)
- **Read-Only Enforcement**: Tất cả exchange API chỉ dùng GET endpoints, không có POST/PUT/DELETE đến exchange
- **HTTPS Only**: Tất cả external API calls phải dùng HTTPS
- **Timeout**: Exchange API calls có timeout 10 giây
- **RLS Policies**: User chỉ đọc được `exchange_accounts` của chính mình
