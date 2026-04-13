# Track PNL Pro Documentation

Nền tảng web thống nhất cho phép trader crypto theo dõi PNL trên nhiều sàn giao dịch tập trung, mô phỏng giao dịch không rủi ro và tư vấn chiến lược với AI assistant.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tính năng chính](#tính-năng-chính)
- [Tech Stack](#tech-stack)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Biến môi trường](#biến-môi-trường)
- [Scripts](#scripts)
- [Sàn giao dịch hỗ trợ](#sàn-giao-dịch-hỗ-trợ)
- [Core Features](#core-features)
- [Documentation](#documentation)

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

## Documentation
- Architecture: `docs/ARCHITECTURE.md`
- Project Tree: `docs/PROJECT-TREE.md`
- Report Outline: `docs/REPORT-OUTLINE.md`
- Database schema: `database/schema.sql`
- Mermaid diagrams: `diagram/`