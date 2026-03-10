# Database Design

## Platform: Supabase PostgreSQL

All tables live in the `public` schema unless otherwise noted. Row Level Security (RLS) is enabled on every table. The `auth.users` table is managed by Supabase Auth.

## Entity Relationship Overview

```
auth.users
    |
    +-- users (profile extension)
    |
    +-- exchange_accounts
    |       |
    |       +-- api_keys (encrypted)
    |       +-- trades
    |       +-- pnl_snapshots
    |
    +-- demo_trades
    |
    +-- chat_conversations
            |
            +-- chat_messages
```

## Table Definitions

### users

Extends Supabase `auth.users` with profile data.

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  demo_balance NUMERIC(18,8) NOT NULL DEFAULT 10000,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### exchange_accounts

Represents a user's connected exchange account.

```sql
CREATE TABLE exchange_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget','mexc')),
  label        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);
```

### api_keys

Stores encrypted exchange API credentials.

```sql
CREATE TABLE api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  key_encrypted       TEXT NOT NULL,
  secret_encrypted    TEXT NOT NULL,
  key_iv              TEXT NOT NULL,
  secret_iv           TEXT NOT NULL,
  key_version         INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Encryption: AES-256-GCM. `key_iv` and `secret_iv` are base64-encoded initialization vectors. `key_version` enables key rotation.

### trades

Stores normalized historical trades fetched from exchanges.

```sql
CREATE TABLE trades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_trade_id   TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity            NUMERIC(28,10) NOT NULL,
  price               NUMERIC(28,10) NOT NULL,
  fee                 NUMERIC(28,10) NOT NULL DEFAULT 0,
  fee_currency        TEXT,
  realized_pnl        NUMERIC(28,10),
  trade_type          TEXT NOT NULL CHECK (trade_type IN ('spot','futures','margin')),
  traded_at           TIMESTAMPTZ NOT NULL,
  raw_data            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_account_id, external_trade_id)
);
```

### pnl_snapshots

Pre-aggregated PNL data for fast dashboard queries.

```sql
CREATE TABLE pnl_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  period_type         TEXT NOT NULL CHECK (period_type IN ('day','week','month','year','all')),
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  total_pnl           NUMERIC(28,10) NOT NULL DEFAULT 0,
  win_count           INT NOT NULL DEFAULT 0,
  loss_count          INT NOT NULL DEFAULT 0,
  trade_count         INT NOT NULL DEFAULT 0,
  win_rate            NUMERIC(5,2),
  best_trade_pnl      NUMERIC(28,10),
  worst_trade_pnl     NUMERIC(28,10),
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange_account_id, period_type, period_start)
);
```

### demo_trades

Simulated trades for paper trading.

```sql
CREATE TABLE demo_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  quantity        NUMERIC(28,10) NOT NULL,
  entry_price     NUMERIC(28,10) NOT NULL,
  exit_price      NUMERIC(28,10),
  realized_pnl    NUMERIC(28,10),
  status          TEXT NOT NULL CHECK (status IN ('open','closed','cancelled')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### chat_conversations

AI chat conversation threads.

```sql
CREATE TABLE chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### chat_messages

Individual messages within a conversation.

```sql
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  tokens_used     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Indexes

```sql
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_exchange_account_id ON trades(exchange_account_id);
CREATE INDEX idx_trades_traded_at ON trades(traded_at DESC);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_pnl_snapshots_user_period ON pnl_snapshots(user_id, period_type, period_start);
CREATE INDEX idx_demo_trades_user_id ON demo_trades(user_id);
CREATE INDEX idx_demo_trades_status ON demo_trades(user_id, status);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);
```

## Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "users_own_profile" ON users
  FOR ALL USING (auth.uid() = id);

-- Exchange accounts policies
CREATE POLICY "users_own_exchange_accounts" ON exchange_accounts
  FOR ALL USING (auth.uid() = user_id);

-- API keys: only accessible via service role (backend only)
CREATE POLICY "no_direct_key_access" ON api_keys
  FOR ALL USING (FALSE);

-- Trades policies
CREATE POLICY "users_own_trades" ON trades
  FOR ALL USING (auth.uid() = user_id);

-- PNL snapshots policies
CREATE POLICY "users_own_pnl" ON pnl_snapshots
  FOR ALL USING (auth.uid() = user_id);

-- Demo trades policies
CREATE POLICY "users_own_demo_trades" ON demo_trades
  FOR ALL USING (auth.uid() = user_id);

-- Chat policies
CREATE POLICY "users_own_conversations" ON chat_conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  );
```

## Triggers

```sql
-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```
