# Local Development Setup

## Yêu cầu

- Node.js >= 20
- pnpm >= 10
- Tài khoản Supabase

Install pnpm:
```bash
npm install -g pnpm
```
---

## 1. Cài dependencies

```bash
cd src
pnpm install
```

---

## 2. Cấu hình biến môi trường

Tạo file `src/.env.local` với nội dung sau:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>


# AI
OPENROUTER_API_KEY=<your_openrouter_key>
GEMINI_API_KEY=<your_gemini_key>  # không dùng nữa, có thể bỏ

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=<your_google_client_id>
GOOGLE_CLIENT_SECRET=<your_google_client_secret>
```

> **ENCRYPTION_MASTER_KEY**: dùng để mã hóa API key sàn (Binance, OKX...) trước khi lưu vào database. Không được để trống nếu dùng tính năng Exchange Integration.

---

## 3. Chạy local dev

```bash
cd src
pnpm dev
```

Truy cập: http://localhost:3000

---

## 4. Build production

```bash
cd src
pnpm build
pnpm start
```

---

## 5. Kiểm tra AI Chat hoạt động

1. Đăng nhập → vào **AI Assistant**
2. Gửi tin nhắn bất kỳ
3. Nếu thấy phản hồi streaming từng chữ → OpenRouter đang hoạt động

Model mặc định: `openai/gpt-4o-mini` qua OpenRouter.  
Thay đổi model tại: `src/lib/adapters/llmAdapter.ts` → `DEFAULT_MODEL`.

---

## 6. TradingView Chart & Market Ticker

Không cần cài thêm gì. Các component này dùng:

- **TradingView Widget**: load script từ CDN `https://s3.tradingview.com/tv.js` (tự động khi mở Dashboard)
- **Market Ticker**: kết nối WebSocket `wss://stream.binance.com:9443` để lấy giá realtime (BTC, ETH, SOL, BNB)

Cả hai đều là public API, không cần API key.

Vị trí component:
- `src/components/features/dashboard/TradingViewChart.tsx`
- `src/components/features/dashboard/MarketTicker.tsx`

---

## 7. Cấu trúc thư mục chính

```
src/
  app/           # Next.js App Router pages + API routes
  components/    # UI components
  lib/
    adapters/    # LLM, Encryption, Exchange adapters
    services/    # Business logic
    db/          # Supabase client + query helpers
    types/       # TypeScript types
```
