# Internal API Design

## Design Principles

1. All endpoints are JSON REST APIs
2. Every response uses the `ApiResponse<T>` envelope
3. Authentication is JWT-based via Supabase
4. All inputs validated with Zod schemas
5. Errors are typed and consistent across all endpoints
6. Pagination follows cursor-based pattern for large datasets

## Base URL Structure

```
/api/
  exchange/
    connect          POST   Add exchange account
    accounts         GET    List user's accounts
    sync             POST   Trigger trade sync
    accounts/:id     DELETE Remove account
  pnl/
    summary          GET    Aggregated PNL stats
    chart            GET    Time-series PNL for charts
    trades           GET    Paginated trade list
  demo/
    order            POST   Place demo order
    order/:id/close  POST   Close demo order
    orders           GET    List demo orders
  ai/
    chat             POST   Send message (SSE stream)
    conversations    GET    List conversations
    conversations/:id/messages  GET  Get messages
  profile/
                     PATCH  Update profile
    avatar           POST   Upload avatar
```

## Middleware Stack

Every request passes through:

```
1. TLS termination (Vercel edge)
2. CORS headers
3. Rate limiter (IP-based, 100 req/min general)
4. JWT verification (Supabase)
5. Request body parsing
6. Route handler
```

## Supabase Client Pattern

### Server-side client (API routes, Server Actions)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        }
      }
    }
  )
}
```

### Service role client (Edge Functions, background jobs)

```typescript
import { createClient } from '@supabase/supabase-js'

export function createSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

Service role bypasses RLS. Use only in trusted server contexts (Edge Functions, server-side cron).

## Request Validation Pattern

```typescript
import { z } from 'zod'

const ConnectExchangeSchema = z.object({
  exchange: z.enum(['binance', 'okx', 'bybit', 'bitget', 'mexc']),
  apiKey: z.string().min(10).max(200),
  apiSecret: z.string().min(10).max(200),
  label: z.string().max(50).optional()
})

type ConnectExchangeRequest = z.infer<typeof ConnectExchangeSchema>
```

Schemas are defined in `src/lib/validators/` and imported by both route handlers and tests.

## Pagination Pattern

For list endpoints, use offset pagination with consistent params:

```
GET /api/pnl/trades?page=2&limit=20
```

Response meta:
```json
{
  "meta": {
    "page": 2,
    "limit": 20,
    "total": 124
  }
}
```

For very large datasets (e.g., all trades), cursor-based pagination is preferred:

```
GET /api/pnl/trades?cursor=<last_trade_id>&limit=50
```

## Rate Limiting

Per-user rate limits enforced at the route level:

| Endpoint group | Limit |
|---|---|
| Exchange sync | 1 sync per exchange per 5 minutes |
| AI chat | 20 messages per user per hour |
| General API | 100 requests per minute per user |
| Profile updates | 10 per hour |

Rate limit exceeded returns:
```json
{
  "success": false,
  "data": null,
  "error": "RATE_LIMITED"
}
```
HTTP 429 with `Retry-After` header in seconds.

## Streaming API (AI Chat)

The AI chat endpoint uses Server-Sent Events (SSE):

```typescript
export async function POST(req: NextRequest): Promise<Response> {
  // auth + validation...

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      for await (const chunk of llmStream) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: chunk })}\n\n`)
        )
      }

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'done', conversationId })}\n\n`)
      )
      controller.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

## API Key Encryption/Decryption

API keys are encrypted using AES-256-GCM before storage.

### Encryption

```typescript
import { createCipheriv, randomBytes } from 'crypto'

function encryptApiKey(plaintext: string, masterKey: string): { encrypted: string; iv: string } {
  const iv = randomBytes(12)
  const key = Buffer.from(masterKey, 'hex')
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64')
  }
}
```

### Decryption

```typescript
import { createDecipheriv } from 'crypto'

function decryptApiKey(encrypted: string, iv: string, masterKey: string): string {
  const key = Buffer.from(masterKey, 'hex')
  const ivBuffer = Buffer.from(iv, 'base64')
  const encryptedBuffer = Buffer.from(encrypted, 'base64')

  const authTag = encryptedBuffer.slice(-16)
  const ciphertext = encryptedBuffer.slice(0, -16)

  const decipher = createDecipheriv('aes-256-gcm', key, ivBuffer)
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext) + decipher.final('utf8')
}
```

`ENCRYPTION_MASTER_KEY` is a 32-byte hex string stored only in server environment variables.

## Data Ingestion Pipeline

```
Trigger: User clicks "Sync" or scheduled cron
  |
  v
POST /api/exchange/sync { exchangeAccountId }
  |
  v
1. Validate auth + ownership
2. Fetch encrypted keys from api_keys table (service role)
3. Decrypt keys server-side
4. Call ExchangeAdapter.fetchTrades()
5. Normalize trades to NormalizedTrade[]
6. Upsert into trades table
7. Call pnlEngine.calculateSnapshots(userId, exchangeAccountId)
8. Upsert into pnl_snapshots table
9. Update exchange_accounts.last_synced
10. Return sync result
```

Step 7 (PNL calculation) runs synchronously during sync to keep snapshots fresh. For large datasets, this may be moved to a background job.
