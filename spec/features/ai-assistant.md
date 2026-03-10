# Feature Specification: AI Ask Assistant

## Overview

Module AI Assistant cung cấp giao diện chat giống ChatGPT cho phép users hỏi các câu hỏi về trading, phân tích thị trường, và giải thích PNL. LLM API trả về kết quả dạng streaming (SSE). Toàn bộ lịch sử chat được lưu và phân loại theo conversation, cho phép user quay lại tiếp tục cuộc trò chuyện trước đó.

## Goals

- Cung cấp AI assistant chuyên về crypto trading
- Streaming responses để trải nghiệm tốt hơn (không chờ full response)
- Lưu trữ lịch sử chat theo conversation
- Hỗ trợ nhiều conversations độc lập per user
- Context-aware: AI có thể tham chiếu conversation history
- Responsive chat UI trên desktop và mobile

## User Stories

| ID | As a | I want to | So that |
|---|---|---|---|
| US-AI-001 | Trader | Hỏi AI về chiến lược trading | Học hỏi và cải thiện |
| US-AI-002 | Trader | Nhận response streaming | Không chờ toàn bộ câu trả lời |
| US-AI-003 | Trader | Tiếp tục conversation cũ | Không mất context |
| US-AI-004 | Trader | Tạo conversation mới | Bắt đầu chủ đề khác |
| US-AI-005 | Trader | Xem danh sách tất cả conversations | Tìm lại cuộc trò chuyện cũ |
| US-AI-006 | Trader | Xóa conversation không cần | Quản lý lịch sử chat |
| US-AI-007 | Trader | AI hiểu context của conversation | Nhận câu trả lời liên quan |
| US-AI-008 | Trader | Hỏi về PNL của mình | Nhận analysis cá nhân hóa |

## Functional Requirements

### FR-AI-001: Chat Interface

- Input box ở dưới cùng (sticky), auto-resize khi nhiều text
- Submit bằng Enter (Shift+Enter để xuống dòng mới)
- Button "Send" disabled khi input rỗng hoặc đang stream
- Tin nhắn user hiển thị bên phải (bubble)
- Tin nhắn AI hiển thị bên trái (bubble)
- Markdown rendering cho AI responses: bold, code blocks, lists, tables
- Syntax highlighting cho code snippets
- Auto-scroll xuống khi có tin nhắn mới
- Copy button cho từng AI message

### FR-AI-002: Streaming Response (SSE)

- API endpoint trả về `text/event-stream`
- Client nhận và render từng token khi đến
- Typing indicator trong khi stream đang chạy
- Nếu stream bị ngắt giữa chừng: hiển thị partial message với "[interrupted]" notification
- User có thể stop stream bằng button "Stop generating"
- Sau khi stream kết thúc: lưu full message vào database

SSE Event format:
```
data: {"type":"delta","content":"Hello"}
data: {"type":"delta","content":" world"}
data: {"type":"done","tokens_used":150}
data: [DONE]
```

### FR-AI-003: Conversation Management

**Tạo conversation mới:**
- User click "+ New Chat" hoặc gửi tin nhắn đầu tiên khi chưa có conversation
- `conversationId = null` trong request → server tạo conversation mới
- Title tự động generate từ tin nhắn đầu tiên (first 50 ký tự)

**Tiếp tục conversation cũ:**
- User chọn conversation từ sidebar
- Load messages history (max 50 tin nhắn gần nhất)
- Append context vào LLM prompt

**Conversation list:**
- Hiển thị trong sidebar (collapsible)
- Sắp xếp theo `updated_at DESC`
- Hiển thị: title, timestamp relative ("2 hours ago")
- Lazy load (infinite scroll) khi nhiều conversations

### FR-AI-004: Context-Aware Responses

**System Prompt:**
```
You are an expert crypto trading assistant helping users of aiTrackProfit platform.
You specialize in: technical analysis, risk management, PNL interpretation, and trading strategies.
Be concise, informative, and practical. Use data when available.
Current date: {current_date}
```

**User context injection (optional):**
- Nếu user hỏi về PNL của mình, system có thể inject PNL summary vào context
- Format: `User's trading stats: Total PNL: $1250, Win Rate: 68%, Last 30 days`
- Chỉ inject khi user explicitly hỏi về account của mình

