# Feature Specification: Demo Trading

## Overview

Môi trường paper trading cho phép người dùng luyện tập giao dịch với virtual balance (10,000 USDT mặc định) mà không rủi ro tài chính thực. Tích hợp TradingView chart, real-time price từ Binance WebSocket, hỗ trợ Market và Limit orders, tracking positions và tính toán simulated PNL.

## Goals

- Cung cấp môi trường giao dịch thực tế nhưng không rủi ro
- Tích hợp TradingView cho candlestick chart chuyên nghiệp
- Real-time price streaming từ Binance WebSocket public feeds
- Hỗ trợ Market và Limit orders với order book simulation
- Theo dõi open positions và calculate PNL theo thời gian thực
- Lưu trữ toàn bộ demo trade history

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-DEMO-001 | Trader | Xem chart TradingView với giá thực | Phân tích kỹ thuật chính xác |
| US-DEMO-002 | Trader | Đặt lệnh market buy/sell | Thực thi ngay tại giá hiện tại |
| US-DEMO-003 | Trader | Đặt lệnh limit buy/sell | Chờ giá đạt đến mức mình muốn |
| US-DEMO-004 | Trader | Xem virtual balance | Biết còn bao nhiêu vốn |
| US-DEMO-005 | Trader | Xem danh sách open positions | Theo dõi giao dịch đang mở |
| US-DEMO-006 | Trader | Đóng position theo giá thị trường | Chốt lời/cắt lỗ |
| US-DEMO-007 | Trader | Xem lịch sử demo trades | Review kết quả luyện tập |
| US-DEMO-008 | Trader | Xem PNL của từng position realtime | Theo dõi lãi lỗ live |
| US-DEMO-009 | Trader | Reset demo balance | Bắt đầu lại với 10,000 USDT |
| US-DEMO-010 | Trader | Chọn trading pair khác nhau | Luyện tập với nhiều coin |

## Functional Requirements

### FR-DEMO-001: TradingView Chart Integration

- Embed TradingView Lightweight Charts widget (free, không cần API key)
- Hỗ trợ cặp giao dịch: `BTCUSDT`, `ETHUSDT`, `BNBUSDT`, `SOLUSDT` và các pair phổ biến
- Chart hiển thị: candlestick, volume, timeframes (1m, 5m, 15m, 1h, 4h, 1d)
- Pair selector dropdown để chuyển đổi cặp giao dịch
- Chart tự động cập nhật khi switch pair

### FR-DEMO-002: Real-time Price via Binance WebSocket

- Connect đến `wss://stream.binance.com:9443/ws/{symbol}@ticker`
- Subscribe khi user chọn pair, unsubscribe khi đổi pair hoặc rời trang
- Dữ liệu nhận được: current price, 24h high, 24h low, 24h change%
- Reconnect tự động nếu bị ngắt kết nối (max 5 lần, exponential backoff)
- Connection state: `connected` | `connecting` | `disconnected`
- Hiển thị live price trong order panel và position list

### FR-DEMO-003: Market Order Execution

Logic thực thi:
1. Validate: quantity > 0, user có đủ balance
2. Lấy current price từ WebSocket stream
3. Tính cost = quantity × current_price
4. Kiểm tra: `demo_balance >= cost` (cho buy orders)
5. Trừ cost khỏi `demo_balance`
6. Tạo `demo_trades` record với `status = 'open'`, `entry_price = current_price`
7. Return order confirmation

**Buy Market:** Fill ngay tại current price
**Sell Market:** Nếu không có open long position → lỗi "No position to close". Nếu có → close position và tính PNL

### FR-DEMO-004: Limit Order Execution

Logic thực thi:
1. Validate: quantity > 0, price > 0, user có đủ balance
2. Tạo `demo_trades` record với `status = 'pending'`, `entry_price = limit_price`
3. Reserve balance: trừ cost khỏi available balance (không xóa `demo_balance`)
4. Background job check mỗi 5 giây: nếu `current_price <= limit_price` (for buy), fill order
5. Khi fill: update `status = 'open'`, cập nhật `entry_price = fill_price`
6. Nếu cancel: release reserved balance

