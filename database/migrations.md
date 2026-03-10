# Database Migrations

## Migration Strategy

Migrations are managed via Supabase CLI. Every schema change must have a corresponding migration file.

## Migration File Conventions

File naming: `YYYYMMDDHHMMSS_<description>.sql`

```
supabase/migrations/
  20260301000000_initial_schema.sql
  20260302000000_add_sync_logs.sql
  20260307000000_add_symbol_filter.sql
```

Rules:
- Each migration file is immutable once merged to main
- Never edit a migration that has been applied to production
- For fixes, create a new migration file
- Migrations run in timestamp order

## Running Migrations

### Local Development

```bash
supabase start
supabase db push       # Apply all pending migrations
supabase db reset      # Wipe and rebuild from scratch (dev only)
supabase db diff       # Show pending changes
```

### Staging / Production

Migrations run automatically via GitHub Actions on merge to main:

```yaml
# .github/workflows/deploy.yml
- name: Apply migrations
  run: supabase db push --project-ref $SUPABASE_PROJECT_REF
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

## Migration Templates

### Adding a New Table

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_<table_name>.sql

CREATE TABLE <table_name> (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- columns...
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table_name>_user_policy" ON <table_name>
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_<table_name>_user_id ON <table_name>(user_id);
```

### Adding a Column

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_<column>_to_<table>.sql

ALTER TABLE <table_name>
  ADD COLUMN <column_name> <type> DEFAULT <default>;

-- Add index if needed
CREATE INDEX idx_<table>_<column> ON <table_name>(<column_name>);
```

### Dropping a Column

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_drop_<column>_from_<table>.sql

ALTER TABLE <table_name>
  DROP COLUMN IF EXISTS <column_name>;
```

### Adding an Index

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_add_index_<description>.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_<table>_<columns>
  ON <table_name>(<column1>, <column2>);
```

Use `CONCURRENTLY` for production tables to avoid locking.

### Modifying a Policy

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_update_policy_<description>.sql

DROP POLICY IF EXISTS "<old_policy_name>" ON <table_name>;

CREATE POLICY "<new_policy_name>" ON <table_name>
  FOR ALL USING (<new_condition>);
```

## Initial Migration File

`supabase/migrations/20260301000000_initial_schema.sql`

Contains the full schema from `database/schema.md`.

## Data Seed (Local Only)

`supabase/seed/seed.sql` - Test data for local development

```sql
-- Insert test user (after auth.users exists)
-- This seed data is for local dev only

INSERT INTO users (id, email, display_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@example.com',
  'Test Trader'
);

INSERT INTO exchange_accounts (user_id, exchange, label)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'binance',
  'My Binance'
);
```

Run seed: `supabase db seed`

## Rollback Strategy

Supabase does not support automatic rollback of migrations. To roll back:

1. Write a new migration that reverses the change
2. Apply the rollback migration
3. Never delete or edit the original migration

Example:
```sql
-- Migration: 20260307000000_add_symbol_filter.sql
ALTER TABLE exchange_accounts ADD COLUMN symbol_filter TEXT[];

-- Rollback: 20260307000001_remove_symbol_filter.sql  
ALTER TABLE exchange_accounts DROP COLUMN IF EXISTS symbol_filter;
```
