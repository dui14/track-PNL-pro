# Feature Specification: API Key Security System

## Overview

Hệ thống bảo mật toàn diện cho việc quản lý Exchange API Keys. Mã hóa AES-256-GCM tất cả credentials trước khi lưu trữ, phát hiện và block các keys có quyền withdraw nguy hiểm, thực thi rate limiting, và đảm bảo API keys không bao giờ lộ ra khỏi server-side execution context.

## Goals

- Mã hóa 100% API keys trước khi lưu vào database
- Phát hiện và từ chối API keys có withdraw permission
- Chỉ decrypt API keys trong trusted server environment (Edge Functions)
- Implement rate limiting toàn diện trên exchange API calls
- Cung cấp key rotation strategy
- Audit logging cho tất cả key operations

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-SEC-001 | Trader | Biết API key của mình được mã hóa | Tin tưởng vào bảo mật |
| US-SEC-002 | Trader | Hệ thống từ chối key có quyền withdraw | Không lo lắng về rủi ro |
| US-SEC-003 | Trader | exchange API được gọi từ server | Key không bị expose trên client |
| US-SEC-004 | Admin | Rotate encryption keys | Đảm bảo long-term security |
| US-SEC-005 | System | Rate limit exchange calls | Không bị sàn ban IP |

## Functional Requirements

### FR-SEC-001: AES-256-GCM Encryption

**Encryption Flow:**
```
plaintext_api_key
    ↓
Derive encryption key: HKDF(ENCRYPTION_MASTER_KEY, salt=user_id, info="api-key")
    ↓
Generate random IV: crypto.getRandomValues(12 bytes)
    ↓
AES-256-GCM encrypt(plaintext, derived_key, iv)
    ↓
Store: { key_encrypted: base64(ciphertext + authTag), key_iv: base64(iv) }
```

**Key Derivation:**
- Master key từ envvar `ENCRYPTION_MASTER_KEY` (256-bit hex)
- Per-user derived key sử dụng HKDF với `user_id` làm salt
- Ensures: compromise của một user's key không expose others

**Decryption Flow:**
```
key_encrypted (base64) + key_iv (base64)
    ↓
Re-derive same encryption key (same HKDF)
    ↓
AES-256-GCM decrypt
    ↓
plaintext_api_key (chỉ tồn tại in-memory, không log, không persist)
```

**Implementation:**
```typescript
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12
const TAG_LENGTH = 128

async function encryptApiKey(
  plaintext: string,
  userId: string,
  masterKey: string
): Promise<{ encrypted: string; iv: string }> {
  const derivedKey = await deriveKey(masterKey, userId)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    derivedKey,
    encoded
  )
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv))
  }
}
```

### FR-SEC-002: Withdraw Permission Detection

**Validation trước khi lưu API key:**

| Exchange | Endpoint để test | Withdraw permission indicator |
|---|---|---|
| Binance | `GET /api/v3/account` | `permissions` array contains "SPOT" without warning |
| Binance | `POST /sapi/v1/capital/withdraw/apply` (dry run) | Nếu không error → có withdraw |
| OKX | `GET /api/v5/account/config` | `acctLv`, check privilege flags |
| Bybit | `GET /v5/user/query-api` | `queryInverseOrderBook` vs `withdraw` permissions |
| Bitget | `GET /api/v2/user/virtual-subaccount` | Check permission list |
| MEXC | `GET /api/v3/account` | Check `permissions` |

**Safeguard Logic:**
```typescript
async function validateApiPermissions(
  exchange: ExchangeName,
  apiKey: string,
  apiSecret: string
): Promise<PermissionValidationResult> {
  const adapter = getExchangeAdapter(exchange)
  const hasWithdraw = await adapter.hasWithdrawPermission(apiKey, apiSecret)
  
  if (hasWithdraw) {
    return {
      valid: false,
      error: 'WITHDRAW_PERMISSION_DETECTED',
      message: 'API key has withdrawal permission. Please create a read-only API key.'
    }
  }
  
  const isValid = await adapter.validateCredentials(apiKey, apiSecret)
  if (!isValid) {
    return {
      valid: false,
      error: 'INVALID_CREDENTIALS',
      message: 'API key validation failed. Check your key and secret.'
    }
  }
  
  return { valid: true, error: null, message: null }
}
```

**Hướng dẫn để user tạo read-only keys:**
- Mỗi exchange có link documentation đến trang tạo read-only API key
- UI hiển thị checklist: "Ensure these are UNCHECKED: Withdraw, Transfer, Trading"

### FR-SEC-003: Server-Only Decryption

**Architecture Enforcement:**
- API keys chỉ được decrypt trong Supabase Edge Functions (Deno runtime)
- Next.js API Routes KHÔNG có quyền đọc `api_keys` table
- Edge Functions có `SUPABASE_SERVICE_ROLE_KEY` và `ENCRYPTION_MASTER_KEY`
- Client-side JavaScript không bao giờ nhận được decrypted keys

