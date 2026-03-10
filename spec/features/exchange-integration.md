# Feature Specification: Exchange API Connection

## Overview

Cho phép người dùng kết nối các tài khoản sàn giao dịch crypto (Binance, OKX, Bybit, Bitget, MEXC) bằng API keys. Hệ thống mã hóa và lưu trữ API keys an toàn, xác thực permissions, fetch balance và trade history, quản lý rate limits, và cho phép kích hoạt/vô hiệu hóa kết nối.

## Goals

- Hỗ trợ kết nối 5 sàn giao dịch lớn nhất
- Mã hóa API keys bằng AES-256-GCM trước khi lưu trữ
- Chỉ cho phép API keys có quyền read-only
- Fetch và normalize trade history từ nhiều sàn với format thống nhất
- Xử lý rate limits theo từng sàn với exponential backoff
- Cung cấp UX quản lý kết nối rõ ràng

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-EX-001 | Trader | Kết nối Binance account | Tự động sync trade history |
| US-EX-002 | Trader | Kết nối nhiều sàn cùng lúc | Xem PNL tổng hợp |
| US-EX-003 | Trader | Xem trạng thái kết nối của từng sàn | Biết sàn nào đang sync |
| US-EX-004 | Trader | Vô hiệu hóa kết nối tạm thời | Ngừng sync mà không xóa API keys |
| US-EX-005 | Trader | Xóa kết nối sàn | Hủy hoàn toàn liên kết |
| US-EX-006 | Trader | Xem balance real-time từng sàn | Theo dõi tổng tài sản |
| US-EX-007 | Trader | Trigger manual sync | Cập nhật trade mới nhất |
| US-EX-008 | Trader | Nhận thông báo nếu API key hết hạn | Kịp thời cập nhật |

## Functional Requirements

### FR-EX-001: Kết nối Exchange (Connect)
- Form nhập: exchange name, API key, API secret, optional label
- Validate input format: API key và secret không được rỗng, không chứa khoảng trắng
- Kiểm tra duplicate: mỗi user chỉ được kết nối một account per exchange
- Gọi exchange API test endpoint để verify credentials
- Kiểm tra permissions: chỉ chấp nhận read-only keys
- Detect và block keys có withdraw permission
- Mã hóa API key và secret bằng AES-256-GCM trước khi lưu
- Tạo record `exchange_accounts` và `api_keys`
- Trigger initial trade sync sau khi kết nối thành công

### FR-EX-002: Danh sách Exchange Accounts
- Hiển thị tất cả exchange accounts của user
- Thông tin hiển thị: exchange name, label, status (active/inactive), last_synced time
- API keys KHÔNG bao giờ được trả về trong response
- Hiển thị badge trạng thái: Connected (xanh), Inactive (xám), Error (đỏ)

### FR-EX-003: Sync Trade History
- Fetch trades từ `last_synced` đến hiện tại (incremental sync)
- Nếu sync lần đầu: fetch 90 ngày gần nhất
- Normalize trade data sang format chuẩn (xem Data Models)
- Deduplicate bằng `external_trade_id`
- Cập nhật `last_synced` timestamp sau khi sync thành công
- Background sync tự động mỗi 4 giờ (Supabase Edge Function cron)

### FR-EX-004: Fetch Balance
- Gọi exchange balance endpoint với API key đã giải mã
- Chỉ hiển thị assets có balance > 0
- Convert tất cả về USD equivalent sử dụng giá hiện tại
- Cache balance trong 5 phút để giảm API calls
- Balance KHÔNG lưu vào database (fetch on-demand)

### FR-EX-005: Rate Limit Handling
| Exchange | Rate Limit | Strategy |
|---|---|---|
| Binance | 1200 req/min (weight) | Track weight, sleep khi gần limit |
| OKX | 20 req/2s per endpoint | Token bucket per endpoint |
| Bybit | 120 req/s | Sliding window counter |
| Bitget | 20 req/s | Fixed window |
| MEXC | 500 req/s | Sliding window |

- Implement exponential backoff khi nhận 429 response
- Backoff formula: `min(2^attempt * 1000ms, 60000ms)` + jitter
- Log rate limit events để monitor

### FR-EX-006: Enable/Disable Connection
- Toggle `is_active` trên `exchange_accounts`
- Inactive accounts không được include trong sync jobs
- Inactive accounts không được fetch balance hoặc trades
- User có thể re-enable bất kỳ lúc nào