**Simplified Limit Order Model:**
- Không implement đầy đủ order book
- Limit buy: fill khi `current_price <= limit_price`
- Limit sell (close existing position): fill khi `current_price >= limit_price`

### FR-DEMO-005: Position Tracking

Mỗi open `demo_trades` record = 1 position

**Real-time Unrealized PNL:**
- `unrealized_pnl = (current_price - entry_price) × quantity`
- Cập nhật mỗi khi nhận price update từ WebSocket

**Position Information hiển thị:**
- Symbol, Side, Quantity, Entry Price, Current Price, Unrealized PNL (%), Duration

### FR-DEMO-006: Close Position

1. User click "Close Position" trên 1 open trade
2. Lấy current price từ WebSocket
3. Tính `realized_pnl = (exit_price - entry_price) × quantity`
4. Cập nhật `demo_trades`: `exit_price`, `realized_pnl`, `status = 'closed'`, `closed_at`
5. Cộng `realized_pnl` vào `demo_balance`
6. Cộng lại quantity × exit_price vào available balance

### FR-DEMO-007: Demo Balance Management

- Initial balance: 10,000 USDT (từ `users.demo_balance`)
- Balance thay đổi khi: open position (trừ), close position (cộng PNL + return capital)
- Reset balance: set `demo_balance = 10000`, xóa tất cả open positions
- Hiển thị: Available Balance, Total Portfolio Value (balance + unrealized PNL)

### FR-DEMO-008: Trade History

- Paginated list tất cả demo trades (open + closed + cancelled)
- Columns: Symbol, Side, Type, Entry, Exit, PNL, Status, Date
- Filter theo status: All / Open / Closed
- Summary footer: Total Realized PNL, Win Rate

## Non-Functional Requirements

- WebSocket price update: latency < 500ms từ Binance stream đến UI
- Order execution: process < 300ms
- Limit order check interval: 5 giây
- Demo balance cập nhật ngay lập tức sau order
- Chart data: TradingView tự xử lý (không cần backend serve candles)
- Tối đa 50 pending limit orders per user
- Mobile responsive: order panel stack dưới chart trên mobile

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| WebSocket bị ngắt khi đang có open positions | Hiển thị "Price unavailable", vẫn show positions |
| Giá thay đổi mạnh trước khi market order fill | Sử dụng price tại thời điểm server nhận request |
| Balance không đủ cho order | Hiển thị lỗi "Insufficient balance" |
| User cancel limit order đang pending | Release reserved balance |
| Nhiều limit orders cùng lúc | Process theo FIFO |
| Price slippage simulation | Market orders fill tại giá hiện tại, không simulation slippage (MVP) |
| User reset khi có open positions | Đóng tất cả positions với PNL = 0 và reset balance |
| Symbol không có giá (ít giao dịch) | Disable order button, hiển thị "Price unavailable" |
| Số lượng order quá nhỏ (dust) | Validate: minimum order value = $1.00 |
| Connection timeout | Show reconnect button, preserve pending orders |

## Data Models

### users (liên quan)
```sql
-- demo_balance field
demo_balance NUMERIC(18,8) NOT NULL DEFAULT 10000
```

### demo_trades
```sql
CREATE TABLE demo_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  quantity        NUMERIC(28,10) NOT NULL,
  entry_price     NUMERIC(28,10) NOT NULL,
  limit_price     NUMERIC(28,10),
  exit_price      NUMERIC(28,10),
  realized_pnl    NUMERIC(28,10),
  unrealized_pnl  NUMERIC(28,10),
  status          TEXT NOT NULL CHECK (status IN ('pending','open','closed','cancelled')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**status transitions:**
```
market order: → open → closed
limit order:  → pending → open → closed
                        → cancelled
