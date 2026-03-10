# UI Prompt: AI Ask Assistant

## Context

Module chat AI chuyên về crypto trading. Giao diện giống ChatGPT nhưng styled theo dark theme của aiTrackProfit. Hỗ trợ streaming responses, markdown rendering, conversation history sidebar, và multiple conversations.

## Design Direction

- Dark chat interface: bg `zinc-950`, message bubbles `zinc-800` (user) và `zinc-900` (AI)
- Accent: `emerald-500` cho elements chính
- AI identity: subtle bot icon `zinc-400`, không màu mè
- User bubble: bg `emerald-900` border `emerald-800`, căn phải
- Streaming indicator: animated dots hoặc cursor block
- Typography: prose cho AI responses — readable line-height, code blocks styled

## Layout

```
+-------------------+------------------------------------------+
|  Conversation     |  Chat Header (conversation title)        |
|  Sidebar          +------------------------------------------+
|  + New Chat       |                                          |
|  ─────────────    |  Messages Area (scrollable)              |
|  Today            |                                          |
|  Yesterday        |                                          |
|  Older...         |                                          |
|                   +------------------------------------------+
|                   |  Input Bar (sticky bottom)               |
+-------------------+------------------------------------------+
```

Desktop: sidebar `w-64` fixed, chat area flexible
Mobile: sidebar hidden → accessible via hamburger/drawer

## Components

### Conversation Sidebar

- bg `zinc-900`, border-r `zinc-800`
- Header: logo small + "Ask AI" title
- Button "+ New Chat" — full width, dashed border `zinc-700`, icon `Plus`, text `zinc-400`, hover bg `zinc-800`
- Separator
- Conversation list với infinite scroll:
  - Group by date: "Today", "Yesterday", "This week", "Older"
  - Mỗi conversation item:
    - Truncated title (max 1 line)
    - Relative timestamp: "2h ago", "Yesterday"
    - Hover: bg `zinc-800`, hiện action buttons
    - Active: bg `zinc-800` border-l `emerald-500 w-1`
    - Actions on hover: icon `Pencil` (rename), icon `Trash2` (delete) — appear on right
- Delete confirmation: inline popover nhỏ "Delete this conversation?"
- Loading: skeleton items khi load

### Chat Header

- Sticky top, bg `zinc-900` border-b `zinc-800`
- Left: icon `Bot` (`emerald-400`) + conversation title (editable inline on click)
- Right: button `MoreHorizontal` → dropdown (Rename, Delete, Export — optional)

### Messages Area

Container: `overflow-y-auto`, padding `px-4 py-6`, max-width message `max-w-3xl mx-auto`

**User Message**:
- Căn phải
- Bubble: bg `emerald-900` border `emerald-800`, rounded-2xl, rounded-br-sm
- Avatar: initial của user hoặc avatar image, 32px
- Timestamp nhỏ bên dưới bubble

**AI Message**:
- Căn trái
- Icon `Bot` 32px bg `zinc-800` rounded-full
- Content area: bg `zinc-900` rounded-2xl rounded-bl-sm, padding `p-4`
- Markdown rendered:
  - Headings: bold, larger
  - Paragraphs: line-height 1.7
  - `code inline`: bg `zinc-800` rounded px-1 font-mono text-sm `emerald-300`
  - Code block: bg `zinc-950` rounded-lg, header bar với language label + copy button
  - Lists: bullet/numbered với proper indentation
  - Tables: styled table với border `zinc-700`
  - Bold, italic support
- Action row dưới mỗi AI message (hover để hiện):
  - `Copy` button (icon `Copy`, text "Copy")
  - `ThumbsUp` / `ThumbsDown` (optional feedback)

**Streaming State**:
- AI bubble đang stream: cursor block `|` nhấp nháy ở cuối text
- Typing indicator (trước khi text đến): 3 dot animation bg `emerald-500`

**Interrupted Message**:
- Badge nhỏ "Interrupted" `zinc-500` ở cuối message

**Empty State** (conversation mới):
- Centered, giữa màn hình
- Icon `Bot` lớn 64px màu `zinc-600`
- Heading "Ask me anything about trading"
- 4 suggestion chips:
  - "Explain Relative Strength Index (RSI)"
  - "What is a good risk-reward ratio?"
  - "Interpret my recent trading performance"
  - "How to set proper stop-loss levels?"
- Chips: bg `zinc-800` border `zinc-700`, hover bg `zinc-700`, rounded-full

### Input Bar

- Sticky bottom, bg `zinc-950`, border-t `zinc-800`, padding `p-4`
- Max-width `max-w-3xl mx-auto`
- Container: bg `zinc-800` rounded-2xl border `zinc-700`, flex

Layout trong container:
- Left: `Textarea` auto-resize (min 1 row, max 6 rows), bg transparent, no border, placeholder "Ask anything about crypto trading..."
- Right bottom: action buttons row
  - "Stop generating" button (hiện khi đang stream): icon `Square` fill red, rounded-full
  - Send button: icon `ArrowUp` bg `emerald-500` rounded-full 32px, disabled (`zinc-700`) khi input rỗng
- Character hint dưới: "Shift+Enter for new line" — text `zinc-600` text-xs, hiện khi focused

**Sending state**: send button → spinner, input disabled

### Context Injection Indicator (optional)

Khi AI response dùng PNL data của user:
- Small badge ở đầu response: icon `Database` size-3 + "Using your trading data" — bg `zinc-800` text `zinc-400`

## Interactions

- Click suggestion chip → populate input + auto-submit
- Ctrl+Enter hoặc Enter (không Shift) → submit
- Click conversation sidebar item → load conversation, scroll to bottom
- Click conversation title → inline edit mode
- New chat → reset messages area, focus input
- Window resize → messages area reflows, input stays sticky

## Loading & Error States

- Conversation load: skeleton messages (alternating left/right)
- Send error: toast "Failed to send message. Try again."
- Stream error / timeout: AI bubble shows "Something went wrong. Please try again." với retry button
- Delete confirmation: inline popover (không dùng full dialog)

## Component Library

shadcn/ui: `Textarea`, `Button`, `Badge`, `ScrollArea`, `Separator`, `DropdownMenu`, `Popover`, `Tooltip`, `Skeleton`

Lucide: `Bot`, `Plus`, `Send`, `Copy`, `Trash2`, `Pencil`, `MoreHorizontal`, `ArrowUp`, `Square`, `Database`, `ThumbsUp`, `ThumbsDown`

Markdown: `react-markdown` + `rehype-highlight` cho syntax highlighting + `rehype-sanitize`

## File Structure Target

```
src/
  app/
    (dashboard)/
      ask-ai/
        page.tsx
        [conversationId]/page.tsx
  components/
    features/
      ai-chat/
        ConversationSidebar.tsx
        ConversationList.tsx
        ConversationItem.tsx
        ChatHeader.tsx
        MessagesArea.tsx
        UserMessage.tsx
        AIMessage.tsx
        MarkdownRenderer.tsx
        StreamingIndicator.tsx
        ChatInput.tsx
        SuggestionChips.tsx
        EmptyChatState.tsx
```
