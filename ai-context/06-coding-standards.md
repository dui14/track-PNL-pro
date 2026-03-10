# Coding Standards

## TypeScript

- Strict mode enabled: `"strict": true` in tsconfig.json
- No `any` types — use `unknown` with type guards if type is truly unknown
- All functions must declare explicit return types
- Prefer `type` over `interface` for object shapes
- Use `interface` only for extendable contracts (e.g., adapters)
- Enums are forbidden — use `const` objects with `as const`
- Generic types should be descriptive: `ApiResponse<TPNLSummary>` not `ApiResponse<T>`

## File and Folder Naming

| Type | Convention | Example |
|---|---|---|
| Components | PascalCase | `PNLChart.tsx` |
| Hooks | camelCase with `use` prefix | `usePNLData.ts` |
| Services | camelCase | `pnlService.ts` |
| Utilities | camelCase | `formatCurrency.ts` |
| Types | PascalCase | `TradeTypes.ts` |
| API routes | kebab-case folders | `api/pnl/chart/route.ts` |
| DB modules | camelCase | `tradesDb.ts` |

## Component Rules

- Server Components by default in `app/` directory
- Add `'use client'` only for components with:
  - `useState`, `useEffect`, or other client hooks
  - Browser APIs (localStorage, window)
  - Event handlers that require interactivity
- Props interfaces end with `Props`: `type PNLChartProps = { ... }`
- No business logic inside components — delegate to services or hooks
- Extract reusable UI logic into custom hooks

## API Route Rules

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { SomeRequestSchema } from '@/lib/validators/some'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { success: false, data: null, error: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  const body = await req.json()
  const parsed = SomeRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, data: null, error: 'VALIDATION_ERROR' },
      { status: 400 }
    )
  }

  // business logic ...
}
```

## Server Action Rules

```typescript
'use server'

import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import type { ApiResponse } from '@/lib/types'

export async function fetchPNLSummary(range: string): Promise<ApiResponse<PNLSummary>> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, data: null, error: 'UNAUTHORIZED' }

  // ...
}
```

## Error Handling

- Use typed `Result<T, E>` pattern for domain layer:
```typescript
type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E }
```
- Never throw in service functions — return Result types
- Only throw in infrastructure layer (let adapters propagate errors up)
- Always log errors with context: `console.error('[pnlService]', error)`
- Never log sensitive data (API keys, passwords, tokens)

## Import Conventions

- Use `@/` path alias for all internal imports
- External imports first, then internal imports, separated by blank line
- No circular imports — services cannot import from components

Order:
```typescript
import { NextRequest } from 'next/server'       // external
import { z } from 'zod'                         // external

import { pnlService } from '@/lib/services/pnlService'  // internal
import type { PNLSummary } from '@/lib/types'            // internal types
```

## State Management

- TanStack Query for server state (data fetching, caching, mutations)
- Zustand for global client state (UI state, user preferences)
- Never use `useState` for data that comes from the server
- Zustand stores must be typed with explicit state and action types

## Security Rules

- All environment secrets accessed via `process.env.VARIABLE_NAME`
- Never use `NEXT_PUBLIC_` prefix for secrets
- Validate all user inputs at the route handler level using Zod
- Sanitize any user content before storing in DB
- Use parameterized queries exclusively — never string-concatenated SQL
- Always verify resource ownership: `WHERE id = $1 AND user_id = $2`

## Performance Rules

- Use `React.memo` only when profiling shows it helps
- Avoid premature optimization — measure first
- Server-side render initial page data using RSC
- Use `loading.tsx` and `Suspense` for async boundaries
- Lazy-load heavy components (TradingView widget) with `dynamic`

## Testing Standards

- Unit tests for: PNL engine, exchange adapters, validators, utility functions
- Integration tests for: API routes with mocked Supabase
- E2E tests for: authentication flow, dashboard load, demo order placement
- Test file naming: `<filename>.test.ts` co-located with source file
- Minimum 80% coverage on domain and application layers

## Git Conventions

- Branch naming: `feature/<slug>`, `fix/<slug>`, `refactor/<slug>`
- Commit messages: imperative, present tense — `add PNL chart component`
- No direct commits to `main` — always use pull requests
- Squash merge to keep history clean
