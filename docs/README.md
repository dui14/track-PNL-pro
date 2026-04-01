# Track PNL Pro Documentation

Nền tảng web thống nhất cho phép trader crypto theo dõi PNL trên nhiều sàn giao dịch tập trung, mô phỏng giao dịch không rủi ro và tư vấn chiến lược với AI assistant.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng chính](#tính-năng-chính)
- [Tech Stack](#tech-stack)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Database Setup](#database-setup)
- [Google OAuth Setup](#google-oauth-setup)
- [Biến môi trường](#biến-môi-trường)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Scripts](#scripts)
- [Sàn giao dịch hỗ trợ](#sàn-giao-dịch-hỗ-trợ)

---

## Tổng quan

Track PNL Pro giải quyết vấn đề dữ liệu giao dịch phân tán trên nhiều sàn bằng cách tổng hợp PNL từ nhiều CEX vào một giao diện duy nhất. Ngoài ra còn cung cấp môi trường demo trading không rủi ro và AI assistant tích hợp LLM.

Người dùng mục tiêu: Trader crypto đa sàn (Binance, OKX, Bybit, Bitget, Gate.io) cần theo dõi PNL tự động, mô phỏng chiến lược và tư vấn thị trường từ AI.

---

## Tính năng chính

### Dashboard
- Kết nối exchange accounts qua read-only API keys
- Fetch và chuẩn hoá lịch sử giao dịch đã đóng từ các sàn
- Tính toán realized PNL theo từng giao dịch và tổng hợp theo kỳ (Day / Week / Month / Year / All-time)
- Hiển thị win rate, tổng số lệnh và số dư portfolio theo sàn
- PNL Calendar: Calendar heatmap hiển thị lợi nhuận theo ngày và theo tháng với điều hướng thời gian
- Biểu đồ xu hướng PNL (line chart, Recharts)
- Tổng số dư quy đổi ra USD

### Demo Trading
- **TradingView chart** nhúng trực tiếp (live data, candlestick)
- Đặt lệnh mô phỏng: Market và Limit orders
- Bảng vị thế mở (Open Positions) với nút đóng lệnh
- **Lịch sử lệnh** (Order History) — tất cả lệnh đã đóng với PNL thực
- **Lịch sử giao dịch** (Trade History) — toàn bộ lệnh mua/bán theo thứ tự thời gian
- Số dư ảo khởi tạo mặc định: **10,000 USDT** mỗi user
- Tính PNL khi đóng vị thế (có trừ phí giao dịch 0.1%)
- Lưu toàn bộ lịch sử vào database

### Ask AI
- Chat interface cho câu hỏi giao dịch, phân tích chiến lược, giải thích PNL
- Streaming responses qua Server-Sent Events (SSE)
- Tích hợp LLM: OpenAI / Groq / Anthropic
- Lịch sử chat lưu trong database
- Sidebar danh sách conversation để tiếp tục chat cũ

### User Profile
- Cập nhật tên hiển thị, email và avatar (Supabase Storage)
- Đổi mật khẩu cho tài khoản email
- Quản lý API keys exchange: thêm, xem, xoá
- Bật/tắt sync theo sàn

### Authentication
- Google OAuth qua Supabase Auth
- Email + Password qua Supabase Auth
- Session quản lý qua Supabase JWT tokens
- Protected routes enforce server-side qua Next.js middleware

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | TailwindCSS 3 |
| Charts | Recharts 2 + TradingView Widget |
| Forms | React Hook Form 7 + Zod 3 |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Vercel |
| Package Manager | pnpm |

---

## Yêu cầu hệ thống

- **Node.js** >= 20.0.0
- **pnpm** >= 10.0.0
- Một **Supabase project** (cloud hoặc local)
- Một **LLM API key** (OpenAI, Groq hoặc Anthropic)

Install pnpm:
```bash
npm install -g pnpm
```

---

## Cài đặt

### 1. Clone repository

```bash
git clone <https://github.com/dui14/track-PNL-pro.git>
cd track-PNL-pro
```

### 2. Install dependencies

```bash
cd src
pnpm install
```

### 3. Cấu hình biến môi trường

```bash
cp .env.example .env.local
```

Xem phần [Biến môi trường](#biến-môi-trường) để biết chi tiết từng biến.

### 4. Setup database

Xem phần [Database Setup](#database-setup).

### 5. Chạy development server

```bash
pnpm dev
```

App chạy tại [http://localhost:3000](http://localhost:3000).

---

## Database Setup

Schema SQL đầy đủ nằm tại `database/schema.sql`. Script này tạo toàn bộ tables, indexes, RLS policies và triggers.

### Cách 1: Supabase Dashboard SQL Editor (Khuyến nghị)

1. Mở [Supabase Dashboard](https://supabase.com/dashboard) và chọn project.
2. Vào **SQL Editor** → **New query**.
3. Mở `database/schema.sql`, copy toàn bộ nội dung và paste vào editor.
4. Click **Run** (`Ctrl+Enter`).
5. Kiểm tra **Table Editor** để xác nhận các bảng đã được tạo.

### Cách 2: psql

```bash
psql "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" -f database/schema.sql
```

### Lưu ý quan trọng

- Script dùng `IF NOT EXISTS` — có thể chạy lại an toàn.
- Bảng `api_keys` bị chặn ở RLS (`USING (FALSE)`) — chỉ backend service role mới truy cập được.
- Trigger `on_auth_user_created` tự động tạo row trong bảng `users` khi người dùng đăng ký.

---

## Google OAuth Setup

### Vấn đề thường gặp

Google hiển thị: _"Tiếp tục tới kjtayyxarcxxkhpyhxgp.supabase.co"_ — đây là hành vi mặc định, Google luôn hiển thị domain của `redirect_uri`. **Không phải lỗi code.**

### Cách fix

#### 1. Đặt tên app trên Google Cloud Console

1. Vào [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **OAuth consent screen**.
2. Tại **App name**, đặt là `aiTrackProfit`.
3. Thêm logo và thông tin liên hệ nếu muốn. Click **Save and Continue**.

#### 2. Cấu hình Supabase Auth

Vào Supabase Dashboard → **Authentication** → **URL Configuration**:
- **Site URL**: `https://yourdomain.com` (production) hoặc `http://localhost:3000` (dev)
- **Redirect URLs**: Thêm `http://localhost:3000/**` và `https://yourdomain.com/**`

---

## Biến môi trường

Tạo file `.env.local` trong thư mục `src/`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# LLM API (OpenAI, Groq hoặc Anthropic)
OPENAI_API_KEY=<your-llm-api-key>
MODELS_QWEN=qwen/qwen3.5-9b
MODELS_CLAUDE=anthropic/claude-sonnet-4.6
MODELS_GEMINI=google/gemini-3-flash-preview
MODELS_GROK=x-ai/grok-4.1-fast
MODELS_DEEPSEEK=deepseek/deepseek-v3.2
MODELS_GPT=openai/gpt-5.4

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Cấu trúc dự án

```
src/
  app/
    (auth)/            # Login, Register pages
    (app)/             # Protected pages
      dashboard/       # PNL overview + PNL Calendar
      demo-trading/    # Demo trading terminal + TradingView chart
      ai-assistant/    # AI chat interface
      exchange/        # Exchange account management
      profile/         # User profile settings
    api/               # API Route handlers
      ai/              # Chat, conversations endpoints
      demo/            # Demo order endpoints
      exchange/        # Connect, sync, accounts endpoints
      pnl/             # PNL chart, summary, trades, calendar endpoints
      profile/         # Profile, avatar endpoints
  components/
    features/          # Feature components
      dashboard/       # StatCard, PNLChart, PNLCalendar, AssetDistribution...
      demo-trading/    # DemoTradingTerminal (TradingView + order management)
      exchange/        # Exchange connection forms
      ai-assistant/    # Chat components
    layout/            # Sidebar, navbar, app shell
  lib/
    services/          # Domain services (pnlService, demoService, exchangeService)
    engines/           # PNL calculation engine, demo trading engine
    adapters/          # Exchange API clients, LLM client
    db/                # Supabase query modules (tradesDb, demoDb, usersDb...)
    validators/        # Zod schemas
    types/             # Global TypeScript types
  middleware.ts        # Route protection
```

---

## Scripts

Chạy tất cả lệnh từ thư mục `src/`.

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Dev server trên port 3000 |
| `pnpm build` | Build production bundle |
| `pnpm start` | Chạy production server |
| `pnpm lint` | Chạy ESLint |

---

## Sàn giao dịch hỗ trợ

| Sàn | Trade History | Balance |
|---|---|---|
| Binance | REST API | REST API |
| OKX | REST API | REST API |
| Bybit | REST API | REST API |
| Bitget | REST API | REST API |
| Gate.io | REST API | REST API |

Tất cả API keys exchange phải là **read-only** (không cần quyền withdrawal).


## Core Features

### Dashboard
- Connect exchange accounts via read-only API keys
- Fetch and normalize closed trade history from exchanges
- Calculate realized PNL per trade and aggregate by time period (Day / Week / Month / Year / All-time)
- Display win rate, total trade count, and portfolio balance per exchange
- PNL trend charts (line / bar via Recharts)
- Aggregated total balance in USD equivalent

### Demo Trading
- TradingView chart widget (candlestick) embedded
- Real-time price data via Binance WebSocket public streams
- Simulated order placement: Market and Limit orders
- Open orders management and trade history
- Virtual balance initialized per user (default: 10,000 USDT)
- Simulated PNL calculated on demo position close

### Ask AI
- Chat interface for trading questions, strategy advice, PNL interpretation, and risk management
- Streaming responses via Server-Sent Events (SSE)
- LLM integration: OpenAI / Groq / Anthropic
- Conversation history stored in database
- Sidebar with conversation list to reload and continue past chats

### User Profile
- Update display name, email, and avatar (stored in Supabase Storage)
- Change password for email/password accounts
- Manage connected exchange API keys (add, view, delete)
- Enable / disable sync per exchange

### Authentication
- Google OAuth via Supabase Auth
- Email + Password via Supabase Auth
- Session managed via Supabase JWT tokens
- Protected routes enforced server-side via Next.js middleware

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | TailwindCSS 3 + shadcn/ui |
| State (client) | Zustand 5 |
| State (server) | TanStack Query 5 |
| Charts | Recharts 2 |
| Forms | React Hook Form 7 + Zod 3 |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Vercel |
| Package Manager | pnpm |

---

## Prerequisites

Ensure the following are installed on your machine:

- **Node.js** >= 20.0.0
- **pnpm** >= 10.0.0
- **Supabase CLI** (for local database development)
- A **Supabase project** (cloud or local)
- An **LLM API key** (OpenAI, Groq, or Anthropic)

Install Supabase CLI:
```bash
npm install -g supabase
```

Install pnpm (if not already installed):
```bash
npm install -g pnpm
```

---

## Getting Started (Local Dev)

### 1. Clone the repository

```bash
git clone <https://github.com/dui14/track-PNL-pro.git>
cd track-PNL-pro
```

### 2. Install dependencies

```bash
cd src
pnpm install
```

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) for details on each variable.

### 4. Set up the database (optional: local Supabase)

To run Supabase locally:

```bash
supabase init
supabase start
```

Then apply migrations:

```bash
supabase db push
```

Or use a remote Supabase project and point the env vars to your cloud project URL.

### 5. Start the development server

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## Database Setup

Schema SQL đầy đủ nằm tại `database/schema.sql`. Chạy script này một lần để tạo toàn bộ tables, indexes, RLS policies và triggers.

### Cách 1: Supabase Dashboard (SQL Editor) — Khuyến nghị

1. Mở [https://supabase.com/dashboard](https://supabase.com/dashboard) và chọn project của bạn.
2. Vào **SQL Editor** ở thanh sidebar bên trái.
3. Click **New query**.
4. Mở file `database/schema.sql` trong project, copy toàn bộ nội dung.
5. Paste vào SQL Editor.
6. Click **Run** (hoặc `Ctrl+Enter`).
7. Kiểm tra tab **Table Editor** để xác nhận các bảng đã được tạo.

### Cách 2: Supabase CLI (local hoặc remote)

```bash
# Áp dụng lên Supabase local
supabase db reset

# Hoặc chạy trực tiếp file SQL lên remote project
supabase db push --db-url "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" < database/schema.sql
```

### Cách 3: psql (nếu dùng Supabase local hoặc self-hosted)

Connection string lấy từ Supabase Dashboard → Settings → Database → Connection string.

```bash
psql "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" -f database/schema.sql
```

### Lưu ý

- Script dùng `IF NOT EXISTS` nên có thể chạy lại an toàn mà không bị lỗi duplicate.
- Bảng `api_keys` bị chặn hoàn toàn ở RLS (`USING (FALSE)`) — chỉ backend với `SUPABASE_SERVICE_ROLE_KEY` mới truy cập được.
- Trigger `on_auth_user_created` tự động tạo row trong bảng `users` mỗi khi có người đăng ký mới.

---

## Google OAuth Setup

### Vấn đề: Google hiển thị "Tiếp tục tới kjtayyxarcxxkhpyhxgp.supabase.co"

Khi người dùng đăng nhập bằng Google, xuất hiện màn hình:
```
Chọn tài khoản
Tiếp tục tới kjtayyxarcxxkhpyhxgp.supabase.co
```

Đây là hành vi mặc định của Google OAuth — Google luôn hiển thị domain của `redirect_uri`. Supabase xử lý OAuth callback qua domain nội bộ của nó, do đó Google hiển thị Supabase subdomain thay vì tên app của bạn. **Đây không phải lỗi code.**

### Cách fix

#### Bước 1: Đặt tên app trên Google Cloud Console

1. Mở [https://console.cloud.google.com](https://console.cloud.google.com) và chọn project chứa OAuth credentials.
2. Vào **APIs & Services** → **OAuth consent screen**.
3. Tại mục **App name**, đặt là `aiTrackProfit` (hoặc tên bạn muốn hiển thị).
4. Thêm logo và thông tin liên hệ nếu muốn.
5. Click **Save and Continue**.

Sau bước này, người dùng sẽ thấy tên app thay vì domain lạ trên màn hình consent.

#### Bước 2 (Tùy chọn — cần Supabase Pro plan): Ẩn hoàn toàn Supabase domain

Để Google hiển thị domain của bạn thay vì `*.supabase.co`:

1. Vào Supabase Dashboard → **Settings** → **Custom Domains**.
2. Thiết lập custom domain, ví dụ: `auth.aitrackprofit.com`.
3. Thêm CNAME record vào DNS của domain theo hướng dẫn của Supabase.
4. Sau khi custom domain được xác nhận, Supabase sẽ dùng `auth.aitrackprofit.com` làm OAuth callback URL.
5. Cập nhật Google Cloud Console → **Credentials** → thêm `https://auth.aitrackprofit.com/auth/v1/callback` vào **Authorized redirect URIs**.

#### Bước 3: Cấu hình Supabase Auth settings

Trong Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `https://yourdomain.com` (production) hoặc `http://localhost:3000` (local dev)
- **Redirect URLs**: Thêm các URL sau:
  ```
  http://localhost:3000/**
  https://yourdomain.com/**
  ```

---

Create a `.env.local` file inside the `src/` directory with the following variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Encryption (AES-256-GCM master key for exchange API key storage)
ENCRYPTION_MASTER_KEY=<32-byte-hex-or-base64-key>

# LLM API (OpenAI, Groq, or Anthropic)
OPENAI_API_KEY=<your-llm-api-key>

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser.
> Never use `NEXT_PUBLIC_` for exchange secrets, LLM keys, or service role keys.

### Security Notes

- Exchange API keys entered by users are **encrypted at rest** using AES-256-GCM before being stored in the database.
- `ENCRYPTION_MASTER_KEY` must be kept secret and never committed to version control.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — use only in server-side code.

---

## Project Structure

```
src/
  app/
    (auth)/          # Login and registration pages
    (app)/           # Protected app pages (dashboard, demo, AI, profile)
    api/             # Next.js API route handlers
      ai/            # AI chat endpoints
      demo/          # Demo trading endpoints
      exchange/      # Exchange connect, sync, accounts endpoints
      pnl/           # PNL data endpoints
      profile/       # Profile management endpoints
  components/
    features/        # Feature-specific components
    layout/          # App shell, navigation, sidebar
  lib/
    actions/         # Next.js Server Actions
    services/        # Domain services (PNL, AI, exchange logic)
    engines/         # PNL calculation and demo trading engines
    adapters/        # Exchange API clients and LLM client
    db/              # Supabase query modules
    validators/      # Zod validation schemas
    types/           # Global TypeScript types
  middleware.ts      # Route protection
```

---

## Available Scripts

Run all commands from the `src/` directory.

| Command | Description |
|---|---|
| `pnpm dev` | Start development server on port 3000 |
| `pnpm build` | Build optimized production bundle |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |

---

## Supported Exchanges

| Exchange | Trade History | Balance |
|---|---|---|
| Binance | REST API | REST API |
| OKX | REST API | REST API |
| Bybit | REST API | REST API |
| Bitget | REST API | REST API |
| Gate.io | REST API | REST API |

All exchange API keys must have **read-only** permissions. Withdrawal permissions are not required and should not be granted.