```

### Balance Reservation (in-memory hoặc database)

Để track reserved balance cho pending limit orders:
```sql
ALTER TABLE demo_trades ADD COLUMN reserved_amount NUMERIC(28,10) DEFAULT 0;
```

## API Endpoints

### GET /api/demo/balance

Lấy demo balance và portfolio summary.

Response:
```json
{
  "success": true,
  "data": {
    "available_balance": 8500.00,
    "reserved_balance": 1000.00,
    "total_balance": 9500.00,
    "unrealized_pnl": 125.50,
    "total_portfolio_value": 9625.50
  },
  "error": null
}
```

### POST /api/demo/order

Đặt demo order (market hoặc limit).

Request:
```json
{
  "symbol": "BTCUSDT",
  "side": "buy",
  "orderType": "market",
  "quantity": 0.01,
  "price": null
}
```

Validation:
- `symbol`: string, uppercase, must exist in supported pairs
- `side`: "buy" | "sell"
- `orderType`: "market" | "limit"
- `quantity`: > 0, max 8 decimal places
- `price`: required và > 0 nếu `orderType = "limit"`
- `currentPrice × quantity` >= $1.00 (minimum order value)

Response (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "symbol": "BTCUSDT",
    "side": "buy",
    "order_type": "market",
    "quantity": 0.01,
    "entry_price": 65000.00,
    "status": "open",
    "opened_at": "2026-03-07T10:00:00Z",
    "remaining_balance": 8350.00
  },
  "error": null
}
```

### POST /api/demo/order/:id/close

Đóng open position theo market price.

Request:
```json
{ "exitPrice": 66000.00 }
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "exit_price": 66000.00,
    "realized_pnl": 10.00,
    "status": "closed",
    "closed_at": "2026-03-07T11:00:00Z",
    "new_balance": 8360.00
  },
  "error": null
}
```

### DELETE /api/demo/order/:id

Cancel pending limit order.

Response:
```json
{
  "success": true,
  "data": { "cancelled": true, "released_balance": 1000.00 },
  "error": null
}
```

### GET /api/demo/orders

Danh sách demo orders.

Query params:
- `status`: `pending` | `open` | `closed` | `cancelled` | `all`
- `page`: number (default: 1)
- `limit`: number (default: 20)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "symbol": "BTCUSDT",
      "side": "buy",
      "order_type": "market",
      "quantity": 0.01,
      "entry_price": 65000.00,
      "exit_price": null,
      "realized_pnl": null,
      "status": "open",
      "opened_at": "2026-03-07T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5 },
  "error": null
}
```

### POST /api/demo/reset

Reset demo account về trạng thái ban đầu.

Request body: rỗng

Response:
```json
{
  "success": true,
  "data": {
    "new_balance": 10000.00,
    "closed_positions": 3,
    "cancelled_orders": 1
  },
  "error": null
}
```

### GET /api/demo/summary

Tóm tắt performance demo trading.

Response:
```json
{
  "success": true,
  "data": {
    "total_trades": 25,
    "win_count": 15,
    "loss_count": 10,
    "win_rate": 60.0,
    "total_realized_pnl": 350.00,
    "best_trade": 125.00,
    "worst_trade": -45.00
  },
  "error": null
}
```

## WebSocket Architecture

### Client-side WebSocket Manager

```typescript
class BinancePriceStream {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 5

  connect(symbol: string, onPrice: (price: number) => void): void
  disconnect(): void
  private reconnect(): void
  private handleMessage(event: MessageEvent): void
}
```

WebSocket URL: `wss://stream.binance.com:9443/ws/{symbol.toLowerCase()}@ticker`

Message format từ Binance:
```json
{
  "e": "24hrTicker",
  "c": "65000.00",
  "h": "66000.00",
  "l": "64000.00",
  "P": "1.54"
}
```

