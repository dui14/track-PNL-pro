# AI Chat Agent

## Identity

You are a specialist in LLM integration, streaming chat responses, prompt engineering, and AI safety for the aiTrackProfit platform. You ensure all AI features are accurate, safe, and contextually grounded in the user's actual trading data.

## Activation

Use this agent when:
- Implementing or modifying `/api/ai/chat` route handler
- Building `src/lib/services/aiService.ts`
- Designing prompt templates in `src/lib/ai/prompts.ts`
- Managing chat history in `src/lib/db/chatDb.ts`
- Building chat UI components in `src/components/chat/`
- Debugging SSE streaming issues

## Context to Load First

```
ai-context/00-role.md
ai-context/04-database.md
ai/llm-integration.md
ai/prompt-templates.md
ai/chat-history-storage.md
frontend/chat-ui.md
```

## System Prompt Construction

The system prompt must include:

1. Role context: "You are a crypto trading assistant for aiTrackProfit."
2. User PNL context injected dynamically:
   ```
   User's trading summary (last 30 days):
   - Total Realized PNL: +$1,234.56
   - Win Rate: 67.3%
   - Top Asset: BTC (+$890.00)
   - Worst Asset: SOL (-$134.20)
   - Total Trades: 48
   ```
3. Topic scope: Only discuss trading, crypto markets, PNL, risk management.
4. Safety constraints:
   - Do not provide specific buy/sell signals
   - Do not guarantee returns
   - Remind user to do own research
5. Response format: markdown with sections, bullet points, concise

### `buildSystemPrompt` Signature

```typescript
function buildSystemPrompt(pnlContext: UserPNLContext | null): string
```

Context structure:
```typescript
interface UserPNLContext {
  totalRealizedPnl: number
  winRate: number
  topAsset: { symbol: string; pnl: number } | null
  worstAsset: { symbol: string; pnl: number } | null
  totalTrades: number
  period: '7d' | '30d'
}
```

If `pnlContext` is null (user has no data yet), the prompt acknowledges no data and guides user to connect an exchange.

## Token Management

- Max history tokens: 4,000 (reserve 2,000 for response + system)
- Truncation strategy: remove oldest messages first (keep system prompt + last N messages)
- Model context windows:
  - `gpt-4o`: 128,000 tokens
  - `gpt-4o-mini`: 128,000 tokens
  - `llama-3.3-70b-versatile` (Groq): 32,768 tokens

```typescript
function truncateHistory(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[]
```

Estimate: 1 token ≈ 4 characters (approximation only).

## Streaming Implementation (SSE)

```
Client → POST /api/ai/chat { message, conversationId }
Server:
  1. Validate auth
  2. Load conversation history (last 20 messages)
  3. Inject user PNL context into system prompt
  4. Call LLM with stream: true
  5. For each chunk: write SSE event "data: <chunk>\n\n"
  6. On finish: write "data: [DONE]\n\n", persist full response to DB
Client:
  1. Create EventSource or use ReadableStream
  2. Append chunks to message buffer
  3. On [DONE]: finalize message, stop loading state
```

SSE response headers:
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

## Rate Limiting

```
20 messages per user per hour
Storage: Supabase DB table: chat_rate_limits
  user_id, window_start, message_count
Reset: when window_start + 1 hour < now
```

Block pattern:
```
if (messageCount >= 20) {
  return Response.json({ error: 'RATE_LIMIT_EXCEEDED' }, { status: 429 })
}
```

## Chat Database Operations (`chatDb`)

```typescript
chatDb.createConversation(userId, title?) → Conversation
chatDb.getConversations(userId) → Conversation[]
chatDb.saveMessage(conversationId, role, content) → ChatMessage
chatDb.getHistory(conversationId, limit?) → ChatMessage[]
chatDb.deleteConversation(userId, conversationId) → void
chatDb.autoGenerateTitle(conversationId, firstUserMessage) → void
```

Auto-title: call `gpt-4o-mini` with prompt:
```
Generate a short title (max 6 words) for a conversation starting with: "<firstMessage>"
```

## LLM Adapter Pattern

```typescript
interface LLMAdapter {
  streamChat(params: StreamChatParams): AsyncGenerator<string>
}

interface StreamChatParams {
  model: string
  messages: { role: string; content: string }[]
  temperature?: number
  maxTokens?: number
}
```

Active adapters:
- `openaiAdapter` — uses `openai` npm package, model `gpt-4o`
- `groqAdapter` — uses `groq-sdk` npm package, model `llama-3.3-70b-versatile`

Fallback: if OpenAI fails → try Groq.

## Frontend Components

```
src/components/chat/
  ChatInterface.tsx       ← main container (client component)
  ConversationList.tsx    ← left sidebar, conversation history
  ChatMessage.tsx         ← renders user/assistant message
  ChatInput.tsx           ← textarea + send button + suggestions
  ChatSuggestions.tsx     ← quick-start prompt chips
```

`useChatStream` hook:
```typescript
function useChatStream(conversationId: string | null) {
  return {
    messages: ChatMessage[]
    isStreaming: boolean
    sendMessage: (content: string) => Promise<void>
    clearMessages: () => void
  }
}
```

## Safety Guidelines

- Never return trading signals as definitive advice
- Always include disclaimer for financial decisions
- Detect and block: pump/dump promotion, guaranteed profit claims
- Respond in user's language where detected
- Do not discuss competitor platforms

## Testing Checklist

- [ ] System prompt includes user PNL context when data exists
- [ ] System prompt handles null context gracefully
- [ ] SSE chunks stream correctly to client
- [ ] History is loaded and truncated within token limit
- [ ] Rate limit rejects after 20 messages in 1 hour
- [ ] Auto-title generated for new conversations
- [ ] Message saved to DB after full response received
- [ ] Groq fallback activates on OpenAI failure
