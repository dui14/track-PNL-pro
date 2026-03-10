# Kiến trúc hệ thống — aiTrackProfit

Tài liệu này mô tả kiến trúc hệ thống của **aiTrackProfit** — nền tảng theo dõi PNL và demo trading crypto, xây dựng trên Next.js 15 và Supabase.

---

## Mục lục

- [Tổng quan kiến trúc](#tổng-quan-kiến-trúc)
- [Các layer](#các-layer)
- [Module Map](#module-map)
- [Database Schema](#database-schema)
- [Luồng dữ liệu chính](#luồng-dữ-liệu-chính)
- [Bảo mật](#bảo-mật)
- [API Contract](#api-contract)
- [Infrastructure](#infrastructure)

---

## Tổng quan kiến trúc

aiTrackProfit theo kiến trúc **phân layer, module hoá** với 4 layer tách biệt hoàn toàn:

```
+--------------------------------------------------+
|                   PRESENTATION                   |
|   Next.js App Router   |   TailwindCSS            |
+--------------------------------------------------+
                          |
+--------------------------------------------------+
|                   APPLICATION                    |
|      API Routes  |  Server Actions               |
+--------------------------------------------------+
                          |
+--------------------------------------------------+
|                   DOMAIN                         |
|  PNL Engine | Demo Engine | Exchange Adapters     |
+--------------------------------------------------+
                          |
+--------------------------------------------------+
|                 INFRASTRUCTURE                   |
|  Supabase DB | Supabase Auth | External APIs      |
+--------------------------------------------------+
```

Layer trên chỉ được gọi layer ngay dưới nó — không được bỏ qua layer.

---

## Các layer

### Presentation Layer

**Vị trí:** `src/app/`, `src/components/`

- Render UI dùng React Server Components (RSC) mặc định
- Client Components chỉ khi cần: `useState`, event handlers, browser APIs
- Fetch data qua Server Actions hoặc fetch trực tiếp trong Client Components
- Route protection qua `middleware.ts`
- Không có business logic trong components

### Application Layer

**Vị trí:** `src/app/api/`

- Xử lý HTTP request/response
- Validate input qua Zod `safeParse`
- Verify JWT qua Supabase Auth trước mọi logic
- Gọi domain services — không query database trực tiếp
- Trả về envelope thống nhất `ApiResponse<T>`

```typescript
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ success: false, error: 'VALIDATION_ERROR' }, { status: 400 })

  const result = await service.doWork(supabase, user.id, parsed.data)
  return NextResponse.json(result)
}
```

### Domain Layer

**Vị trí:** `src/lib/services/`, `src/lib/engines/`

- PNL calculation: realized, unrealized, win rate, drawdown
- Demo trading simulation: order cost, realized PNL, balance validation
- Exchange adapter abstraction
- AI chat orchestration

Rules:
- Pure functions khi có thể
- Return `Result<T, E>` — không throw
- Fully testable không cần external dependencies

### Infrastructure Layer

**Vị trí:** `src/lib/db/`, `src/lib/adapters/`

- Supabase query modules theo entity (tradesDb, demoDb, usersDb...)
- Exchange REST API clients (Binance, OKX, Bybit, Bitget, MEXC)
- LLM API client (streaming SSE)
- AES-256-GCM encryption/decryption cho exchange API keys
- Rate limiting và exponential backoff cho exchange APIs

---

## Module Map

```
src/
  app/
    (auth)/
      login/               # Trang đăng nhập
      register/            # Trang đăng ký
    (app)/
      dashboard/           # PNL overview + PNL Calendar
      demo-trading/        # Demo trading terminal (TradingView + Order Management)
      ai-assistant/        # AI chat interface
      exchange/            # Quản lý exchange accounts
      profile/             # Cài đặt profile
    api/
      exchange/            # connect, sync, accounts endpoints
      pnl/
        summary/           # GET PNL stats
        chart/             # GET PNL chart data
        trades/            # GET paginated trades
        calendar/          # GET PNL calendar (daily/monthly)
      ai/                  # Chat streaming, conversations
      demo/                # order (POST/PATCH), orders, order/[id]/close
      profile/             # Profile, avatar
  components/
    features/
      dashboard/
        StatCard.tsx             # KPI card
        PNLChart.tsx             # Line chart PNL
        PNLCalendar.tsx          # Calendar heatmap PNL
        AssetDistribution.tsx
        RecentTradesTable.tsx
        MarketTicker.tsx
      demo-trading/
        DemoTradingTerminal.tsx  # TradingView chart + order form + history tabs
      exchange/
      ai-assistant/
      profile/
    layout/
  lib/
    services/
      pnlService.ts        # fetchPNLSummary, fetchPNLChart, fetchPNLCalendar
      demoService.ts       # placeDemoOrder, closeDemoOrder, listDemoOrders
      exchangeService.ts   # connectExchange, syncExchangeAccount
      aiService.ts         # streamChat, createConversation
    engines/
      pnlEngine.ts         # calculatePNLSummary, buildPNLTimeSeries, buildPNLCalendarDays, buildPNLCalendarMonths
      demoEngine.ts        # calculateDemoOrderCost, calculateDemoRealizedPNL, validateDemoBalance
    adapters/
    db/
      tradesDb.ts
      demoDb.ts
      usersDb.ts
      exchangeDb.ts
      pnlDb.ts
      chatDb.ts
    validators/
      pnl.ts               # PNLSummaryQuerySchema, PNLChartQuerySchema, PNLCalendarQuerySchema
      demo.ts              # PlaceDemoOrderSchema, CloseDemoOrderSchema
      exchange.ts
      profile.ts
    types/
      index.ts             # ApiResponse, DemoTrade, PNLCalendarDay, PNLCalendarMonth
  middleware.ts
```

---

## Database Schema

Database chạy trên **Supabase PostgreSQL**. RLS enabled trên tất cả tables.

### Entity Relationship

```
auth.users
    |
    +-- users (profile: display_name, avatar_url, demo_balance)
    |
    +-- exchange_accounts
    |       |
    |       +-- api_keys (key/secret đã mã hoá AES-256-GCM)
    |       +-- trades (lịch sử giao dịch thực)
    |       +-- pnl_snapshots (pre-aggregated PNL)
    |
    +-- demo_trades (lịch sử demo orders)
    |
    +-- chat_conversations
            |
            +-- chat_messages
```

### Bảng chính

| Bảng | Mục đích |
|---|---|
| `users` | Mở rộng `auth.users` với profile (tên, avatar, demo_balance) |
| `exchange_accounts` | Account sàn giao dịch của user |
| `api_keys` | API key và secret đã mã hoá (AES-256-GCM) |
| `trades` | Lịch sử giao dịch thực từ các sàn |
| `pnl_snapshots` | PNL pre-aggregated theo kỳ để query nhanh |
| `demo_trades` | Lệnh mô phỏng trong module demo trading |
| `chat_conversations` | Phiên chat AI |
| `chat_messages` | Tin nhắn trong conversation |

### demo_trades — Cấu trúc lưu lịch sử lệnh

```sql
CREATE TABLE demo_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  quantity        NUMERIC(28,10) NOT NULL,
  entry_price     NUMERIC(28,10) NOT NULL,
  exit_price      NUMERIC(28,10),
  realized_pnl    NUMERIC(28,10),
  status          TEXT NOT NULL CHECK (status IN ('open','closed','cancelled')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Mã hoá API Keys

1. Sinh random IV (16 bytes) cho mỗi key
2. Mã hoá bằng AES-256-GCM với `ENCRYPTION_MASTER_KEY`
3. Lưu `key_encrypted`, `key_iv`, `secret_encrypted`, `secret_iv` vào `api_keys`
4. `key_version` hỗ trợ key rotation

---

## Luồng dữ liệu chính

### PNL Calendar Load

```
User vào /dashboard
  |
  PNLCalendar component mount
    |
    +-> GET /api/pnl/calendar?view=daily&year=2026&month=3
          |
          +-> PNLCalendarQuerySchema.safeParse(params)
          +-> fetchPNLCalendar(supabase, userId, 'daily', 2026, 3)
                |
                +-> getTradesForPNL(startDate=2026-03-01, endDate=2026-03-31)
                +-> buildPNLCalendarDays(trades, 2026, 3)
                    -> [{ date: '2026-03-01', pnl: 0, tradeCount: 0 }, ...]
    |
    Component render calendar grid
    Highlight ngày có PNL dương (xanh) / âm (đỏ)
```

### Demo Trading — Đặt lệnh

```
User nhấn "Mở Long"
  |
  +-> POST /api/demo/order
        |
        +-> Validate JWT + PlaceDemoOrderSchema
        +-> placeDemoOrder(supabase, userId, { symbol, side, orderType, quantity, price })
              |
              +-> getUserDemoBalance(userId) -> balance
              +-> validateDemoBalance(balance, side, qty, price)
              +-> createDemoTrade(record) -> DemoTrade
              +-> updateUserDemoBalance(userId, balance - cost)
        +-> Return 201 + DemoTrade
    |
    Frontend: refresh openPositions + balance
```

### Demo Trading — Đóng vị thế

```
User nhấn "Đóng" trên vị thế
  |
  +-> PATCH /api/demo/order
        |
        +-> CloseDemoOrderSchema.safeParse({ tradeId, exitPrice })
        +-> closeDemoOrder(supabase, userId, tradeId, exitPrice)
              |
              +-> getDemoTradeById(tradeId, userId)
              +-> calculateDemoRealizedPNL(trade, exitPrice) -> pnl
              +-> closeDemoTrade(tradeId, userId, exitPrice, pnl)
              +-> updateUserDemoBalance(userId, newBalance)
        +-> Return 200 + closed DemoTrade
    |
    Frontend: refresh positions + closed trades + balance
```

### Exchange Sync

```
User nhấn "Sync"
  |
  +-> POST /api/exchange/sync
        |
        +-> Fetch api_keys từ DB
        +-> Decrypt (AES-256-GCM)
        +-> ExchangeAdapter.fetchTrades(key, secret)
        +-> Normalize thành internal Trade schema
        +-> Tính realized PNL mỗi trade
        +-> upsertTrades() vào DB
        +-> Recalculate pnl_snapshots
```

### AI Chat

```
User gửi tin nhắn
  |
  +-> POST /api/ai/chat
        |
        +-> Verify JWT
        +-> Lấy conversation context (lịch sử messages)
        +-> Gọi LLM API với system prompt + context + user message
        +-> Stream response qua SSE
        +-> Lưu assistant reply vào chat_messages
    |
    Frontend: render streaming text
```

---

## Bảo mật

### Authentication

- Mọi protected route verify JWT server-side qua `middleware.ts`
- `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng server-side, không expose client
- API routes trả `401` khi thiếu/sai token

### Exchange API Key Security

- Keys được mã hoá AES-256-GCM ngay khi nhận — không bao giờ lưu plaintext
- Keys không bao giờ được log hoặc trả về trong API response
- API keys phải là read-only — không hỗ trợ quyền withdrawal

### Input Validation

- Tất cả input từ client qua Zod `safeParse` trước khi xử lý
- Validation errors trả `400 VALIDATION_ERROR` — không leak internal schema

### Rate Limiting

- Exchange API calls rate-limited ở infrastructure layer
- HTTP 429 trigger exponential backoff với jitter
- AI chat endpoint rate-limited per user

### Row Level Security (RLS)

- Tất cả tables Supabase có RLS policy: user chỉ đọc/ghi được row của chính mình
- Policy dựa trên `auth.uid()` — không thể bypass qua API

---

## API Contract

Tất cả endpoints trả về envelope thống nhất:

```typescript
type ApiResponse<T> = {
  success: boolean
  data: T | null
  error: string | null
  meta?: { page?: number; limit?: number; total?: number }
}
```

### Danh sách endpoints

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/exchange/connect` | Kết nối exchange account mới |
| `GET` | `/api/exchange/accounts` | Danh sách exchange accounts |
| `PATCH` | `/api/exchange/accounts/[id]` | Cập nhật account (label, active) |
| `DELETE` | `/api/exchange/accounts/[id]` | Xoá exchange account |
| `POST` | `/api/exchange/sync` | Sync trade history từ sàn |
| `GET` | `/api/pnl/summary` | PNL stats (total, win rate, trade count) |
| `GET` | `/api/pnl/chart` | Dữ liệu đường PNL chart |
| `GET` | `/api/pnl/trades` | Lịch sử trades phân trang |
| `GET` | `/api/pnl/calendar` | PNL Calendar (daily/monthly) |
| `POST` | `/api/ai/chat` | Gửi message AI (SSE stream) |
| `GET` | `/api/ai/conversations` | Danh sách AI conversations |
| `GET` | `/api/ai/conversations/[id]/messages` | Tin nhắn trong conversation |
| `POST` | `/api/demo/order` | Đặt demo order mới |
| `PATCH` | `/api/demo/order` | Đóng demo position |
| `POST` | `/api/demo/order/[id]/close` | Đóng position theo ID |
| `GET` | `/api/demo/orders` | Danh sách demo orders (filter by status) |
| `GET` | `/api/profile` | Lấy user profile |
| `PATCH` | `/api/profile` | Cập nhật profile |
| `POST` | `/api/profile/avatar` | Upload avatar |
| `PATCH` | `/api/auth/account` | Đổi mật khẩu |

### PNL Calendar Endpoint

```
GET /api/pnl/calendar

Query params:
  view    = 'daily' | 'monthly'   (required)
  year    = number (2020-2030)     (required)
  month   = number (1-12)          (required khi view='daily')

Response daily:
  { success: true, data: PNLCalendarDay[] }
  PNLCalendarDay = { date: string, pnl: number, hasData: boolean }

Response monthly:
  { success: true, data: PNLCalendarMonth[] }
  PNLCalendarMonth = { yearMonth: string, pnl: number, hasData: boolean }
```

---

## Infrastructure

| Component | Provider | Ghi chú |
|---|---|---|
| Frontend Hosting | Vercel | Auto-deploy từ main branch |
| Database | Supabase PostgreSQL | Managed, RLS enabled |
| Auth | Supabase Auth | Google OAuth + email/password |
| Storage | Supabase Storage | Avatar uploads |
| Secrets | Vercel env vars | Không commit vào codebase |
| Price Feed | TradingView Widget | Live candlestick chart trong demo trading |
