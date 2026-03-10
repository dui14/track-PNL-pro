# Feature Development Flow

## Overview

This document defines the end-to-end process for taking a feature from idea to production.

## Flow Diagram

```
Idea
  |
  v
Product Definition (ai-context/01-product.md)
  |
  v
Architecture Review (ai-context/03-architecture.md)
  |
  v
Database Design (supabase/migrations/ + ai-context/04-database.md)
  |
  v
API Contract (ai-context/05-api-contract.md)
  |
  v
Feature Specification (spec/feature/<feature>.md)
  |
  v
UI Design (spec/ui/<feature>.html)
  |
  v
Implementation (src/)
  |
  v
Tests (src/**/*.test.ts)
  |
  v
Code Review
  |
  v
Documentation (docs/)
  |
  v
Merge + Deploy
```

## Stage 1: Feature Specification

Create `spec/feature/<feature-slug>.md` with:

```markdown
# Feature: <Name>

## Overview
One paragraph describing what this feature does.

## User Story
As a <user type>, I want to <action> so that <benefit>.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Data Requirements
Tables affected: trades, pnl_snapshots
New tables required: none

## API Endpoints Required
- GET /api/pnl/summary
- GET /api/pnl/chart

## UI Components Required
- PNLSummaryCard
- PNLChart
- TimeRangeFilter

## Out of Scope
- Real-time updates (future phase)
```

## Stage 2: Database Migration

If new tables or columns are needed:

1. Write SQL in `supabase/migrations/YYYYMMDDHHMMSS_<description>.sql`
2. Include: CREATE TABLE, RLS policies, indexes, triggers
3. Apply locally: `supabase db push`
4. Verify with `supabase db diff`

## Stage 3: Backend Implementation

Order of implementation:

```
src/lib/types/<feature>Types.ts         <- Define all TypeScript types
src/lib/validators/<feature>Schemas.ts  <- Define Zod validation schemas
src/lib/db/<feature>Db.ts               <- Database query functions
src/lib/services/<feature>Service.ts    <- Domain business logic
src/app/api/<feature>/route.ts          <- API route handler
```

Each step depends on the previous. Never skip ahead.

## Stage 4: Frontend Implementation

Order of implementation:

```
src/components/features/<module>/       <- Feature-specific components
src/lib/hooks/use<Feature>.ts           <- Data fetching hook (TanStack Query)
src/app/(routes)/<page>/page.tsx        <- Page using Server Components
src/app/(routes)/<page>/loading.tsx     <- Loading skeleton
```

## Stage 5: Testing

For each feature, write:

1. Unit test for service function:
   `src/lib/services/<feature>Service.test.ts`

2. Unit test for utility/engine:
   `src/lib/engines/<engine>.test.ts`

3. API route integration test:
   `src/app/api/<feature>/route.test.ts`

Run tests: `pnpm test`

## Stage 6: Documentation

After implementation, create `docs/<feature>.md`:

```markdown
# Feature: <Name>

## Overview
Brief description of what was implemented.

## Architecture Impact
Which layers were modified and why.

## API Endpoints
List of endpoints with request/response examples.

## Database Changes
List of migrations applied.

## Validation Summary
Checklist of quality gates passed.
```

## Feature Checklists

### Backend Checklist
- [ ] TypeScript compiles with no errors
- [ ] Zod validation on all inputs
- [ ] Auth check at top of every API handler
- [ ] RLS-aware queries (user_id filter)
- [ ] Result type used in service functions (no throws)
- [ ] No secrets hardcoded
- [ ] Error responses follow ApiResponse contract
- [ ] Unit tests written and passing

### Frontend Checklist
- [ ] No business logic in components
- [ ] Server Components used by default
- [ ] `'use client'` only where truly needed
- [ ] Loading states handled (Suspense / skeleton)
- [ ] Error states handled
- [ ] Responsive on mobile (768px breakpoint)
- [ ] Accessible (keyboard navigation, aria labels)
- [ ] TypeScript props typed explicitly

### Security Checklist
- [ ] No API keys visible in client bundle
- [ ] No `NEXT_PUBLIC_` prefix on secrets
- [ ] User input sanitized before DB storage
- [ ] No SQL concatenation (parameterized only)
- [ ] Rate limiting on exchange API calls
- [ ] Resource ownership verified (user_id check)

## Module-Specific Notes

### Dashboard Module
- Pre-calculate PNL snapshots on sync, not on read
- Use `Suspense` for chart components to avoid blocking page render
- Cache TanStack Query results for 5 minutes

### Demo Trading Module  
- Virtual balance must be checked before order placement
- Demo PNL calculated server-side on order close
- Binance WebSocket connection is client-side only (public streams, no auth)

### Ask AI Module
- Rate limit: max 20 messages per user per hour
- Conversation title auto-generated from first message (first 50 chars)
- System prompt includes user's PNL context if permission granted
- Stream response using ReadableStream in API route

### Profile Module
- Avatar upload: validate MIME type server-side, not just file extension
- API key updates: delete old encrypted key, insert new one
- Password change: handled by Supabase Auth directly
