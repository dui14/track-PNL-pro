# Product Definition

## Product Name

aiTrackProfit

## Product Vision

A unified web platform that gives crypto traders a single dashboard to track their PNL across multiple centralized exchanges, simulate trades without risk, and consult an AI assistant for market insights and strategy feedback.

## Target Users

| Segment | Pain Point | Solution |
|---|---|---|
| Multi-exchange traders | PNL scattered across apps | Unified PNL dashboard |
| DeFi + CEX users | No aggregated view | Portfolio aggregation |
| Retail traders (Binance, OKX, Bybit) | Manual P&L tracking | Automated PNL sync |
| Beginner traders | No safe testing ground | Demo trading simulator |
| Strategy researchers | No quick AI feedback | Ask AI module |

## Core Product Modules

### 1. Dashboard

Purpose: Aggregate and visualize trading performance across exchanges.

Features:
- Connect exchange accounts using read-only API keys
- Supported exchanges: Binance, OKX, Bybit, Bitget, MEXC
- Fetch closed trade history via exchange REST APIs
- Calculate realized PNL per trade and aggregated over time
- Display:
  - Total PNL (all-time)
  - Win rate (% profitable trades)
  - Total trade count
  - Daily / Weekly / Monthly / Yearly PNL
- PNL trend chart (line/bar chart via Recharts)
- Portfolio balance overview per exchange
- Aggregated total balance in USD equivalent
- Time filter: Day / Week / Month / Year

### 2. Demo Trading

Purpose: Paper trading environment for strategy simulation.

Features:
- TradingView chart widget embedded (free embed)
- Real-time price via Binance WebSocket public streams
- Simulated order placement: Market / Limit orders
- Order panel: Buy / Sell, Quantity, Price
- Open orders list
- Trade history for demo orders
- Simulated PNL calculated on demo close
- Virtual balance initialized per user (e.g., 10,000 USDT)

### 3. Ask AI

Purpose: AI assistant for trading insights and education.

Features:
- Chat interface similar to ChatGPT
- Users ask questions about:
  - Market analysis
  - Trading strategies
  - PNL interpretation
  - Risk management
- LLM API integration (OpenAI / Groq / Anthropic)
- Streaming responses (Server-Sent Events)
- Conversation history stored per user in database
- Ability to reload and continue previous conversations
- Conversation list in sidebar

### 4. User Profile

Purpose: Account management and exchange key administration.

Features:
- Update display name and email
- Change password (email/password accounts)
- Upload avatar (stored in Supabase Storage)
- Manage connected exchange API keys:
  - Add new exchange connection
  - View active connections
  - Delete / disable connection
- Enable / disable per-exchange sync

## Authentication

- Google OAuth (via Supabase Auth)
- Email + Password (via Supabase Auth)
- Session management via Supabase JWT tokens
- Protected routes server-side via Next.js middleware

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Page load time | < 2 seconds |
| API response time | < 1 second for cached data |
| Exchange sync frequency | On demand + background job |
| AI response latency | Streaming, first token < 1s |
| Security | OWASP Top 10 compliant |
| Mobile responsiveness | Breakpoints at 768px, 1024px |
| Uptime | 99.5% (Supabase + Vercel SLA) |

## Constraints

- No withdrawal permissions requested from exchange APIs
- No order execution on live exchanges (read-only)
- API keys must never appear in frontend bundles
- LLM usage must be bounded (rate limit per user)
- Free TradingView widget only (no paid commercial license)
