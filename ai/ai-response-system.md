# AI Response System — aiTrackProfit

Tài liệu này mô tả toàn bộ kiến trúc chức năng **AI Response**, bao gồm:
1. **LLM API** (đã hoàn thành) — OpenRouter / OpenAI streaming
2. **RAG** (cần triển khai) — Retrieval-Augmented Generation với pgvector
3. **Tool cào data** (cần triển khai) — Live market data từ CoinGecko, CryptoCompare, ta.py

---

## Kiến trúc tổng quan

```
User Message
     │
     ▼
[API Route: POST /api/ai/chat]
     │  Auth + Rate Limit
     ▼
[aiService.ts] — startOrContinueChat()
     │
     ├──► [chatDb.ts]          Load/create conversation & history
     │
     ├──► [RAG Module]         → Tìm kiếm tài liệu liên quan (chưa có)
     │         └─ pgvector similarity search
     │
     ├──► [Tool Executor]      → Cào data thị trường real-time (chưa có)
     │         └─ CoinGecko / CryptoCompare API
     │
     └──► [llmAdapter.ts]      → OpenRouter SSE streaming
               └─ buildSystemPrompt() + RAG context + tool data
```

---

## 1. LLM API (✅ Đã xong)

### Stack hiện tại

| File | Vai trò |
|---|---|
| `src/lib/adapters/llmAdapter.ts` | Gọi OpenRouter API, stream SSE |
| `src/lib/services/aiService.ts` | Orchestrate chat flow |
| `src/lib/db/chatDb.ts` | Lưu/đọc conversation & messages |
| `src/app/api/ai/chat/route.ts` | Next.js API route |

### Provider đang dùng

**OpenRouter** — unified gateway cho nhiều LLM providers.

```
Base URL : https://openrouter.ai/api/v1/chat/completions
Model    : openai/gpt-4o-mini  (mặc định)
Stream   : true (Server-Sent Events)
Max Tokens: 2048
```

### Env vars (đã có)

```env
OPENROUTER_API_KEY=sk-or-v1-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Flow hiện tại

```
POST /api/ai/chat
  { message: string, conversationId?: string }

1. Xác thực user (Supabase Auth)
2. Tạo/load conversation
3. Load 20 messages gần nhất làm context
4. buildSystemPrompt() → inject PNL summary + exchange list
5. streamChatCompletion() → OpenRouter SSE
6. Save assistant response + tokens_used
7. Trả về ReadableStream (text/event-stream)
```

### System Prompt hiện tại

```
bạn là crypto trading analyst cho aiTrackProfit.
Context inject: monthly PNL, connected exchanges.
```

---

## 2. RAG — Retrieval-Augmented Generation (🚧 Cần triển khai)

RAG giúp AI trả lời chính xác hơn bằng cách tìm kiếm tài liệu liên quan
trước khi gửi prompt tới LLM. Phù hợp cho:

- Câu hỏi về trading strategies / FAQ
- Giải thích thuật ngữ crypto/DeFi
- Hỏi về cách hoạt động của từng sàn giao dịch

### 2.1 Setup pgvector trên Supabase

Chạy SQL sau trong **Supabase SQL Editor**:

```sql
-- Bật extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Bảng lưu documents cho RAG
CREATE TABLE IF NOT EXISTS ai_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  category    TEXT NOT NULL,        -- 'strategy' | 'glossary' | 'pnl_guide' | 'exchange'
  source_url  TEXT,
  embedding   vector(1536),         -- OpenAI text-embedding-3-small = 1536 dims
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index cho tìm kiếm vector
CREATE INDEX IF NOT EXISTS idx_ai_documents_embedding
  ON ai_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Function tìm kiếm tương đồng
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count     INT DEFAULT 5,
  min_similarity  FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id         UUID,
  title      TEXT,
  content    TEXT,
  category   TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    title,
    content,
    category,
    1 - (embedding <=> query_embedding) AS similarity
  FROM ai_documents
  WHERE 1 - (embedding <=> query_embedding) > min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