### FR-EX-007: Xóa Exchange Account
- Soft warning trước khi xóa: "Xóa sẽ mất tất cả trade history và PNL data"
- Xóa cascade: `exchange_accounts` → `api_keys`, `trades`, `pnl_snapshots`
- Không thể hoàn tác sau khi xóa

## Non-Functional Requirements

- API key encryption/decryption < 10ms
- Exchange API validation timeout: 10 giây
- Trade sync job timeout: 5 phút
- Parallel sync: tối đa 3 exchanges đồng thời per user
- Exchange API calls chỉ thực hiện từ server-side (Edge Functions)
- Log tất cả sync events với timestamps nhưng KHÔNG log API keys
- Support ít nhất 10,000 trades per exchange account

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| API key hợp lệ nhưng hết hạn | Đánh dấu account error, thông báo user |
| Exchange API bị timeout | Retry 3 lần, sau đó mark sync failed |
| Duplicate trade ID từ exchange | Skip, không tạo duplicate |
| Exchange thay đổi API format | Adapter throw normalized error, không crash toàn hệ thống |
| User xóa API key trên sàn | Sync thất bại, hiển thị "API key invalid" |
| Exchange bảo trì | Retry sau 30 phút, không block UI |
| Rate limit 429 kéo dài | Exponential backoff tối đa 60 giây, sau đó postpone |
| API key có futures permission nhưng không spot | Chỉ sync futures trades, log warning |
| Kết nối trùng exchange | Return error "Exchange already connected" |

## Data Models

### exchange_accounts
```sql
CREATE TABLE exchange_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget','mexc')),
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
  key_iv              TEXT NOT NULL,
  secret_iv           TEXT NOT NULL,
  key_version         INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

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
  trade_type          TEXT NOT NULL CHECK (trade_type IN ('spot','futures','margin')),
  traded_at           TIMESTAMPTZ NOT NULL,
  raw_data            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_account_id, external_trade_id)
);
```

## Exchange Adapter Interface

```typescript
interface ExchangeAdapter {
  readonly exchange: ExchangeName
  validateCredentials(apiKey: string, apiSecret: string): Promise<Result<ValidationResult>>
  fetchTrades(credentials: DecryptedCredentials, since: Date): Promise<Result<NormalizedTrade[]>>
  fetchBalances(credentials: DecryptedCredentials): Promise<Result<AssetBalance[]>>
  hasWithdrawPermission(apiKey: string, apiSecret: string): Promise<boolean>
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
  tradeType: 'spot' | 'futures' | 'margin'
  tradedAt: Date
  rawData: Record<string, unknown>
}

type AssetBalance = {
  asset: string
  free: number
  locked: number
  usdValue: number
}
```

## API Endpoints

### POST /api/exchange/connect

Kết nối exchange account mới.

Request:
```json
{
  "exchange": "binance",
  "apiKey": "xxxxx",
  "apiSecret": "yyyyy",
  "label": "Binance Main"
}
```

Validation:
- `exchange` in ['binance','okx','bybit','bitget','mexc']
- `apiKey` string 10-512 ký tự
- `apiSecret` string 10-512 ký tự
- `label` optional string max 50 ký tự

Response success (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "exchange": "binance",
    "label": "Binance Main",
    "is_active": true,
    "sync_status": "pending",
    "created_at": "2026-03-07T00:00:00Z"
  },
  "error": null
}
```

Response error (400 - withdraw detected):
```json
{
  "success": false,
  "data": null,
  "error": "WITHDRAW_PERMISSION_DETECTED"
}
```

### GET /api/exchange/accounts

Danh sách exchange accounts.

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
      "last_synced": "2026-03-07T10:00:00Z",
      "trade_count": 124
    }
  ],
  "error": null
}
```

### POST /api/exchange/sync

