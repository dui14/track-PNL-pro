# Data Ingestion Pipeline

## Overview

The data ingestion pipeline is responsible for fetching trade data from external exchanges, normalizing it, calculating PNL, and storing results in the database.

## Pipeline Architecture

```
User Action / Cron Job
      |
      v
+------------------+
|  Trigger Layer   |  <- POST /api/exchange/sync or scheduled Edge Function
+------------------+
      |
      v
+------------------+
|  Auth & Decrypt  |  <- Verify JWT, fetch + decrypt API keys
+------------------+
      |
      v
+------------------+
|  Exchange Layer  |  <- Call exchange REST API with rate limiting
+------------------+
      |
      v
+------------------+
| Normalize Layer  |  <- Convert to NormalizedTrade[]
+------------------+
      |
      v
+------------------+
|  Storage Layer   |  <- Upsert to trades table (dedup by external_trade_id)
+------------------+
      |
      v
+------------------+
|   PNL Engine     |  <- Calculate daily snapshots from traded_at timestamps
+------------------+
      |
      v
+------------------+
|  Snapshot Store  |  <- Upsert to pnl_snapshots table
+------------------+
      |
      v
+------------------+
|  Update Metadata |  <- Set exchange_accounts.last_synced = NOW()
+------------------+
```

## Sync Modes

### On-Demand Sync

Triggered by user clicking "Sync Now" in the dashboard.

- Immediate response with sync result
- Timeout: 30 seconds per exchange
- Max 1 sync per exchange per 5 minutes (rate limiting)
- Returns count of new/updated trades

### Background Scheduled Sync

Supabase Edge Function running as a cron job.

- Runs daily at 00:00 UTC
- Syncs all `is_active = true` exchange accounts
- Processes accounts in batches of 10
- Failures are logged and retried next cycle
- Does not interfere with user-triggered syncs

## Incremental Fetch Logic

```typescript
async function fetchIncrementalTrades(
  adapter: ExchangeAdapter,
  apiKey: string,
  apiSecret: string,
  lastSynced: Date | null
): Promise<NormalizedTrade[]> {
  const startTime = lastSynced
    ? lastSynced.getTime()
    : Date.now() - 90 * 24 * 60 * 60 * 1000  // 90 days back for first sync

  const allTrades: NormalizedTrade[] = []
  let fromTime = startTime

  while (true) {
    const result = await adapter.fetchTrades(apiKey, apiSecret, {
      startTime: fromTime,
      limit: 1000
    })

    if (!result.success || result.data.length === 0) break

    allTrades.push(...result.data)

    if (result.data.length < 1000) break  // no more pages

    fromTime = result.data[result.data.length - 1].tradedAt.getTime() + 1
  }

  return allTrades
}
```

## PNL Calculation During Ingestion

After trades are stored, PNL snapshots are calculated:

```
For each day that has new trades:
  1. Get all trades for user on that day
  2. Sum realized_pnl values
  3. Count wins (pnl > 0) and losses (pnl < 0)
  4. Calculate win rate
  5. Upsert pnl_snapshots row for that day

Then aggregate:
  - week: sum of 7 daily snapshots
  - month: sum of ~30 daily snapshots
  - year: sum of 365 daily snapshots
  - all: running total
```

## Deduplication Strategy

Trades are deduplicated using the unique constraint:
```sql
UNIQUE (exchange_account_id, external_trade_id)
```

Insert strategy: `ON CONFLICT DO UPDATE` to refresh any changed fields.

```sql
INSERT INTO trades (exchange_account_id, user_id, external_trade_id, ...)
VALUES (...)
ON CONFLICT (exchange_account_id, external_trade_id)
DO UPDATE SET
  realized_pnl = EXCLUDED.realized_pnl,
  raw_data = EXCLUDED.raw_data;
```

## Error Recovery

| Failure Point | Recovery Strategy |
|---|---|
| Exchange API 429 | Wait for Retry-After header, then continue |
| Exchange API 5xx | Retry 3 times with exponential backoff |
| Exchange API 401 | Mark account as `is_active=false`, notify user |
| DB insert failure | Log error, skip trade, continue pipeline |
| PNL calc failure | Log error, do not update snapshots, surface error to user |
| Timeout | Store checkpoint (last processed time), resume on next sync |

## Monitoring

Log the following events to a `sync_logs` table (optional):

```sql
CREATE TABLE sync_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id),
  status              TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
  trades_fetched      INT,
  trades_new          INT,
  error_message       TEXT,
  duration_ms         INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This enables dashboard metrics like "last sync duration" and error reporting.

## Resource Limits

- Max trade history fetch: 90 days on first sync (most exchanges limit history)
- Max trades per sync batch: 1000 per API call
- Max concurrent exchange syncs per user: 1 (prevent rate limit abuse)
- Max file size for raw_data JSONB: trim to essential fields before storage