### 2.2 Tạo module RAG

**Tạo file:** `src/lib/services/ragService.ts`

```typescript
// src/lib/services/ragService.ts
import type { SupabaseClient } from '@supabase/supabase-js'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings'

// Hoặc dùng OpenRouter embedding (nếu có)
// const OPENROUTER_EMBED_URL = 'https://openrouter.ai/api/v1/embeddings'

type RagDocument = {
  id: string
  title: string
  content: string
  category: string
  similarity: number
}

/**
 * Tạo embedding vector cho một đoạn text
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set for embeddings')

  const response = await fetch(OPENAI_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000), // giới hạn input
    }),
  })

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`)
  }

  const data = await response.json()
  return data.data[0].embedding as number[]
}

/**
 * Tìm kiếm documents liên quan đến câu hỏi của user
 */
export async function retrieveRelevantDocs(
  supabase: SupabaseClient,
  query: string,
  matchCount = 3
): Promise<RagDocument[]> {
  try {
    const embedding = await createEmbedding(query)

    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_count: matchCount,
      min_similarity: 0.7,
    })

    if (error) {
      console.error('[ragService] match_documents error:', error)
      return []
    }

    return (data ?? []) as RagDocument[]
  } catch (err) {
    console.error('[ragService] retrieveRelevantDocs error:', err)
    return []
  }
}

/**
 * Tạo RAG context string để inject vào system prompt
 */
export function buildRagContext(docs: RagDocument[]): string {
  if (docs.length === 0) return ''

  const parts = docs.map((doc, i) =>
    `[Tài liệu ${i + 1}] ${doc.title}\n${doc.content}`
  )

  return `\n\nThông tin tham khảo từ knowledge base:\n${parts.join('\n\n---\n\n')}`
}

/**
 * Lưu document mới vào knowledge base
 */
export async function indexDocument(
  supabase: SupabaseClient,
  title: string,
  content: string,
  category: string,
  sourceUrl?: string
): Promise<void> {
  const embedding = await createEmbedding(`${title}\n${content}`)

  await supabase.from('ai_documents').upsert({
    title,
    content,
    category,
    source_url: sourceUrl ?? null,
    embedding,
    updated_at: new Date().toISOString(),
  })
}
```

### 2.3 Thêm env vars cho RAG

Trong `src/.env.local`:

```env
# Embedding (OpenAI text-embedding-3-small)
OPENAI_API_KEY=sk-...   # chỉ cho embedding, LLM vẫn dùng OpenRouter
```

> **Lưu ý:** Nếu muốn tránh dùng thêm OpenAI key, có thể dùng
> `Cohere embed-multilingual-v3.0` qua OpenRouter, nhưng cần đổi
> dimension còn 1024 và cập nhật lại bảng SQL.

### 2.4 Tích hợp RAG vào aiService.ts

Cập nhật `src/lib/services/aiService.ts`:

```typescript
// Thêm import
import { retrieveRelevantDocs, buildRagContext } from './ragService'

// Trong startOrContinueChat(), thêm trước khi gọi LLM:
const ragDocs = await retrieveRelevantDocs(supabase, message, 3)
const ragContext = buildRagContext(ragDocs)

