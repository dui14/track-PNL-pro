# API Contract

## Response Envelope

All API responses follow this structure:

```typescript
type ApiResponse<T> = {
  success: boolean
  data: T | null
  error: string | null
  meta?: {
    page?: number
    limit?: number
    total?: number
  }
}
```

## Authentication

All protected endpoints require a valid Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

Return `401` if token is missing or invalid.
Return `403` if user lacks permissions.

---

## Exchange API Endpoints

### POST /api/exchange/connect

Add a new exchange account with API keys.

Request:
```json
{
  "exchange": "binance",
  "apiKey": "<user_api_key>",
  "apiSecret": "<user_api_secret>",
  "label": "My Binance Account"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "exchange": "binance",
    "label": "My Binance Account",
    "is_active": true,
    "created_at": "2026-03-07T00:00:00Z"
  },
  "error": null
}
```

Validation:
- `exchange` must be one of: binance, okx, bybit, bitget, mexc
- `apiKey` and `apiSecret` must be non-empty strings
- Verify API key is valid by calling exchange's test endpoint before saving
- Keys are encrypted before storage; plain text is never persisted

### GET /api/exchange/accounts

List all exchange accounts for the current user.

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "exchange": "binance",
      "label": "My Account",
      "is_active": true,
      "last_synced": "2026-03-07T10:00:00Z"
    }
  ],
  "error": null
}
```

Note: API key values are NEVER returned in this response.

### POST /api/exchange/sync

Trigger trade sync for a specific exchange account.

Request:
```json
{
  "exchangeAccountId": "uuid"
}
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

### DELETE /api/exchange/accounts/:id

Remove an exchange account and all associated data.

Response:
```json
{
  "success": true,
  "data": { "deleted": true },
  "error": null
}
```

---

## PNL API Endpoints

### GET /api/pnl/summary

Get aggregated PNL summary for the authenticated user.

Query params:
- `range`: `day` | `week` | `month` | `year` | `all` (default: `all`)
- `exchangeAccountId`: optional UUID to filter by exchange

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
    "best_trade": 420.00,
    "worst_trade": -85.30,
    "period": "month"
  },
  "error": null
}
```

### GET /api/pnl/chart

Get time-series PNL data for chart rendering.

Query params:
- `range`: `day` | `week` | `month` | `year`
- `exchangeAccountId`: optional UUID

Response:
```json
{
  "success": true,
  "data": [
    { "date": "2026-03-01", "pnl": 120.5, "cumulative_pnl": 980.5 },
    { "date": "2026-03-02", "pnl": -30.0, "cumulative_pnl": 950.5 }
  ],
  "error": null
}
```

### GET /api/pnl/trades

Get paginated trade list.

Query params:
- `page`: number (default: 1)
- `limit`: number (default: 20, max: 100)
- `exchangeAccountId`: optional UUID
- `symbol`: optional string filter

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
      "traded_at": "2026-03-01T08:00:00Z",
      "exchange": "binance"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 124 },
  "error": null
}
```

---

## Demo Trading API Endpoints

### POST /api/demo/order

Place a simulated order.

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

For limit orders, `price` is required.

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "symbol": "BTCUSDT",
    "side": "buy",
    "quantity": 0.01,
    "entry_price": 65000,
    "status": "open",
    "opened_at": "2026-03-07T10:00:00Z"
  },
  "error": null
}
```

### POST /api/demo/order/:id/close

Close an open demo order at current market price.

Request:
```json
{
  "exitPrice": 66000
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "realized_pnl": 10.0,
    "status": "closed",
    "closed_at": "2026-03-07T11:00:00Z"
  },
  "error": null
}
```

### GET /api/demo/orders

Get all demo orders for the user.

Query params:
- `status`: `open` | `closed` | `cancelled` (optional)

---

## AI Chat API Endpoints

### POST /api/ai/chat

Send a message and receive streaming response.

Request:
```json
{
  "conversationId": "uuid or null",
  "message": "What is my win rate this month?"
}
```

Response: `text/event-stream` (SSE)
```
data: {"type":"delta","content":"Your"}
data: {"type":"delta","content":" win rate"}
data: {"type":"done","conversationId":"uuid"}
```

### GET /api/ai/conversations

List all conversations for the user.

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "PNL analysis March",
      "updated_at": "2026-03-07T10:00:00Z"
    }
  ],
  "error": null
}
```

### GET /api/ai/conversations/:id/messages

Get all messages in a conversation.

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What is my win rate?",
      "created_at": "2026-03-07T10:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Your win rate this month is 68.5%.",
      "created_at": "2026-03-07T10:00:05Z"
    }
  ],
  "error": null
}
```

---

## User Profile API Endpoints

### PATCH /api/profile

Update user profile fields.

Request:
```json
{
  "displayName": "John Trader",
  "email": "new@email.com"
}
```

### POST /api/profile/avatar

Upload avatar image. `Content-Type: multipart/form-data`

Field: `avatar` (file, max 2MB, JPEG/PNG/WEBP only)

Response:
```json
{
  "success": true,
  "data": { "avatar_url": "https://...supabase.co/storage/v1/object/public/avatars/uuid.webp" },
  "error": null
}
```

---

## Error Codes

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid request body |
| 401 | UNAUTHORIZED | Missing or invalid token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Resource already exists |
| 429 | RATE_LIMITED | Too many requests |
| 500 | INTERNAL_ERROR | Unexpected server error |
| 502 | EXCHANGE_ERROR | Exchange API call failed |
