# Developer Workflow

## Local Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase CLI
- Git

### Initial Setup

```bash
git clone <repo>
cd aiTrackProfit
pnpm install
cp .env.example .env.local
supabase start
supabase db push
pnpm dev
```

### Environment Configuration

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<local_service_role_key>
ENCRYPTION_MASTER_KEY=<32_byte_hex>
OPENAI_API_KEY=<your_key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The `ENCRYPTION_MASTER_KEY` must be a cryptographically random 32-byte hex string. Generate with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Development Cycle

### Feature Development

```
1. Pull latest main
2. Create feature branch: git checkout -b feature/<slug>
3. Read relevant spec in spec/feature/<feature>.md
4. Implement changes in src/
5. Write tests
6. Run lint: pnpm lint
7. Run tests: pnpm test
8. Commit with clear message
9. Open pull request
10. Request code review
11. Merge after approval
```

### Database Changes

```
1. Write migration SQL in supabase/migrations/
2. Apply locally: supabase db push
3. Test migration: supabase db reset (rebuilds from scratch)
4. Commit migration file with feature branch
5. On merge, CI applies migration to production
```

Migration file naming:
```
supabase/migrations/20260307000000_add_exchange_accounts.sql
```

### Running Tests

```bash
pnpm test              # unit tests
pnpm test:integration  # integration tests (requires local Supabase)
pnpm test:e2e          # Playwright E2E
pnpm test:coverage     # coverage report
```

## Code Quality Gates

All PRs must pass:
1. TypeScript compilation: `pnpm build`
2. ESLint: `pnpm lint`
3. Unit test suite: `pnpm test`
4. No secrets in code: automated scan via `detect-secrets`

Pre-commit hooks (Husky + lint-staged):
- Run ESLint on staged `.ts` and `.tsx` files
- Run Prettier on staged files
- Block commit if checks fail

## Branch Strategy

```
main          <- production-ready, auto-deploys to Vercel
  |
  +-- feature/dashboard-pnl-chart
  +-- feature/binance-connector
  +-- fix/pnl-calculation-fee-bug
  +-- refactor/exchange-adapter-interface
```

Rules:
- Never commit directly to `main`
- Feature branches merge via squash merge
- Delete branch after merge

## Deployment

### Staging (automatic)
- Every push to `main` deploys to Vercel preview

### Production (manual gate)
- Tag release: `git tag v1.0.0`
- GitHub Actions runs full test suite
- On pass: deploys to Vercel production
- Supabase migrations applied via GitHub Actions using service role key

## Debugging Tips

### Exchange API Issues
- Check rate limit headers in response: `X-RateLimit-Remaining`
- Use exchange sandbox/testnet endpoints for testing
- Log raw response body before parsing

### Supabase Issues
- Check local logs: `supabase logs`
- RLS issues: test queries in Supabase Studio with specific user JWT
- Use `supabase db diff` to check pending migrations

### AI Streaming Issues
- Test SSE endpoint with `curl -N http://localhost:3000/api/ai/chat`
- Check for premature stream closes in edge function timeouts