**Conversation history:**
- Gửi tối đa 10 tin nhắn gần nhất (user + assistant) vào LLM context
- Truncate nếu vượt quá token limit

### FR-AI-005: LLM Provider Integration

- Primary provider: OpenAI GPT-4o-mini (cost-effective)
- Fallback provider: Groq (faster, cheaper)
- Provider được cấu hình qua env vars
- Streaming supported cho cả hai providers
- Token tracking: lưu `tokens_used` cho mỗi message

**LLM Request format (OpenAI compatible):**
```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {"role": "system", "content": "<system_prompt>"},
    {"role": "user", "content": "What is RSI?"},
    {"role": "assistant", "content": "RSI stands for..."},
    {"role": "user", "content": "How do I use it?"}
  ],
  "stream": true,
  "max_tokens": 1000,
  "temperature": 0.7
}
```

### FR-AI-006: Delete Conversation

- Xóa conversation kéo theo xóa tất cả messages (cascade)
- Confirmation dialog trước khi xóa
- Nếu xóa conversation đang active: redirect sang "New Chat" state

## Non-Functional Requirements

- Streaming bắt đầu hiển thị trong vòng < 2 giây sau khi submit
- Chat history load < 1 giây
- Conversation list load < 500ms
- LLM response timeout: 30 giây (sau đó return error)
- Tối đa 100 conversations per user (oldest auto-archived sau 100)
- Tối đa 1000 messages per conversation
- Rate limiting: 20 messages per phút per user
- LLM API key được lưu trong server env, không bao giờ expose ra client

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| LLM API bị lỗi / timeout | Hiển thị "AI service unavailable, please try again" |
| Stream bị ngắt giữa chừng | Lưu partial response, hiển thị [interrupted] |
| User gửi message rất dài (>5000 chars) | Truncate input, warning "Message too long" |
| Token limit vượt quá (context quá dài) | Trim oldest messages từ context |
| LLM trả về nội dung không phù hợp | Content filtering layer ở server |
| User xóa conversation đang stream | Cancel stream, xóa conversation |
| Nhiều tab mở cùng lúc | Sessions độc lập, không conflict |
| Rate limit LLM API | Queue request, hiển thị "Please wait..." |
| Network offline khi stream | Hiển thị error, enable "Retry" button |

## Data Models

### chat_conversations
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
```sql
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  tokens_used     INT,
  model_used      TEXT,
  is_partial      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`is_partial = true` khi message bị interrupted khi đang stream.

### Indexes
```sql
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
```

## API Endpoints

### POST /api/ai/chat

Gửi tin nhắn và nhận streaming response.

Request:
```json
{
  "conversationId": "uuid or null",
  "message": "What is my win rate this month?",
  "includeUserContext": false
}
```

Validation:
- `message`: string, 1-5000 ký tự
- `conversationId`: UUID hoặc null
- `includeUserContext`: boolean (optional, default false)

Response: `Content-Type: text/event-stream`
```
data: {"type":"conversation_id","id":"uuid"}
data: {"type":"delta","content":"Your"}
data: {"type":"delta","content":" win rate"}
data: {"type":"delta","content":" this month is 68.5%"}
data: {"type":"done","tokens_used":150,"model":"gpt-4o-mini"}
data: [DONE]
```

Error response (non-streaming, nếu validate thất bại):
```json
{
  "success": false,
  "data": null,
  "error": "VALIDATION_ERROR"
}
```

### GET /api/ai/conversations

Danh sách conversations của user.

Query params:
- `page`: number (default: 1)
- `limit`: number (default: 20)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Trading strategy questions",
      "created_at": "2026-03-07T08:00:00Z",
      "updated_at": "2026-03-07T10:00:00Z",
      "message_count": 12
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5 },
  "error": null
}
```

### GET /api/ai/conversations/:id/messages

Lấy messages của một conversation.

