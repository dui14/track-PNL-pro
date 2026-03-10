# Tech Stack

## Frontend

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Framework | Next.js | 15.x (App Router) | SSR, routing, API routes |
| Language | TypeScript | 5.x | Type safety |
| Styling | TailwindCSS | 3.x | Utility-first CSS |
| State Management | Zustand | 4.x | Global client state |
| Server State | TanStack Query | 5.x | Data fetching, caching |
| Charts | Recharts | 2.x | PNL analytics charts |
| Trading Chart | TradingView Widget | free embed | Candlestick chart |
| Forms | React Hook Form | 7.x | Form validation |
| Validation | Zod | 3.x | Schema validation |
| Icons | Lucide React | latest | UI icons |
| UI Components | shadcn/ui | latest | Accessible base components |

## Backend

| Layer | Technology | Purpose |
|---|---|---|
| Database | Supabase PostgreSQL | Primary data store |
| Auth | Supabase Auth | OAuth + Email auth |
| Storage | Supabase Storage | Avatar uploads |
| Edge Functions | Supabase Edge Functions | Server logic, exchange API calls |
| Realtime | Supabase Realtime | WebSocket subscriptions |

## External Integrations

| Integration | Purpose | Protocol |
|---|---|---|
| Binance API | Trade history, balance | REST + WebSocket |
| OKX API | Trade history, balance | REST |
| Bybit API | Trade history, balance | REST |
| Bitget API | Trade history, balance | REST |
| MEXC API | Trade history, balance | REST |
| LLM API | AI assistant responses | REST (streaming SSE) |
| TradingView | Chart widget | Embed (iframe) |
| Binance WS | Real-time price stream | WebSocket |

## Infrastructure

| Component | Provider | Notes |
|---|---|---|
| Frontend hosting | Vercel | Automatic deployments from main |
| Database | Supabase (cloud) | Managed PostgreSQL |
| Edge Functions | Supabase | Deno runtime |
| File storage | Supabase Storage | S3-compatible |
| Environment secrets | Vercel + Supabase secrets | Never in codebase |

## Development Tools

| Tool | Purpose |
|---|---|
| pnpm | Package manager |
| ESLint | Code linting |
| Prettier | Code formatting |
| Husky | Pre-commit hooks |
| lint-staged | Lint on staged files |
| Jest | Unit testing |
| Playwright | E2E testing |
| Supabase CLI | Local dev, migrations |

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_MASTER_KEY=
OPENAI_API_KEY=
NEXT_PUBLIC_APP_URL=
```

Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. All exchange API secrets and LLM keys must NEVER use the `NEXT_PUBLIC_` prefix.

## Dependency Management Rules

- Use `pnpm` exclusively
- Lock file must be committed (`pnpm-lock.yaml`)
- No `node_modules` in version control
- Audit dependencies monthly for CVEs
- Avoid packages with fewer than 500k weekly downloads unless essential
