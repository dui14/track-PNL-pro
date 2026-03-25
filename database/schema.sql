-- ============================================================
-- aiTrackProfit - Full Database Schema
-- Run this entire script in Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard → your project → SQL Editor
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  demo_balance NUMERIC(18,8) NOT NULL DEFAULT 10000,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange     TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget','mexc')),
  label        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sync_status  TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','syncing','synced','error')),
  sync_error   TEXT,
  last_synced  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  key_encrypted       TEXT NOT NULL,
  secret_encrypted    TEXT NOT NULL,
  passphrase_encrypted TEXT,
  key_iv              TEXT NOT NULL,
  secret_iv           TEXT NOT NULL,
  passphrase_iv       TEXT,
  key_version         INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
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

CREATE TABLE IF NOT EXISTS pnl_snapshots (
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

CREATE TABLE IF NOT EXISTS demo_trades (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  side         TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type   TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  quantity     NUMERIC(28,10) NOT NULL,
  entry_price  NUMERIC(28,10) NOT NULL,
  exit_price   NUMERIC(28,10),
  realized_pnl NUMERIC(28,10),
  status       TEXT NOT NULL CHECK (status IN ('open','closed','cancelled')),
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  tokens_used     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_exchange_account_id ON trades(exchange_account_id);
CREATE INDEX IF NOT EXISTS idx_trades_traded_at ON trades(traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_user_period ON pnl_snapshots(user_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_demo_trades_user_id ON demo_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_demo_trades_status ON demo_trades(user_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON users
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "users_own_exchange_accounts" ON exchange_accounts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "no_direct_key_access" ON api_keys
  FOR ALL USING (FALSE);

CREATE POLICY "users_own_trades" ON trades
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_pnl" ON pnl_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_demo_trades" ON demo_trades
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_conversations" ON chat_conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS conversations_updated_at ON chat_conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