Query params:
- `page`: number (default: 1)
- `limit`: number (default: 50)

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "role": "user",
      "content": "What is RSI?",
      "created_at": "2026-03-07T08:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "RSI (Relative Strength Index) is...",
      "tokens_used": 120,
      "created_at": "2026-03-07T08:00:05Z"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 12 },
  "error": null
}
```

### DELETE /api/ai/conversations/:id

Xóa conversation và tất cả messages.

Response:
```json
{
  "success": true,
  "data": { "deleted": true },
  "error": null
}
```

### PATCH /api/ai/conversations/:id

Cập nhật title của conversation.

Request:
```json
{ "title": "New conversation title" }
```

Response:
```json
{
  "success": true,
  "data": { "id": "uuid", "title": "New conversation title" },
  "error": null
}
```

## UI Components

### Pages
- `/ask` — `AIAssistantPage`

### Layout
- `AIChatLayout` — Sidebar (conversations list) + Main (chat area)
- `ConversationSidebar` — Collapse/expand, conversation list, new chat button

### Chat
- `ChatContainer` — Main chat area, scroll container
- `MessageList` — List của messages
- `UserMessage` — Message bubble (user side)
- `AssistantMessage` — Message bubble với markdown rendering
- `StreamingMessage` — Message đang stream với blinking cursor
- `TypingIndicator` — Dots animation khi AI đang respond
- `MessageActions` — Copy button, timestamp

### Input
- `ChatInputArea` — Sticky bottom input
- `ChatInput` — Auto-resize textarea
- `SendButton` — Submit button
- `StopStreamButton` — Cancel stream button

### Sidebar
- `ConversationList` — Infinite scroll list
- `ConversationItem` — Clickable item với title, timestamp
- `NewChatButton` — "+ New Chat" button
- `DeleteConversationButton` — Xóa conversation

### States
- `ChatEmptyState` — Gợi ý câu hỏi khi chat chưa có messages
- `ChatErrorState` — Error message với retry
- `LoadingMessages` — Skeleton khi load conversation history

## Sequence Flow

### Send Message (Streaming)

```
User           ChatInput        API Route         LLM Service       Database
 |                 |                |                  |               |
 |-- Type msg ---->|               |                  |               |
 |-- Press send -->|               |                  |               |
 |                 |-- POST /api/ai/chat (SSE) -->     |               |
 |                 |               |-- Auth check     |               |
 |                 |               |-- Load history ->|               |
 |                 |               |   (if conv exists|               |
 |                 |               |-- Save user msg->|               |
 |                 |               |-- Build prompt   |               |
 |                 |               |-- Stream req ---->|               |
 |                 |               |                  |-- LLM API --->|
 |                 |<-- SSE delta --|<- stream tokens--|               |
 |<-- Render token |               |                  |               |
 |                 |               |-- [DONE] received|               |
 |                 |               |-- Save asst msg->|               |
 |                 |               |-- Update conv updated_at ------->|
 |<-- Done --------|               |                  |               |
```

### Load Conversation

```
User         ConversationItem     API Route         Database
 |                  |                 |               |
 |-- Click conv --->|                 |               |
 |                  |-- GET /api/ai/conversations/:id/messages -->
 |                  |                |-- Auth check  |               |
 |                  |                |-- Query msgs->|               |
 |                  |                |<-- messages ---|               |
 |                  |<-- 200 OK ------|               |               |
 |<-- Render history|                |               |               |
```

## Security Considerations

- **LLM API Key Protection**: Key chỉ tồn tại trong server-side env vars, không bao giờ gửi xuống client
- **Content Moderation**: Implement basic prompt injection defense trong system prompt
- **User Isolation**: RLS đảm bảo user chỉ đọc conversations của mình
- **Rate Limiting**: 20 messages/phút/user để prevent API cost abuse
- **Input Sanitization**: Validate và truncate user messages, không allow HTML
- **Conversation Ownership**: Validate `user_id` sở hữu `conversation_id` trước mỗi operation
- **Token Limit Control**: Enforce `max_tokens` để tránh runaway costs
- **Prompt Injection Defense**: System prompt được build server-side, user input không thể override system role
- **PNL Data Privacy**: Chỉ inject user PNL data khi user explicitly opt-in (`includeUserContext: true`)
- **SSE Security**: Response headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no`
