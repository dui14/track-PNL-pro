# Database Schema Reference

## Complete SQL Schema

This file contains the full schema definition. Run in order for initial setup.

```sql
-- ==========================================
-- EXTENSIONS
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- USERS
-- ==========================================
CREATE TABLE users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  demo_balance NUMERIC(18,8) NOT NULL DEFAULT 10000,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON users
  FOR ALL USING (auth.uid() = id);

-- ==========================================
-- EXCHANGE ACCOUNTS
-- ==========================================
CREATE TABLE exchange_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget','gateio')),
  label        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);

ALTER TABLE exchange_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_exchange_accounts" ON exchange_accounts
  FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- API KEYS (encrypted, server-only access)
-- ==========================================
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

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- No direct client access to api_keys — service role only
CREATE POLICY "no_direct_key_access" ON api_keys
  FOR ALL USING (FALSE);

-- ==========================================
-- TRADES
-- ==========================================
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

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_trades" ON trades
  FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- PNL SNAPSHOTS
-- ==========================================
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

ALTER TABLE pnl_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_pnl" ON pnl_snapshots
  FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- DEMO TRADES
-- ==========================================
CREATE TABLE demo_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  margin_mode     TEXT CHECK (margin_mode IN ('cross','isolated')) DEFAULT 'cross',
  leverage        INT CHECK (leverage >= 1 AND leverage <= 125) DEFAULT 1,
  quantity        NUMERIC(28,10) NOT NULL,
  entry_price     NUMERIC(28,10) NOT NULL,
  initial_margin  NUMERIC(28,10),
  position_notional NUMERIC(28,10),
  take_profit     NUMERIC(28,10),
  stop_loss       NUMERIC(28,10),
  market_price_at_open NUMERIC(28,10),
  exit_price      NUMERIC(28,10),
  realized_pnl    NUMERIC(28,10),
  status          TEXT NOT NULL CHECK (status IN ('open','closed','cancelled')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE demo_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_demo_trades" ON demo_trades
  FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- CHAT CONVERSATIONS
-- ==========================================
CREATE TABLE chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_conversations" ON chat_conversations
  FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- CHAT MESSAGES
-- ==========================================
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  tokens_used     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  );

-- ==========================================
-- SYNC LOGS (optional monitoring)
-- ==========================================
CREATE TABLE sync_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  status              TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
  trades_fetched      INT,
  trades_new          INT,
  error_message       TEXT,
  duration_ms         INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sync_logs" ON sync_logs
  FOR ALL USING (
    exchange_account_id IN (
      SELECT id FROM exchange_accounts WHERE user_id = auth.uid()
    )
  );
```

## Indexes

```sql
-- Trades performance
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_exchange_account_id ON trades(exchange_account_id);
CREATE INDEX idx_trades_traded_at ON trades(traded_at DESC);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_user_symbol ON trades(user_id, symbol);

-- PNL snapshots
CREATE INDEX idx_pnl_snapshots_user_period ON pnl_snapshots(user_id, period_type, period_start);
CREATE INDEX idx_pnl_snapshots_exchange ON pnl_snapshots(exchange_account_id, period_type);

-- Demo trades
CREATE INDEX idx_demo_trades_user_id ON demo_trades(user_id);
CREATE INDEX idx_demo_trades_status ON demo_trades(user_id, status);

-- Chat
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);

-- Sync logs
CREATE INDEX idx_sync_logs_account ON sync_logs(exchange_account_id, created_at DESC);
```

## Triggers

```sql
-- Auto-create user profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at automation
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

## Views

```sql
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

CREATE VIEW exchange_account_summary AS
SELECT
  ea.id,
  ea.user_id,
  ea.exchange,
  ea.label,
  ea.is_active,
  ea.last_synced,
  COUNT(t.id) AS total_trades,
  COALESCE(SUM(t.realized_pnl), 0) AS total_pnl
FROM exchange_accounts ea
LEFT JOIN trades t ON t.exchange_account_id = ea.id
GROUP BY ea.id;
```
