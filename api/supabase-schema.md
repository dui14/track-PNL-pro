# Supabase Schema Design

## Overview

This document expands on the database design from `ai-context/04-database.md` with implementation details specific to Supabase.

## Storage Buckets

```sql
-- Avatar storage bucket (public read, authenticated write via RLS)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE);

-- RLS on storage: users can only upload to their own folder
CREATE POLICY "users_upload_own_avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "users_update_own_avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "public_read_avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
```

Avatar URL pattern: `{SUPABASE_URL}/storage/v1/object/public/avatars/{userId}/avatar.webp`

## Supabase Auth Configuration

Google OAuth requires:
1. Enable Google provider in Supabase Auth settings
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Supabase secrets
3. Add redirect URL: `{APP_URL}/auth/callback`

Email/Password:
- Enable email confirmations
- Set custom SMTP for production emails

## Realtime Subscriptions

Enable Realtime on `pnl_snapshots` table for dashboard live updates:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE pnl_snapshots;
```

Client subscription pattern:
```typescript
const channel = supabase
  .channel('pnl-updates')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'pnl_snapshots',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    queryClient.invalidateQueries({ queryKey: ['pnl-summary'] })
  })
  .subscribe()
```

## Views

Pre-built views for common queries:

```sql
-- PNL summary per user (all-time)
CREATE VIEW user_pnl_summary AS
SELECT
  user_id,
  SUM(total_pnl) AS total_pnl,
  SUM(trade_count) AS trade_count,
  SUM(win_count) AS win_count,
  SUM(loss_count) AS loss_count,
  CASE
    WHEN SUM(trade_count) > 0
    THEN ROUND(SUM(win_count)::numeric / SUM(trade_count) * 100, 2)
    ELSE 0
  END AS win_rate
FROM pnl_snapshots
WHERE period_type = 'day'
GROUP BY user_id;

-- Exchange account summary with last sync info
CREATE VIEW exchange_account_summary AS
SELECT
  ea.id,
  ea.user_id,
  ea.exchange,
  ea.label,
  ea.is_active,
  ea.last_synced,
  COUNT(t.id) AS total_trades,
  SUM(t.realized_pnl) AS total_pnl
FROM exchange_accounts ea
LEFT JOIN trades t ON t.exchange_account_id = ea.id
GROUP BY ea.id;
```

## Functions (PostgreSQL)

```sql
-- Get PNL for a date range
CREATE OR REPLACE FUNCTION get_pnl_for_range(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  daily_pnl NUMERIC,
  cumulative_pnl NUMERIC
) AS $$
  SELECT
    period_start AS date,
    total_pnl AS daily_pnl,
    SUM(total_pnl) OVER (
      PARTITION BY user_id
      ORDER BY period_start
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_pnl
  FROM pnl_snapshots
  WHERE user_id = p_user_id
    AND period_type = 'day'
    AND period_start BETWEEN p_start_date AND p_end_date
  ORDER BY period_start;
$$ LANGUAGE sql SECURITY DEFINER;
```

## Edge Functions

Location: `supabase/functions/`

| Function | Trigger | Purpose |
|---|---|---|
| `sync-trades` | HTTP POST | Fetch and store trades from exchange |
| `calculate-pnl` | HTTP POST | Recalculate PNL snapshots |
| `scheduled-sync` | Cron (daily) | Sync all active accounts |

Edge Function template:

```typescript
// supabase/functions/sync-trades/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ... implementation

  return new Response(JSON.stringify({ success: true, data: result }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

## Database Connection Limits

Supabase free tier: 60 connections
Production tier: configurable via PgBouncer

Next.js API routes use connection pooling via Supabase's built-in PgBouncer.
Configure in Supabase project settings or via connection string pool mode.

## Backup Strategy

- Supabase automatically backs up daily (paid plans)
- Point-in-time recovery available on Pro plan
- Export critical tables weekly via `pg_dump` in CI

## Performance Tuning

Key considerations:

1. `trades` table will grow large — partition by `user_id` if exceeds 10M rows
2. `pnl_snapshots` are pre-aggregated — reads are fast, writes happen only on sync
3. `chat_messages` table grows with usage — archive old messages after 6 months
4. Use connection pooling (`?pgbouncer=true` in connection string) for API routes
