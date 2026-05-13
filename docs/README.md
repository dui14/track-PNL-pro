# Track PNL Pro Documentation

A unified web platform enabling crypto traders to track PNL across multiple centralized exchanges, simulate risk-free trading, and receive strategic advice via an integrated AI assistant.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Supported Exchanges](#supported-exchanges)
- [Documentation](#documentation)

---

## Overview

Track PNL Pro addresses the challenge of fragmented trading data by aggregating PNL from multiple Centralized Exchanges (CEXs) into a single interface. The platform also provides a risk-free demo trading environment and an AI assistant powered by advanced LLMs.

**Target Audience:** Multi-exchange crypto traders (Binance, OKX, Bybit, Bitget, Gate.io) seeking automated PNL tracking, strategy simulation, and AI-driven market insights.

---

## Key Features

### Dashboard
- **Exchange Connectivity:** Connect accounts via read-only API keys.
- **Data Normalization:** Fetch and standardize closed trade history across supported exchanges.
- **PNL Calculation:** Calculate realized PNL per trade and aggregate by timeframes (Day / Week / Month / Year / All-time).
- **Performance Metrics:** Display win rate, total trade count, and portfolio balance per exchange.
- **PNL Calendar:** Heatmap calendar visualizing daily/monthly profits with historical navigation.
- **Visual Analytics:** PNL trend charts and data visualization via Recharts.
- **Unified Portfolio:** Total aggregated balance converted to USD equivalent.

### Demo Trading
- **Integrated Charts:** Embedded TradingView widget with live candlestick data.
- **Order Simulation:** Support for Market and Limit orders in a sandbox environment.
- **Position Management:** Real-time Open Positions dashboard with one-click closing.
- **Historical Logs:** Detailed Order History and Trade History with realized PNL.
- **Virtual Capital:** Default initial balance of 10,000 USDT per user.
- **Fee Simulation:** Realistic PNL calculation including a 0.1% simulated trading fee.
- **Data Persistence:** All simulated activities are synchronized with the database.

### Ask AI
- **Conversational Interface:** Specialized chat for trading queries, strategy analysis, and PNL interpretation.
- **Real-time Streaming:** Low-latency responses powered by Server-Sent Events (SSE).
- **LLM Integration:** Compatible with OpenAI, Groq, and Anthropic models.
- **Context Management:** Full conversation history with a sidebar for session management.

### User Profile
- **Account Settings:** Update display name, email, and avatar (hosted on Supabase Storage).
- **Security:** Password management for email-based accounts.
- **API Management:** CRUD operations for connected exchange API keys.
- **Sync Control:** Toggle automated data synchronization for individual exchanges.

### Authentication
- **OAuth Integration:** Google OAuth via Supabase Auth.
- **Standard Auth:** Email/Password authentication via Supabase Auth.
- **Session Handling:** Secure session management via Supabase JWT tokens.
- **Route Protection:** Server-side route enforcement via Next.js middleware.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 (Strict Mode) |
| Styling | TailwindCSS 3 |
| Charts | Recharts 2 + TradingView Widget |
| Forms | React Hook Form 7 + Zod 3 |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Hosting | Render |
| Package Manager | pnpm |

---

## Supported Exchanges

| Exchange | Trade History | Balance |
|---|---|---|
| Binance | REST API | REST API |
| OKX | REST API | REST API |
| Bybit | REST API | REST API |
| Bitget | REST API | REST API |
| Gate.io | REST API | REST API |

> [!IMPORTANT]
> All exchange API keys must be set to **read-only**. For security reasons, withdrawal permissions must not be enabled.

---

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Exchange Integration Research: `docs/deep-research-report.md` (Technical guide on utilizing REST APIs from various crypto exchanges)