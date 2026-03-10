# AI Coding Workflow

## Overview

This project uses GitHub Copilot as the primary AI coding assistant. All AI-assisted code generation must follow the context files in `ai-context/` and the patterns defined in this workflow.

## Context Loading Order

Before generating any code, read these files in order:

```
ai-context/00-role.md          <- Who you are and what you must never do
ai-context/01-product.md       <- Product modules and requirements
ai-context/02-tech-stack.md    <- Technology choices
ai-context/03-architecture.md  <- System design and layer rules
ai-context/04-database.md      <- Schema and data models
ai-context/05-api-contract.md  <- Request/response formats
ai-context/06-coding-standards.md <- Code style and conventions
```

## AI Task Execution Model

### Phase 1: Understand

Before generating code, answer:
1. Which product module does this belong to? (Dashboard / Demo / Ask / Profile)
2. Which architectural layer? (Presentation / Application / Domain / Infrastructure)
3. Is there a feature spec in `spec/feature/`?
4. Is there a UI design in `spec/ui/`?
5. What database tables are involved?
6. What API endpoints are affected?

### Phase 2: Plan

List what files will be created or modified:
- New components in `src/components/features/<module>/`
- New service functions in `src/lib/services/`
- New API routes in `src/app/api/`
- New DB queries in `src/lib/db/`
- New validators in `src/lib/validators/`
- New types in `src/lib/types/`

### Phase 3: Generate

Generate code following:
- No inline comments unless logic is non-obvious
- Strict TypeScript with explicit return types
- Zod validation at all API boundaries
- Result types in domain layer (no throws)
- RLS-aware queries (always filter by user_id)

### Phase 4: Validate

After generating:
1. Check TypeScript compiles: does the code typecheck?
2. Verify API response matches contract in `05-api-contract.md`
3. Confirm no secrets are hardcoded
4. Ensure authentication check is first in every API route
5. Verify no business logic leaked into presentation layer

## Prompting Patterns

### To generate a new API endpoint

```
Context: Read ai-context/ files first.
Task: Create a Next.js API route handler at /api/pnl/summary
- Authenticate with Supabase JWT
- Validate query params with Zod
- Call pnlService.getSummary()
- Return ApiResponse<PNLSummary>
Follow coding-standards.md patterns exactly.
```

### To generate a React component

```
Context: Read ai-context/ files first.
Task: Create a PNL summary card component
Module: Dashboard
Location: src/components/features/dashboard/PNLSummaryCard.tsx
Props: { totalPnl: number; winRate: number; tradeCount: number }
Style: TailwindCSS, dark theme, responsive
No business logic inside the component.
```

### To generate a service function

```
Context: Read ai-context/03-architecture.md and ai-context/04-database.md
Task: Create pnlService.getSummary function
- Takes userId: string and range: TimeRange
- Queries pnl_snapshots table
- Returns Result<PNLSummary, string>
- No HTTP calls, no throws
Location: src/lib/services/pnlService.ts
```

### To generate a database migration

```
Context: Read ai-context/04-database.md
Task: Write SQL migration to add symbol_filter column to exchange_accounts
- Column: symbol_filter TEXT[] DEFAULT NULL
- Add index on (user_id, symbol_filter)
- Enable RLS (already enabled)
File: supabase/migrations/20260307000000_add_symbol_filter.sql
```

## Common Mistakes to Avoid

| Mistake | Correction |
|---|---|
| Using `any` type | Use `unknown` with type guard or define proper type |
| Fetching in client component directly | Use Server Action or API route |
| Storing API key in plaintext | Always encrypt with `encryptApiKey()` utility |
| Missing auth check in API route | Always check `session.user` first |
| SQL string concatenation | Use Supabase client parameterized queries |
| Importing from wrong layer | Services cannot import from components |
| Missing Zod validation | Every external input must be parsed with Zod |
| `console.log` with sensitive data | Never log API keys, tokens, or passwords |

## AI Agent Specialization

For complex tasks, use the specialized agents in `agents/`:

| Task | Agent |
|---|---|
| Build exchange connector | `agents/exchange-integration-agent.md` |
| Implement PNL calculation | `agents/pnl-calculation-agent.md` |
| Demo trading feature | `agents/trading-simulation-agent.md` |
| AI chat feature | `agents/ai-chat-agent.md` |
| Frontend components | `agents/frontend-ui-agent.md` |
| Code review | `agents/reviewer.md` |
| Security audit | `agents/security.md` |