**RLS Policy cho api_keys:**
```sql
-- api_keys table: NO select policy cho authenticated users
-- Chỉ service_role có thể đọc
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Authenticated user KHÔNG thể đọc api_keys trực tiếp
CREATE POLICY "service_only" ON api_keys
  FOR ALL USING (false);

-- Edge Functions dùng service_role key, bypass RLS
```

**Exchange API Call Flow:**
```
Client → Next.js API Route → Supabase Edge Function → Exchange API
                                    ↑
                              Decrypt keys here
                              (service_role + master key)
```

### FR-SEC-004: Rate Limiting

**Per-User Rate Limits:**

| Action | Limit | Window | Storage |
|---|---|---|---|
| Exchange API validate | 3/min | per user | Redis/KV |
| Manual sync trigger | 1/5min | per account | Database |
| Balance fetch | 1/30s | per account | Cache |
| Auto sync | 1/4h | per account | Database |

**Per-Exchange Rate Limits:**

| Exchange | Global Limit | Our Limit (conservative) |
|---|---|---|
| Binance | 1200 weight/min | 600 weight/min |
| OKX | 20 req/2s | 10 req/2s |
| Bybit | 120 req/s | 60 req/s |
| Bitget | 20 req/s | 10 req/s |
| MEXC | 500 req/s | 250 req/s |

**Rate Limiter Implementation:**
```typescript
class RateLimiter {
  private windows: Map<string, { count: number; resetAt: number }> = new Map()

  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now()
    const window = this.windows.get(key)
    
    if (!window || now > window.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs })
      return true
    }
    
    if (window.count >= limit) return false
    window.count++
    return true
  }
}
```

**Exponential Backoff on 429:**
```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (isRateLimitError(error) && attempt < maxAttempts - 1) {
        const delay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, 60000)
        await sleep(delay)
      } else {
        throw error
      }
    }
  }
  throw new Error('Max retry attempts exceeded')
}
```

### FR-SEC-005: Key Rotation

**Key Version Strategy:**
- Mỗi `api_keys` record có `key_version` (INT, default 1)
- Khi rotation: encrypt lại với new master key, increment version
- Rotation triggers: manual (admin), scheduled (annually), breach response

**Rotation Process:**
```
1. Fetch all api_keys records (batch, 100 at a time)
2. Decrypt với current key_version master key
3. Re-encrypt với new master key
4. Update record với new encrypted value + new key_version
5. Update ENCRYPTION_MASTER_KEY env var
6. Verify: decrypt random sample với new version
```

**Zero-downtime rotation:**
- Dual master key support: old version still valid during rotation window
- Rotation flag in env: `ENCRYPTION_KEY_ROLLOVER=true`

### FR-SEC-006: Audit Logging

```sql
CREATE TABLE security_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  resource     TEXT,
  resource_id  UUID,
  ip_address   TEXT,
  user_agent   TEXT,
  success      BOOLEAN NOT NULL,
  error_code   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Events được log:**
- `exchange.connect` — User kết nối exchange
- `exchange.validate_key` — Validate API key (success/fail)
- `exchange.withdraw_detected` — Phát hiện withdraw permission
- `exchange.sync` — Trade sync triggered
- `exchange.disconnect` — User ngắt kết nối
- `key.encrypt` — API key được mã hóa và lưu
- `key.access` — Key được giải mã để dùng (Edge Function)
- `key.rotate` — Key rotation performed

**Không log:**
- Giá trị API keys (dù encrypted hay plain)
- Raw secrets hoặc passwords

## Non-Functional Requirements

- Encryption/Decryption < 10ms per key
- Withdraw permission check < 5 giây (exchange API response)
- Rate limit check < 1ms (in-memory)
- Audit log writes async (không block main flow)
- Master encryption key min 256-bit entropy
- Key rotation maximum downtime: 0 (rolling update)
- All API calls over TLS 1.2+

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Master key bị mất | Cannot decrypt any keys — disaster recovery via backup procedure |
| AES-GCM authentication tag failure | Throw error, do NOT return garbled data |
| Exchange returns 401 during sync | Mark account error, alert user |
| IV collision (extremely rare) | AES-GCM padding ensures uniqueness; random IV makes collision negligible |
| Multiple concurrent sync for same account | Lock mechanism, second request waits or skips |
| Exchange API key format validation fails | Reject before even attempting to encrypt |

## Data Models

### api_keys (final schema)
```sql
CREATE TABLE api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  key_encrypted       TEXT NOT NULL,
  secret_encrypted    TEXT NOT NULL,
  key_iv              TEXT NOT NULL,
  secret_iv           TEXT NOT NULL,
  key_version         INT NOT NULL DEFAULT 1,
  key_auth_tag        TEXT,
  secret_auth_tag     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Note: `key_auth_tag` và `secret_auth_tag` lưu GCM authentication tags riêng nếu cần.

