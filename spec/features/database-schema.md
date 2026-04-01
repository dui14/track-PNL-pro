# Database Schema: aiTrackProfit

## Platform: Supabase PostgreSQL

Version: 1.0.0
Generated: 2026-03-07

Tất cả tables nằm trong `public` schema. Row Level Security (RLS) được bật trên tất cả bảng. `auth.users` được quản lý bởi Supabase Auth.

## Entity Relationship Diagram

```
auth.users (Supabase managed)
    │
    └── users ──────────────────────────────────────────────┐
             │                                               │
             ├── exchange_accounts                           │
             │       │                                       │
             │       ├── api_keys                            │
             │       │                                       │
             │       └── trades ──────────────────────► pnl_snapshots
             │                                               │
             ├── demo_trades                                 │
             │                                               │
             ├── chat_conversations ◄──────────────────────┘
             │       │
             │       └── chat_messages
             │
             └── security_audit_log
```

---

## Full Migration Script

```sql
-- ============================================================
-- aiTrackProfit Database Schema
-- Migration: 001_initial_schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: users
-- Extends Supabase auth.users with application profile data
-- ============================================================
CREATE TABLE public.users (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  display_name         TEXT,
  avatar_url           TEXT,
  demo_balance         NUMERIC(18,8) NOT NULL DEFAULT 10000,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.users IS 'Application user profiles extending Supabase auth.users';
COMMENT ON COLUMN public.users.demo_balance IS 'Virtual USDT balance for paper trading, default 10000';
COMMENT ON COLUMN public.users.onboarding_completed IS 'True after user completes initial onboarding flow';

-- ============================================================
-- TABLE: exchange_accounts
-- User connected exchange accounts (one per exchange per user)
-- ============================================================
CREATE TABLE public.exchange_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exchange    TEXT NOT NULL CHECK (exchange IN ('binance','okx','bybit','bitget','gateio')),
  label       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sync_status TEXT NOT NULL DEFAULT 'pending' 
              CHECK (sync_status IN ('pending','syncing','synced','error')),
  sync_error  TEXT,
  last_synced TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exchange)
);

COMMENT ON TABLE public.exchange_accounts IS 'User connected exchange accounts';
COMMENT ON COLUMN public.exchange_accounts.sync_status IS 'Current sync state: pending, syncing, synced, error';
COMMENT ON COLUMN public.exchange_accounts.sync_error IS 'Last sync error message if sync_status is error';

-- ============================================================
-- TABLE: api_keys
-- AES-256-GCM encrypted exchange API credentials
-- ============================================================
CREATE TABLE public.api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
  key_encrypted       TEXT NOT NULL,
  secret_encrypted    TEXT NOT NULL,
  key_iv              TEXT NOT NULL,
  secret_iv           TEXT NOT NULL,
  key_auth_tag        TEXT,
  secret_auth_tag     TEXT,
  key_version         INT NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.api_keys IS 'AES-256-GCM encrypted exchange API credentials. NEVER expose to client.';
COMMENT ON COLUMN public.api_keys.key_iv IS 'Base64-encoded AES-GCM initialization vector for API key';
COMMENT ON COLUMN public.api_keys.key_version IS 'Encryption key version for rotation support';

-- ============================================================
-- TABLE: trades
-- Normalized historical trades from all exchanges
-- ============================================================
CREATE TABLE public.trades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID NOT NULL REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
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

COMMENT ON TABLE public.trades IS 'Normalized trade history from all exchanges';
COMMENT ON COLUMN public.trades.external_trade_id IS 'Original trade ID from exchange, used for deduplication';
COMMENT ON COLUMN public.trades.realized_pnl IS 'Net profit/loss for this trade in USD. NULL for unclosed spot.';
COMMENT ON COLUMN public.trades.raw_data IS 'Original raw JSON response from exchange, for debugging';

-- ============================================================
-- TABLE: pnl_snapshots
-- Pre-aggregated PNL data for fast dashboard queries
-- ============================================================
CREATE TABLE public.pnl_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exchange_account_id UUID REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
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

COMMENT ON TABLE public.pnl_snapshots IS 'Pre-computed PNL aggregates by period for dashboard performance';
COMMENT ON COLUMN public.pnl_snapshots.exchange_account_id IS 'NULL means aggregated across all exchanges';
COMMENT ON COLUMN public.pnl_snapshots.period_type IS 'Granularity: day, week, month, year, all';
COMMENT ON COLUMN public.pnl_snapshots.win_rate IS 'Percentage 0-100 of winning trades';

-- ============================================================
-- TABLE: demo_trades
-- Paper trading simulated orders
-- ============================================================
CREATE TABLE public.demo_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  quantity        NUMERIC(28,10) NOT NULL,
  entry_price     NUMERIC(28,10) NOT NULL,
  limit_price     NUMERIC(28,10),
  exit_price      NUMERIC(28,10),
  realized_pnl    NUMERIC(28,10),
  unrealized_pnl  NUMERIC(28,10),
  reserved_amount NUMERIC(28,10) DEFAULT 0,
  status          TEXT NOT NULL CHECK (status IN ('pending','open','closed','cancelled')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.demo_trades IS 'Simulated paper trading orders and positions';
COMMENT ON COLUMN public.demo_trades.limit_price IS 'Target price for limit orders, NULL for market orders';
COMMENT ON COLUMN public.demo_trades.reserved_amount IS 'USDT reserved from balance for pending limit orders';
COMMENT ON COLUMN public.demo_trades.unrealized_pnl IS 'Current unrealized PNL for open positions (updated periodically)';

-- ============================================================
-- TABLE: chat_conversations
-- AI Assistant conversation threads
-- ============================================================
CREATE TABLE public.chat_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chat_conversations IS 'AI assistant conversation threads per user';
COMMENT ON COLUMN public.chat_conversations.title IS 'Auto-generated from first message, max 100 chars';

-- ============================================================
-- TABLE: chat_messages
-- Individual messages within AI conversations
-- ============================================================
CREATE TABLE public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  tokens_used     INT,
  model_used      TEXT,
  is_partial      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chat_messages IS 'Individual messages in AI assistant conversations';
COMMENT ON COLUMN public.chat_messages.role IS 'user: human input, assistant: AI response, system: sys prompt';
COMMENT ON COLUMN public.chat_messages.tokens_used IS 'LLM tokens consumed for this message';
COMMENT ON COLUMN public.chat_messages.is_partial IS 'True if stream was interrupted before completion';

-- ============================================================
-- TABLE: security_audit_log
-- Immutable audit trail for security-sensitive operations
-- ============================================================
CREATE TABLE public.security_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  resource    TEXT,
  resource_id UUID,
  ip_address  INET,
  user_agent  TEXT,
  success     BOOLEAN NOT NULL,
  error_code  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.security_audit_log IS 'Append-only audit log for security operations';
COMMENT ON COLUMN public.security_audit_log.action IS 'Action type: exchange.connect, key.encrypt, key.access, etc.';
COMMENT ON COLUMN public.security_audit_log.metadata IS 'Additional context (no sensitive values)';

-- ============================================================
-- INDEXES
-- ============================================================

-- trades
CREATE INDEX idx_trades_user_id ON public.trades(user_id);
CREATE INDEX idx_trades_exchange_account_id ON public.trades(exchange_account_id);
CREATE INDEX idx_trades_traded_at ON public.trades(traded_at DESC);
CREATE INDEX idx_trades_symbol ON public.trades(symbol);
CREATE INDEX idx_trades_user_type ON public.trades(user_id, trade_type);
CREATE INDEX idx_trades_user_symbol ON public.trades(user_id, symbol);

-- pnl_snapshots
CREATE INDEX idx_pnl_snapshots_user_period ON public.pnl_snapshots(user_id, period_type, period_start);
CREATE INDEX idx_pnl_snapshots_exchange ON public.pnl_snapshots(exchange_account_id);

-- demo_trades
CREATE INDEX idx_demo_trades_user_id ON public.demo_trades(user_id);
CREATE INDEX idx_demo_trades_status ON public.demo_trades(user_id, status);
CREATE INDEX idx_demo_trades_opened_at ON public.demo_trades(user_id, opened_at DESC);
CREATE INDEX idx_demo_trades_symbol ON public.demo_trades(user_id, symbol);

-- chat
CREATE INDEX idx_chat_conversations_user ON public.chat_conversations(user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at);

-- exchange_accounts
CREATE INDEX idx_exchange_accounts_user ON public.exchange_accounts(user_id);
CREATE INDEX idx_exchange_accounts_active ON public.exchange_accounts(user_id, is_active) WHERE is_active = TRUE;

-- audit log
CREATE INDEX idx_audit_log_user ON public.security_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON public.security_audit_log(action, created_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create user profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update conversation updated_at when message is inserted
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnl_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- ----- users -----
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- ----- exchange_accounts -----
CREATE POLICY "ea_select_own" ON public.exchange_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ea_insert_own" ON public.exchange_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ea_update_own" ON public.exchange_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ea_delete_own" ON public.exchange_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- ----- api_keys (NO client access - service_role only) -----
CREATE POLICY "api_keys_no_client_access" ON public.api_keys
  FOR ALL USING (FALSE);

-- ----- trades -----
CREATE POLICY "trades_select_own" ON public.trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "trades_insert_own" ON public.trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "trades_delete_own" ON public.trades
  FOR DELETE USING (auth.uid() = user_id);

-- ----- pnl_snapshots -----
CREATE POLICY "pnl_select_own" ON public.pnl_snapshots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "pnl_insert_own" ON public.pnl_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pnl_update_own" ON public.pnl_snapshots
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "pnl_delete_own" ON public.pnl_snapshots
  FOR DELETE USING (auth.uid() = user_id);

-- ----- demo_trades -----
CREATE POLICY "demo_select_own" ON public.demo_trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "demo_insert_own" ON public.demo_trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "demo_update_own" ON public.demo_trades
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "demo_delete_own" ON public.demo_trades
  FOR DELETE USING (auth.uid() = user_id);

-- ----- chat_conversations -----
CREATE POLICY "conv_select_own" ON public.chat_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "conv_insert_own" ON public.chat_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "conv_update_own" ON public.chat_conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "conv_delete_own" ON public.chat_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- ----- chat_messages -----
CREATE POLICY "msg_select_own" ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_insert_own" ON public.chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "msg_delete_own" ON public.chat_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id
      AND user_id = auth.uid()
    )
  );

-- ----- security_audit_log (append-only for users, read-only) -----
CREATE POLICY "audit_select_own" ON public.security_audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- No user insert policy - only service_role can insert audit logs

-- ============================================================
-- STORAGE BUCKETS (via Supabase Dashboard or API)
-- ============================================================

-- Run via Supabase Storage API or Dashboard:
/*
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE);

-- Policy: authenticated user can upload to their own folder
CREATE POLICY "avatar_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatar_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatar_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public read for all avatars
CREATE POLICY "avatar_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
*/

-- ============================================================
-- SEED DATA (Development only)
-- ============================================================

-- DO NOT run in production
/*
-- Test user (corresponds to a real auth.users entry)
INSERT INTO public.users (id, email, display_name, demo_balance, onboarding_completed)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@example.com',
  'Test Trader',
  10000,
  true
);
*/
```

