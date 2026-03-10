# System Architecture

## Architecture Overview

aiTrackProfit follows a layered, modular architecture separating concerns across four primary layers.

```
+--------------------------------------------------+
|                   PRESENTATION                   |
|   Next.js App Router   |   TailwindCSS + shadcn   |
+--------------------------------------------------+
                          |
+--------------------------------------------------+
|                   APPLICATION                    |
|  Server Actions | API Routes | Edge Functions     |
+--------------------------------------------------+
                          |
+--------------------------------------------------+
|                   DOMAIN                         |
|  PNL Engine | Exchange Adapters | AI Service      |
+--------------------------------------------------+
                          |
+--------------------------------------------------+
|                 INFRASTRUCTURE                   |
|  Supabase DB | Supabase Auth | External APIs      |
+--------------------------------------------------+
```

## Layer Definitions

### Presentation Layer

Location: `src/app/`, `src/components/`

Responsibilities:
- Render UI using React Server Components (RSC) where possible
- Client Components only where interactivity is required
- Fetch data via Server Actions or TanStack Query
- Route protection via Next.js middleware
- No business logic in this layer

Rules:
- Server Components are default; add `'use client'` only when needed
- Page components in `src/app/(routes)/`
- Shared UI components in `src/components/ui/`
- Feature components in `src/components/features/`

### Application Layer

Location: `src/lib/actions/`, `src/app/api/`, `supabase/functions/`

Responsibilities:
- Orchestrate domain services
- Handle HTTP request/response cycle
- Validate inputs using Zod schemas
- Authenticate requests via Supabase JWT
- Return typed API responses

Rules:
- All inputs validated with Zod before processing
- All responses follow `ApiResponse<T>` type contract
- No direct database queries in this layer (use domain services)
- Authentication check first, then authorization

### Domain Layer

Location: `src/lib/services/`, `src/lib/engines/`

Responsibilities:
- PNL calculation logic
- Exchange adapter abstraction
- Demo trading simulation engine
- AI chat orchestration
- Business rule enforcement

Rules:
- Pure functions where possible
- No direct HTTP calls (use infrastructure adapters)
- Fully testable without external dependencies
- Each domain service has a typed interface

### Infrastructure Layer

Location: `src/lib/adapters/`, `src/lib/db/`

Responsibilities:
- Supabase database queries
- Exchange REST API clients
- LLM API client
- Encryption/decryption of API keys
- WebSocket connection management

Rules:
- Exchange adapters implement a common `ExchangeAdapter` interface
- All DB operations return typed results
- Rate limiting enforced at this layer
- Retry logic with exponential backoff

## Module Map

```
src/
  app/
    (auth)/
      login/
      callback/
    (routes)/
      dashboard/
      demo/
      ask/
      profile/
    api/
      exchange/
      pnl/
      ai/
      demo/
  components/
    ui/               # shadcn base components
    features/
      dashboard/
      demo/
      ask/
      profile/
    layout/
  lib/
    actions/          # Server Actions
    services/         # Domain services
    engines/          # PNL + Demo trading engines
    adapters/         # Exchange + LLM clients
    db/               # Supabase query modules
    utils/            # Shared utilities
    validators/       # Zod schemas
    types/            # Global TypeScript types
  middleware.ts
supabase/
  functions/         # Edge Functions (Deno)
  migrations/        # SQL migrations
  seed/
```

## Data Flow: PNL Dashboard

```
User visits /dashboard
  |
  +-> Next.js Server Component
  |     |
  |     +-> getServerSession() via Supabase
  |     +-> fetchPNLSummary(userId) [Server Action]
  |           |
  |           +-> pnlService.getSummary(userId)
  |                 |
  |                 +-> db.pnlSnapshots.getLatest(userId)
  |                 +-> db.trades.getAggregated(userId)
  |                 +-> Calculate win rate, totals
  |                 +-> Return PNLSummary
  |
  +-> Render PNL charts (client component)
        |
        +-> useQuery('pnl-chart-data')
              |
              +-> GET /api/pnl/chart?range=week&userId=...
                    |
                    +-> pnlService.getChartData(userId, range)
                          |
                          +-> db.pnlSnapshots.getByRange()
```

## Data Flow: Exchange Sync

```
User clicks "Sync Now"
  |
  +-> POST /api/exchange/sync
        |
        +-> Validate JWT token
        +-> Get encrypted API keys from DB
        +-> Decrypt keys (AES-256-GCM)
        +-> ExchangeAdapter.fetchTrades(apiKey, secret)
        +-> Parse and normalize trade data
        +-> Calculate PNL per trade
        +-> Upsert into trades table
        +-> Create pnl_snapshot
        +-> Return sync result
```

## Data Flow: Ask AI

```
User sends message
  |
  +-> POST /api/ai/chat
        |
        +-> Validate JWT + rate limit check
        +-> Load conversation history from DB
        +-> Build prompt with system context + history + user message
        +-> Stream LLM API response (SSE)
        +-> Save assistant response to chat_history
        +-> Return stream to client
```

## Security Architecture

```
Client
  |
  +-> HTTPS only (TLS 1.3)
  |
Next.js Middleware
  +-> Check Supabase JWT
  +-> Redirect unauthenticated to /login
  |
API Routes
  +-> Re-validate JWT server-side
  +-> Row Level Security enforced by Supabase
  |
Edge Functions
  +-> Service Role Key (never exposed to client)
  +-> Decrypt API keys only in server context
  +-> Rate limit per userId
```

## Supabase Row Level Security (RLS)

All tables have RLS enabled. Users can only access their own rows:

```sql
CREATE POLICY "user_owns_row" ON trades
  FOR ALL USING (auth.uid() = user_id);
```

Service role key bypasses RLS for background jobs and edge functions.

## Scalability Considerations

- Exchange sync is stateless and can run in parallel per exchange
- PNL snapshots are pre-calculated and cached (no real-time computation on read)
- AI chat uses streaming to reduce perceived latency
- WebSocket connections for demo trading are client-side only (Binance public WS)
- Supabase Realtime can push snapshot updates to dashboard without polling