### security_audit_log
```sql
CREATE TABLE security_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  resource     TEXT,
  resource_id  UUID,
  ip_address   INET,
  user_agent   TEXT,
  success      BOOLEAN NOT NULL,
  error_code   TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON security_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON security_audit_log(action, created_at DESC);
```

## API Endpoints

### POST /api/security/validate-key

Validate một API key pair trước khi lưu (có thể dùng trước khi submit form connect).

Request:
```json
{
  "exchange": "binance",
  "apiKey": "xxxxx",
  "apiSecret": "yyyyy"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "valid": true,
    "has_withdraw_permission": false,
    "permissions": ["SPOT_READ", "FUTURES_READ"],
    "exchange": "binance"
  },
  "error": null
}
```

Error (withdraw detected):
```json
{
  "success": false,
  "data": {
    "valid": false,
    "has_withdraw_permission": true,
    "error": "WITHDRAW_PERMISSION_DETECTED"
  },
  "error": "WITHDRAW_PERMISSION_DETECTED"
}
```

### GET /api/security/audit-log

Admin endpoint - xem audit log.

Query params:
- `userId`: UUID (filter by user)
- `action`: string (filter by action)
- `from`: ISO date
- `to`: ISO date
- `page`, `limit`

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "action": "exchange.connect",
      "resource": "exchange_accounts",
      "success": true,
      "created_at": "2026-03-07T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 100 },
  "error": null
}
```

## UI Components

### Permission Warning UI
- `WithdrawPermissionAlert` — Alert đỏ hiển thị khi phát hiện withdraw permission
- `ReadOnlyKeyGuide` — Component hiển thị hướng dẫn tạo read-only key per exchange
- `PermissionCheckResult` — Inline validation result khi user nhập API key

### Security Info UI
- `SecurityBadge` — Badge "Read-only Protected" gắn với mỗi exchange connection
- `EncryptionInfoTooltip` — Tooltip giải thích cách keys được bảo vệ

## Sequence Flow

### API Key Validation and Storage

```
ConnectModal     API Route           PermCheck Service    ExchangeAdapter    Database
 |                   |                    |                    |               |
 |-- Submit key ----->|                   |                    |               |
 |                   |-- Zod validate     |                    |               |
 |                   |-- validateKey() -->|                    |               |
 |                   |                   |-- validateCreds() ->|               |
 |                   |                   |                    |-- Test endpoint|
 |                   |                   |                    |<-- 200 OK -----|
 |                   |                   |-- hasWithdraw() -->|               |
 |                   |                   |                    |-- Permission check
 |                   |                   |                    |<-- false ------|
 |                   |-- Encrypt keys     |                    |               |
 |                   |   AES-256-GCM     |                    |               |
 |                   |-- INSERT api_keys->|                    |               |
 |                   |-- Audit log: key.encrypt               |               |
 |<-- 201 Created ----|                   |                    |               |
```

### Edge Function Key Decryption

```
Edge Function       Supabase DB        Encryption Layer     Exchange API
 |                      |                   |                   |
 |-- Auth: service_role |                   |                   |
 |-- SELECT api_keys -->|                   |                   |
 |<-- encrypted data ----|                  |                   |
 |-- decryptApiKey() -->|                   |                   |
 |   (ENCRYPTION_MASTER_KEY from env)       |                   |
 |                      |<-- plaintext key (in-memory only)     |
 |-- Exchange API call with plaintext key ->|                   |
 |<-- trade data --------------------------------|               |
 |-- [plaintext key GC'd immediately]           |               |
 |-- Audit log: key.access                      |               |
```

## Security Considerations

- **Defense in Depth**: Mã hóa ở tầng application (không phải chỉ database encryption)
- **Key Derivation**: Per-user derived keys đảm bảo breach isolation
- **No Key in Logs**: Tất cả logging code được review để không leak key values
- **Timing Attack Prevention**: Key comparison sử dụng constant-time comparison
- **Environment Secret Management**: Master key trong Vercel/Supabase secrets, không trong `.env` files
- **Service Role Restriction**: `SUPABASE_SERVICE_ROLE_KEY` chỉ tồn tại trong Edge Functions
- **No Client Access**: `api_keys` table RLS block toàn bộ client access
- **Audit Trail**: Mọi key access tạo audit log không thể xóa (append-only)
- **Rotation Ready**: Key version field hỗ trợ zero-downtime rotation
- **Transport Security**: TLS 1.2+ bắt buộc cho tất cả exchange API calls
- **Input Sanitization**: API key format validated trước khi encrypt
- **Memory Safety**: Plaintext keys không được cache, sử dụng xong là dispose
