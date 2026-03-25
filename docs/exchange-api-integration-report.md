# Exchange API Integration va PNL Tracking Report

## 1. Feature Overview

Da trien khai chuc nang ket noi san giao dich va dong bo PNL voi cac diem chinh:

- Ho tro ket noi Binance, OKX, Bybit, Bitget bang API key va secret
- Ho tro passphrase bat buoc voi OKX va Bitget
- Validate credentials truoc khi luu vao database
- Chan API key co quyen withdraw
- Ma hoa credentials bang AES-256-GCM truoc khi ghi vao bang api_keys
- Sync trade history ve bang trades voi bo sung funding_fee va income_type
- Bo sung endpoint lay balance va endpoint lay open positions
- Cap nhat Binance futures sync uu tien endpoint PnL-ready `/fapi/v1/income`
- Chinh phan trang futures fallback `/fapi/v1/userTrades` theo cua so toi da 7 ngay
- Cap nhat UI debug HTML cho Binance va bo sung UI debug OKX co che do proxy khi test browser local

## 2. Architecture Impact

### Presentation Layer

- Cap nhat wizard ket noi exchange de hien thi Passphrase input theo exchange
- Flow connect/edit da gui passphrase dung payload
- Bo sung mapping loi moi cho UI:
  - PASSPHRASE_REQUIRED
  - WITHDRAW_PERMISSION_DETECTED

### Application Layer

- Cap nhat API route connect de nhan passphrase
- Cap nhat API route update credentials de nhan passphrase
- Them API route moi:
  - GET /api/exchange/balance/:id
  - GET /api/exchange/positions/:id

### Domain Layer

- Cap nhat exchangeService:
  - validateCredentials theo credential object
  - hasWithdrawPermission truoc khi luu key
  - decrypt credentials gom key, secret, passphrase
  - fetchExchangeBalance
  - fetchExchangePositions
  - update sync_status trong vong doi sync

### Infrastructure Layer

- Refactor ExchangeAdapter interface theo credential object
- Cap nhat adapters:
  - binanceAdapter.ts
  - okxAdapter.ts
  - bybitAdapter.ts
  - bitgetAdapter.ts
  - mexcAdapter.ts
- Doi ten va mo rong methods adapter:
  - validateCredentials
  - hasWithdrawPermission
  - fetchTrades
  - fetchOpenPositions
  - fetchBalances
- Binance adapter da doi chien luoc futures:
  - Uu tien normalize tu income records (REALIZED_PNL, FUNDING_FEE, COMMISSION)
  - Fallback sang userTrades khi income rong
  - Gioi han window userTrades theo 7 ngay de tranh loi tham so
- Cap nhat exchangeDb de luu passphrase_encrypted va passphrase_iv
- Cap nhat tradesDb de upsert funding_fee va income_type

## 3. API Endpoints

### Cap nhat

- POST /api/exchange/connect
  - Them passphrase trong payload
  - Tra loi cac loi PASSPHRASE_REQUIRED, WITHDRAW_PERMISSION_DETECTED

- PUT /api/exchange/accounts/:id
  - Them passphrase trong payload
  - Tra loi cac loi PASSPHRASE_REQUIRED, WITHDRAW_PERMISSION_DETECTED

- POST /api/exchange/sync
  - Mo rong mapping loi API_KEY_NOT_FOUND, DECRYPTION_FAILED

### Moi

- GET /api/exchange/balance/:id
  - Tra ve tong gia tri usd va danh sach assets

- GET /api/exchange/positions/:id
  - Tra ve tong unrealized pnl va danh sach open positions

## 4. Validation Summary

Da chay cac buoc debug va validation sau:

1. Type check
- Lenh: pnpm exec tsc --noEmit
- Ket qua: pass, khong co loi TypeScript

2. Lint
- Lenh: pnpm lint
- Ket qua: khong phat sinh warning moi trong cac file exchange vua sua
- Con warning cu o cac module khac cua du an (khong nam trong pham vi feature nay)

3. API smoke test (runtime)
- Chay local server: pnpm dev
- Kiem tra endpoint exchange trong trang thai chua dang nhap
- Ket qua:
  - GET /api/exchange/accounts -> 307 redirect ve /login
  - GET /api/exchange/balance/:id -> 307 redirect ve /login
  - GET /api/exchange/positions/:id -> 307 redirect ve /login
  - POST /api/exchange/connect -> 307 redirect ve /login

Ket luan: middleware auth va route guard hoat dong dung o runtime cho cac endpoint exchange.

## 5. Files Touched

- src/lib/types/index.ts
- src/lib/validators/exchange.ts
- src/lib/adapters/exchangeFactory.ts
- src/lib/adapters/binanceAdapter.ts
- src/lib/adapters/okxAdapter.ts
- src/lib/adapters/bybitAdapter.ts
- src/lib/adapters/bitgetAdapter.ts
- src/lib/adapters/mexcAdapter.ts
- src/lib/db/exchangeDb.ts
- src/lib/db/tradesDb.ts
- src/lib/services/exchangeService.ts
- src/app/api/exchange/connect/route.ts
- src/app/api/exchange/accounts/[id]/route.ts
- src/app/api/exchange/sync/route.ts
- src/app/api/exchange/balance/[id]/route.ts
- src/app/api/exchange/positions/[id]/route.ts
- src/components/features/exchange/ExchangeIntegrationWizard.tsx
- spec/ui/test/binance-api-key-debug.html
- spec/ui/test/okx-api-key-debug.html
- docs/binance-api-key-debug-test.md
- api/exchange-integration.md