// Thêm ragContext vào system prompt
const systemPrompt = buildSystemPrompt() + ragContext
const messages = [
  { role: 'system' as const, content: systemPrompt },
  ...history.filter((m) => m.role !== 'system').map(...)
]
```

### 2.5 Script nạp dữ liệu ban đầu vào knowledge base

**Tạo file:** `scripts/seed-knowledge-base.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { indexDocument } from '../src/lib/services/ragService'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DOCUMENTS = [
  {
    title: 'Win Rate là gì?',
    content: `Win Rate (tỷ lệ thắng) là phần trăm số giao dịch có lợi nhuận dương
so với tổng số giao dịch đã đóng. Công thức: Win Rate = (Số giao dịch lãi / Tổng giao dịch) × 100.
Win rate > 50% không đảm bảo lợi nhuận nếu lỗ trung bình lớn hơn lãi trung bình.
Nên kết hợp với Risk/Reward Ratio (RRR) >= 1:2 để đạt hiệu quả.`,
    category: 'glossary',
  },
  {
    title: 'Quản lý rủi ro cơ bản',
    content: `Nguyên tắc quản lý rủi ro cho crypto trader:
1. Không risk quá 1-2% tổng vốn cho một giao dịch
2. Luôn đặt Stop-Loss trước khi vào lệnh
3. Risk/Reward Ratio tối thiểu 1:2 (lời gấp đôi lỗ)
4. Không dùng đòn bẩy quá 5x khi mới bắt đầu
5. Không dùng toàn bộ vốn cho một coin`,
    category: 'strategy',
  },
  {
    title: 'Đòn bẩy (Leverage) trong Futures',
    content: `Leverage cho phép giao dịch với số tiền lớn hơn vốn thực tế.
Ví dụ: 10x leverage với $100 = position $1000.
Rủi ro: Thua lỗ cũng nhân lên 10x. Nếu giá giảm 10%, tài khoản mất toàn bộ (bị thanh lý).
Binance Futures hỗ trợ tối đa 125x, Bybit 100x.
Khuyến nghị: Dùng ≤5x khi chưa có kinh nghiệm.`,
    category: 'glossary',
  },
  {
    title: 'Cách đọc PNL trên aiTrackProfit',
    content: `Trên dashboard aiTrackProfit:
- Total PNL: Tổng lãi/lỗ đã thực hiện (Realized PNL) trong kỳ
- Win Rate: % giao dịch có lãi
- Best Trade: Giao dịch lãi nhất
- Worst Trade: Giao dịch lỗ nhất
- Trade Count: Số lượng giao dịch đã hoàn thành
PNL chỉ tính giao dịch đã đóng (Realized), không tính lãi/lỗ chưa chốt (Unrealized).`,
    category: 'pnl_guide',
  },
]

async function seed() {
  for (const doc of DOCUMENTS) {
    await indexDocument(supabase, doc.title, doc.content, doc.category)
    console.log(`✅ Indexed: ${doc.title}`)
  }
}

seed().catch(console.error)
```

---

## 3. Tool cào data thị trường (🚧 Cần triển khai)

AI có thể gọi "tools" để lấy data real-time trước khi trả lời.
Phù hợp cho: giá coin hiện tại, biến động 24h, volume, sentiment.

### 3.1 Tạo module data scraping

**Tạo file:** `src/lib/tools/marketDataTool.ts`

```typescript
// src/lib/tools/marketDataTool.ts

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

type CoinPrice = {
  id: string
  symbol: string
  name: string
  current_price: number
  price_change_percentage_24h: number
  market_cap: number
  total_volume: number
  high_24h: number
  low_24h: number
  last_updated: string
}

/**
 * Lấy giá + thống kê 24h của một danh sách coin từ CoinGecko (free tier)
 */