Trigger manual sync.

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
    "last_synced": "2026-03-07T10:30:00Z"
  },
  "error": null
}
```

### GET /api/exchange/balance/:id

Fetch live balance cho một exchange account.

Response:
```json
{
  "success": true,
  "data": {
    "exchange_account_id": "uuid",
    "total_usd": 15420.50,
    "assets": [
      { "asset": "BTC", "free": 0.5, "locked": 0.0, "usd_value": 32500.0 },
      { "asset": "USDT", "free": 2500.0, "locked": 0.0, "usd_value": 2500.0 }
    ],
    "fetched_at": "2026-03-07T10:00:00Z"
  },
  "error": null
}
```

### PATCH /api/exchange/accounts/:id

Update exchange account (toggle active status, update label).

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

### DELETE /api/exchange/accounts/:id

Xóa exchange account và toàn bộ dữ liệu liên quan.

Response:
```json
{
  "success": true,
  "data": { "deleted": true },
  "error": null
}
```

## UI Components

### Pages
- `/profile` → Tab "Exchange Connections" — Quản lý tất cả kết nối
- Modal "Connect Exchange" — Form kết nối mới

### Components
- `ExchangeConnectionList` — Danh sách tất cả connections với status
- `ConnectExchangeModal` — Modal form nhập API keys
- `ExchangeCard` — Card hiển thị thông tin 1 exchange connection
- `ExchangeStatusBadge` — Badge màu cho trạng thái
- `SyncProgressIndicator` — Loading state khi sync đang chạy
- `BalanceDisplay` — Hiển thị balance theo exchange
- `DeleteExchangeConfirmDialog` — Dialog xác nhận xóa

### Exchange Status Colors
- `synced` → badge success (xanh)
- `syncing` → badge info (xanh lam) + spinner
- `pending` → badge warning (vàng)
- `error` → badge destructive (đỏ)
- `is_active = false` → badge secondary (xám)

## Sequence Flow

### Connect Exchange

```
User              ConnectModal         API Route           ExchangeAdapter       Database
 |                    |                    |                    |                   |
 |-- Fill form ------>|                    |                    |                   |
 |-- Submit --------->|                    |                    |                   |
 |                    |-- POST /connect -->|                    |                   |
 |                    |                   |-- Zod validate     |                   |
 |                    |                   |-- Check duplicate->|                   |
 |                    |                   |-- validateCreds -->|                   |
 |                    |                   |                    |-- Call exchange -->|
 |                    |                   |                    |    test endpoint  |
 |                    |                   |                    |<-- 200 OK --------|
 |                    |                   |-- hasWithdrawPerm->|                   |
 |                    |                   |                    |-- Check perms ---->|
 |                    |                   |                    |<-- false ----------|
 |                    |                   |-- Encrypt keys     |                   |
 |                    |                   |-- INSERT accounts->|                   |
 |                    |                   |-- INSERT api_keys->|                   |
 |                    |                   |-- Trigger sync job |                   |
 |                    |<-- 201 Created ----|                   |                   |
 |<-- Show success -->|                   |                    |                   |
```

### Auto Background Sync (Edge Function Cron)

```
Cron Scheduler       Edge Function        Database          Exchange API
 |                       |                    |                  |
 |-- Trigger every 4h -->|                    |                  |
 |                       |-- Fetch active accounts ------------>|
 |                       |<-- List of accounts -----------------|            
 |                       |                    |                  |
 |                       |-- For each account:|                  |
 |                       |-- Decrypt API keys |                  |
 |                       |-- fetchTrades() -->|                  |
 |                       |                    |-- REST API call ->|
 |                       |                    |<-- trades --------|
 |                       |-- Normalize trades |                  |
 |                       |-- Upsert trades -->|                  |
 |                       |-- Update last_synced ---------------->|
 |                       |-- Trigger PNL recalc                  |
```

## Security Considerations

- **API Key Encryption**: AES-256-GCM với per-account derived IV, keys không bao giờ lưu plain text
- **Key Version**: Hỗ trợ key rotation thông qua `key_version` field
- **Server-only Decryption**: Keys chỉ được giải mã trong Supabase Edge Functions, không bao giờ ở client
- **Permission Validation**: Bắt buộc kiểm tra withdraw permission trước khi lưu
- **RLS Policies**: User chỉ đọc được `exchange_accounts` của chính mình
- **No Key Return**: API response không bao giờ trả về API key values, kể cả encrypted
- **Credential Masking trong Logs**: Log format: `api_key=xxx***xxx` (mask giữa)
- **Exchange API từ Server**: Tất cả exchange API calls thực hiện từ Edge Functions, không từ browser
- **HTTPS Only**: Tất cả external API calls phải dùng HTTPS
- **Timeout**: Exchange API calls có timeout 10 giây để tránh hanging requests