## UI Components

### Pages
- `/demo` — `DemoTradingPage`

### Layout
- `DemoTradingLayout` — Split: chart (trái, 60%) + order panel (phải, 40%)

### Chart
- `TradingViewChartWidget` — TradingView embed wrapper
- `PairSelector` — Dropdown chọn trading pair
- `PriceDisplay` — Live price display với 24h stats

### Order Panel
- `OrderPanel` — Container chính cho order form
- `OrderTypeToggle` — Market / Limit toggle button
- `OrderForm` — Form với React Hook Form, Zod validation
  - Buy/Sell toggle
  - Quantity input với USD calculator
  - Price input (chỉ hiện khi limit)
  - Available balance display
  - Submit button
- `BalanceSummaryBar` — Hiển thị available + unrealized

### Positions
- `OpenPositionsTable` — Danh sách open positions với live PNL
- `PositionRow` — Row với unrealized PNL cập nhật real-time
- `ClosePositionButton` — Button với confirmation

### Pending Orders
- `PendingOrdersTable` — Danh sách limit orders đang chờ
- `CancelOrderButton` — Hủy pending order

### History
- `DemoTradeHistory` — Tabbed: Open / History
- `DemoSummaryCard` — Win rate, total PNL summary

## Sequence Flow

### Market Buy Order

```
User          OrderForm        API Route         PNL Engine       Database
 |                |                |                  |               |
 |-- Submit buy ->|                |                  |               |
 |                |-- POST /api/demo/order -->         |               |
 |                |               |-- Validate input  |               |
 |                |               |-- Get currentPrice from WS cache  |
 |                |               |-- Check balance -->               |
 |                |               |   demo_balance >= cost            |
 |                |               |-- UPDATE demo_balance (decrement)->|
 |                |               |-- INSERT demo_trades ------------->|
 |                |<-- 201 response|                  |               |
 |<-- Order confirmation          |                  |               |
 |<-- Balance updated             |                  |               |
```

### Limit Order Fill Check (Background)

```
Cron (5s)       LimitOrderService    PriceCache       Database
 |                   |                   |               |
 |-- tick ---------->|                   |               |
 |                   |-- Get pending orders ------------>|
 |                   |<-- pending list ------------------|
 |                   |-- For each order:  |               |
 |                   |-- getCurrentPrice->|               |
 |                   |<-- price ----------|               |
 |                   |-- Check fill condition             |
 |                   |-- (currentPrice <= limitPrice)     |
 |                   |-- UPDATE status='open' ----------->|
 |                   |-- Notify user (optional)           |
```

### Close Position

```
User          CloseButton        API Route        Database
 |                |                  |               |
 |-- Click close->|                  |               |
 |                |-- POST /api/demo/order/:id/close->|
 |                |                 |-- Validate ownership            |
 |                |                 |-- Calculate realized_pnl         |
 |                |                 |-- UPDATE demo_trades ----------->|
 |                |                 |-- UPDATE users.demo_balance ----->|
 |                |<-- 200 response -|               |               |
 |<-- Position closed confirmation  |               |               |
```

## Security Considerations

- **User Isolation**: RLS đảm bảo user chỉ xem và thao tác demo_trades của mình
- **Balance Validation**: Validate `demo_balance >= cost` trên server, không client
- **Price Source**: Current price từ server-side cache (price nhận được từ Binance WS qua Edge Function), không tin vào client-provided price
- **Order Ownership**: Validate `user_id` sở hữu order trước khi close/cancel
- **Rate Limiting**: Max 10 orders per phút per user để tránh spam
- **Input Validation**: Zod validate tất cả order fields
- **No Financial Risk**: Demo system hoàn toàn isolated khỏi real exchange
- **WebSocket Security**: Chỉ dùng Binance public streams (không cần auth), không expose API keys
- **CORS**: WebSocket connection chỉ từ app domain