export async function getCoinPrices(
  coinIds: string[] // ví dụ: ['bitcoin', 'ethereum', 'binancecoin']
): Promise<CoinPrice[]> {
  const ids = coinIds.join(',')
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&price_change_percentage=24h`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      // Thêm API key nếu dùng CoinGecko Pro: 'x-cg-pro-api-key': process.env.COINGECKO_API_KEY
    },
    next: { revalidate: 60 }, // Cache 60s trong Next.js
  })

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Phát hiện coin symbols trong câu hỏi của user và map sang CoinGecko IDs
 */
export function extractCoinIds(message: string): string[] {
  const SYMBOL_TO_ID: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    BNB: 'binancecoin',
    SOL: 'solana',
    XRP: 'ripple',
    ADA: 'cardano',
    DOGE: 'dogecoin',
    AVAX: 'avalanche-2',
    DOT: 'polkadot',
    MATIC: 'matic-network',
    LINK: 'chainlink',
    UNI: 'uniswap',
    LTC: 'litecoin',
    ATOM: 'cosmos',
    NEAR: 'near',
    ARB: 'arbitrum',
    OP: 'optimism',
    SUI: 'sui',
  }

  const upper = message.toUpperCase()
  const found: string[] = []

  for (const [symbol, id] of Object.entries(SYMBOL_TO_ID)) {
    if (upper.includes(symbol)) {
      found.push(id)
    }
  }

  return [...new Set(found)].slice(0, 5) // max 5 coins
}

/**
 * Format data coin thành text để inject vào prompt
 */
export function formatCoinDataForPrompt(coins: CoinPrice[]): string {
  if (coins.length === 0) return ''

  const lines = coins.map((c) => {
    const change = c.price_change_percentage_24h?.toFixed(2) ?? 'N/A'
    const sign = Number(change) >= 0 ? '+' : ''
    return `- ${c.name} (${c.symbol.toUpperCase()}): $${c.current_price.toLocaleString()} | 24h: ${sign}${change}% | Vol: $${(c.total_volume / 1e6).toFixed(0)}M`
  })

  return `\n\nDữ liệu thị trường real-time (CoinGecko):\n${lines.join('\n')}`
}
```

### 3.2 Tích hợp Market Tool vào aiService.ts

```typescript
// Thêm import
import { extractCoinIds, getCoinPrices, formatCoinDataForPrompt } from '@/lib/tools/marketDataTool'

// Trong startOrContinueChat(), thêm trước khi gọi LLM:
let marketContext = ''
try {
  const coinIds = extractCoinIds(message)
  if (coinIds.length > 0) {
    const coins = await getCoinPrices(coinIds)
    marketContext = formatCoinDataForPrompt(coins)
  }
} catch (err) {
  console.warn('[aiService] Market data fetch failed:', err)
}

// Inject vào system prompt:
const systemPrompt = buildSystemPrompt() + ragContext + marketContext
```

### 3.3 Env vars cho Market Data

```env
# CoinGecko (optional - free tier không cần key)
COINGECKO_API_KEY=CG-...   # nếu dùng Pro plan (50 req/min thay vì 5-10)

# CryptoCompare (alternative nguồn data)
CRYPTOCOMPARE_API_KEY=...  # https://min-api.cryptocompare.com
```

### 3.4 Nguồn data thay thế / bổ sung

| Nguồn | Endpoint | Free Limit | Dùng cho |
|---|---|---|---|
| **CoinGecko** | `/coins/markets` | 5-10 req/min | Giá, volume, market cap |
| **CryptoCompare** | `/data/price` | 100K req/mo | OHLCV, sentiment |
| **Binance Public API** | `/api/v3/ticker/24hr` | Không giới hạn | Giá Binance real-time |
| **Bybit Public API** | `/v5/market/tickers` | Không giới hạn | Giá Bybit real-time |

---

## 4. Cập nhật llmAdapter.ts để hỗ trợ nhiều model

Thêm khả năng chọn model động:

```typescript
// src/lib/adapters/llmAdapter.ts — bổ sung

export const LLM_MODELS = {
  // Cân bằng chất lượng/giá
  DEFAULT: 'openai/gpt-4o-mini',
  // Chất lượng cao nhất
  PREMIUM: 'openai/gpt-4o',
  // Tốc độ cao, giá rẻ
  FAST: 'meta-llama/llama-3.3-70b-instruct',
  // Lý luận tốt
  REASONING: 'anthropic/claude-3-5-sonnet',
  // Hoàn toàn miễn phí
  FREE: 'google/gemini-flash-1.5',
} as const

// Cập nhật signature hàm để nhận model từ ngoài:
export async function streamChatCompletion(
  messages: LLMMessage[],
  onChunk: (chunk: StreamChunk) => void,
  model: string = LLM_MODELS.DEFAULT
): Promise<{ content: string; tokensUsed: number }> {
  // ...body JSON.stringify({ model, ... })
}
```

---

## 5. Cấu trúc file hoàn chỉnh sau khi triển khai

```
src/lib/
├── adapters/
│   └── llmAdapter.ts          ✅ Done
├── services/
│   ├── aiService.ts           ✅ Done → cần thêm RAG + tool injection
│   └── ragService.ts          🚧 Tạo mới
├── tools/
│   └── marketDataTool.ts      🚧 Tạo mới
└── db/
    └── chatDb.ts              ✅ Done

scripts/
└── seed-knowledge-base.ts     🚧 Tạo mới (1 lần)
```

---

## 6. Thứ tự triển khai đề xuất

### Bước 1 — Supabase pgvector (30 phút)
```
1. Chạy SQL setup pgvector trong Supabase SQL Editor
2. Thêm OPENAI_API_KEY vào .env.local
```

### Bước 2 — ragService.ts (1 giờ)
```
1. Tạo src/lib/services/ragService.ts
2. Chạy script seed knowledge base
3. Test tìm kiếm với vài câu hỏi mẫu
```

### Bước 3 — marketDataTool.ts (30 phút)
```
1. Tạo src/lib/tools/marketDataTool.ts
2. Test với các câu hỏi có chứa BTC, ETH...
```

### Bước 4 — Tích hợp vào aiService.ts (30 phút)
```
1. Thêm retrieveRelevantDocs() call
2. Thêm getCoinPrices() call
3. Inject context vào system prompt
4. Test end-to-end trên /ai-assistant
```

### Bước 5 — Tối ưu (tùy chọn)
```
1. Thêm caching cho market data (Redis hoặc Next.js cache)
2. Auto-index document khi admin upload FAQ mới
3. Thêm category filter cho RAG search
4. Monitoring token usage
```

---

## 7. Env vars tổng hợp

```env
# ============================================================
# LLM — ĐÃ CÓ
# ============================================================
OPENROUTER_API_KEY=sk-or-v1-...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ============================================================
# EMBEDDING cho RAG — CẦN THÊM
# ============================================================
OPENAI_API_KEY=sk-...           # chỉ dùng cho text-embedding-3-small

# ============================================================
# MARKET DATA — TÙY CHỌN (free tier không cần key)
# ============================================================
COINGECKO_API_KEY=CG-...        # nếu dùng Pro plan
CRYPTOCOMPARE_API_KEY=...       # nếu dùng CryptoCompare

# ============================================================
# CÁC BIẾN ĐÃ CÓ (không đổi)
# ============================================================
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_MASTER_KEY=...
GEMINI_API_KEY=...
```

---

## 8. Data flow hoàn chỉnh (sau khi triển khai)

```
User: "BTC đang ở mức nào? Và win rate của tôi tháng này thế nào?"
    │
    ▼
[aiService.startOrContinueChat()]
    │
    ├─ 1. Load conversation history (chatDb)
    │
    ├─ 2. RAG search: "BTC win rate tháng này"
    │      → match_documents() → tìm tài liệu về "Win Rate là gì?"
    │      → ragContext = "Win Rate là tỷ lệ..."
    │
    ├─ 3. Market Tool: detect "BTC" → getCoinPrices(['bitcoin'])
    │      → marketContext = "Bitcoin: $65,000 | 24h: +2.3%"
    │
    ├─ 4. buildSystemPrompt()
    │      → pnlContext = "Win rate: 62%, Total PNL: +$1,250"
    │      → exchangeContext = "Connected: binance, bybit"
    │
    └─ 5. LLM call (systemPrompt + ragContext + marketContext + history)
           → OpenRouter stream → SSE response
           → "Bitcoin hiện tại $65,000 (+2.3% 24h). Win rate tháng này của bạn 
              đạt 62%..."
```

---

## 9. Testing nhanh

```bash
# Test RAG embedding
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Win rate là gì?"}'

# Test market data
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Giá BTC hiện tại là bao nhiêu?"}'

# Test kết hợp
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "ETH đang ở đâu và tôi có nên đặt stop loss không?"}'
```