---

## Table Summary

| Table | Rows (est.) | Purpose |
|---|---|---|
| `users` | = auth.users | User profiles |
| `exchange_accounts` | ~5 per user | Exchange connections |
| `api_keys` | 1:1 with exchange_accounts | Encrypted credentials |
| `trades` | 100–100,000 per user | Historical trade records |
| `pnl_snapshots` | ~50 per user | Pre-computed PNL aggregates |
| `demo_trades` | ~500 per user | Paper trading orders |
| `chat_conversations` | ~100 per user | AI chat threads |
| `chat_messages` | ~2,000 per user | AI chat messages |
| `security_audit_log` | ~1,000 per user | Security events |

## Column Type Decisions

| Pattern | Type | Reason |
|---|---|---|
| IDs | `UUID` | Globally unique, unpredictable |
| Financial amounts | `NUMERIC(28,10)` | Avoid floating-point precision loss |
| Win rate | `NUMERIC(5,2)` | Max 100.00%, 2 decimal |
| Timestamps | `TIMESTAMPTZ` | Always UTC with timezone info |
| Exchange name | `TEXT` with CHECK | Constrained to valid values |
| IP addresses | `INET` | PostgreSQL IP type with validation |
| Raw exchange data | `JSONB` | Flexible, indexed |
| Boolean flags | `BOOLEAN NOT NULL DEFAULT` | Explicit default, never NULL |

## Security Architecture Summary

```
+─────────────────────────────────────────────────+
│ Client (Browser)                                  │
│  ✓ Can access: own user, exchange_accounts,       │
│    trades, pnl_snapshots, demo_trades,             │
│    chat_conversations, chat_messages               │
│  ✗ Cannot access: api_keys (blocked by RLS)        │
+────────────────────┬────────────────────────────+
                     │ JWT (RLS enforced)
+────────────────────▼────────────────────────────+
│ Supabase Database (PostgreSQL)                    │
│  RLS policies: user sees only own data            │
│  api_keys: no policy = no client access           │
+────────────────────┬────────────────────────────+
                     │ service_role key (bypasses RLS)
+────────────────────▼────────────────────────────+
│ Supabase Edge Functions (Deno)                    │
│  ✓ Can access: api_keys (service_role)            │
│  ✓ Decrypt API keys using ENCRYPTION_MASTER_KEY   │
│  ✓ Call exchange APIs with decrypted keys         │
│  ✓ Write to trades, pnl_snapshots                 │
+─────────────────────────────────────────────────+
```
