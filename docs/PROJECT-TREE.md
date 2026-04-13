# Project Tree

Cay thu muc du an:

```text
track-PNL-pro/
|-- .vscode/
|   `-- mcp.json
|-- database/
|   |-- schema.md
|   `-- schema.sql
|-- docs/
|   |-- ARCHITECTURE.md
|   |-- deep-research-report.md
|   |-- PROJECT-TREE.md
|   |-- README.md
|   |-- REPORT-OUTLINE.md
|   `-- SETUP.md
|-- src/
|   |-- app/
|   |   |-- (app)/
|   |   |   |-- ai-assistant/
|   |   |   |   `-- page.tsx
|   |   |   |-- dashboard/
|   |   |   |   `-- page.tsx
|   |   |   |-- demo-trading/
|   |   |   |   `-- page.tsx
|   |   |   |-- exchange/
|   |   |   |   `-- page.tsx
|   |   |   |-- profile/
|   |   |   |   `-- page.tsx
|   |   |   `-- layout.tsx
|   |   |-- (auth)/
|   |   |   |-- login/
|   |   |   |   `-- page.tsx
|   |   |   |-- register/
|   |   |   |   `-- page.tsx
|   |   |   `-- layout.tsx
|   |   |-- api/
|   |   |   |-- ai/
|   |   |   |   |-- chat/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- conversations/
|   |   |   |   |   |-- [id]/
|   |   |   |   |   |   |-- messages/
|   |   |   |   |   |   |   `-- route.ts
|   |   |   |   |   |   `-- route.ts
|   |   |   |   |   `-- route.ts
|   |   |   |   `-- models/
|   |   |   |-- auth/
|   |   |   |   |-- account/
|   |   |   |   |   `-- route.ts
|   |   |   |   `-- callback/
|   |   |   |       `-- route.ts
|   |   |   |-- chat/
|   |   |   |   `-- route.ts
|   |   |   |-- demo/
|   |   |   |   |-- order/
|   |   |   |   |   |-- [id]/
|   |   |   |   |   |   `-- close/
|   |   |   |   |   |       `-- route.ts
|   |   |   |   |   `-- route.ts
|   |   |   |   `-- orders/
|   |   |   |       `-- route.ts
|   |   |   |-- exchange/
|   |   |   |   |-- accounts/
|   |   |   |   |   |-- [id]/
|   |   |   |   |   |   `-- route.ts
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- balance/
|   |   |   |   |   `-- [id]/
|   |   |   |   |       `-- route.ts
|   |   |   |   |-- connect/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- debug/
|   |   |   |   |   `-- verify/
|   |   |   |   |       `-- route.ts
|   |   |   |   |-- positions/
|   |   |   |   |   `-- [id]/
|   |   |   |   |       `-- route.ts
|   |   |   |   `-- sync/
|   |   |   |       `-- route.ts
|   |   |   |-- healthz/
|   |   |   |   `-- route.ts
|   |   |   |-- ping/
|   |   |   |   `-- route.ts
|   |   |   |-- pnl/
|   |   |   |   |-- assets/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- calendar/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- chart/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- overview/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- summary/
|   |   |   |   |   `-- route.ts
|   |   |   |   `-- trades/
|   |   |   |       `-- route.ts
|   |   |   `-- profile/
|   |   |       |-- avatar/
|   |   |       |   `-- route.ts
|   |   |       `-- route.ts
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   |-- components/
|   |   |-- chat/
|   |   |   |-- AgentThinkingPanel.tsx
|   |   |   `-- ChatMessage.tsx
|   |   |-- features/
|   |   |   |-- ai-assistant/
|   |   |   |   `-- AIChatInterface.tsx
|   |   |   |-- auth/
|   |   |   |   |-- LoginForm.tsx
|   |   |   |   `-- RegisterForm.tsx
|   |   |   |-- dashboard/
|   |   |   |   |-- AssetDistribution.tsx
|   |   |   |   |-- DashboardOverview.tsx
|   |   |   |   |-- MarketTicker.tsx
|   |   |   |   |-- PNLCalendar.tsx
|   |   |   |   |-- PNLChart.tsx
|   |   |   |   |-- RecentTradesTable.tsx
|   |   |   |   |-- StatCard.tsx
|   |   |   |   `-- TradingViewChart.tsx
|   |   |   |-- demo-trading/
|   |   |   |   `-- DemoTradingTerminal.tsx
|   |   |   |-- exchange/
|   |   |   |   `-- ExchangeIntegrationWizard.tsx
|   |   |   `-- profile/
|   |   |       `-- ProfileSettings.tsx
|   |   `-- layout/
|   |       |-- AppHeader.tsx
|   |       `-- AppSidebar.tsx
|   |-- lib/
|   |   |-- adapters/
|   |   |   |-- binanceAdapter.ts
|   |   |   |-- bitgetAdapter.ts
|   |   |   |-- bybitAdapter.ts
|   |   |   |-- encryption.ts
|   |   |   |-- exchangeFactory.ts
|   |   |   |-- gateioAdapter.ts
|   |   |   |-- httpClient.ts
|   |   |   |-- llmAdapter.ts
|   |   |   |-- okxAdapter.ts
|   |   |   `-- okxApi.ts
|   |   |-- config/
|   |   |   `-- rss-feeds.ts
|   |   |-- db/
|   |   |   |-- chatDb.ts
|   |   |   |-- demoDb.ts
|   |   |   |-- exchangeDb.ts
|   |   |   |-- pnlDb.ts
|   |   |   |-- supabase-browser.ts
|   |   |   |-- supabase-server.ts
|   |   |   |-- tradesDb.ts
|   |   |   `-- usersDb.ts
|   |   |-- engines/
|   |   |   |-- demoEngine.ts
|   |   |   `-- pnlEngine.ts
|   |   |-- services/
|   |   |   |-- aiService.ts
|   |   |   |-- demoService.ts
|   |   |   |-- exchangeService.ts
|   |   |   |-- pnlService.ts
|   |   |   `-- profileService.ts
|   |   |-- tools/
|   |   |   |-- definitions.ts
|   |   |   |-- market-tool.ts
|   |   |   |-- news-tool.ts
|   |   |   `-- trade-tool.ts
|   |   |-- types/
|   |   |   `-- index.ts
|   |   |-- validators/
|   |   |   |-- ai.ts
|   |   |   |-- demo.ts
|   |   |   |-- exchange.ts
|   |   |   |-- exchangeDebug.ts
|   |   |   |-- pnl.ts
|   |   |   `-- profile.ts
|   |   `-- agent-loop.ts
|   |-- scripts/
|   |   |-- debug-ai-chat-sse.cjs
|   |   |-- debug-bitget-futures-sync.cjs
|   |   |-- debug-bitget-history-position.cjs
|   |   |-- debug-dashboard-api-smoke.cjs
|   |   |-- debug-exchange-apis.cjs
|   |   |-- debug-pnl-api-snapshot.ts
|   |   |-- debug-recent-trades-payload.cjs
|   |   |-- debug-sync-db.ts
|   |   |-- tmp-ai-chat-tool-debug.cjs
|   |   `-- tmp-prod-exchange-debug.cjs
|   |-- .env.local
|   |-- .eslintrc.json
|   |-- .npmrc
|   |-- middleware.ts
|   |-- next.config.ts
|   |-- next-env.d.ts
|   |-- package.json
|   |-- pnpm-lock.yaml
|   |-- postcss.config.mjs
|   |-- tailwind.config.ts
|   |-- tsconfig.json
|   `-- tsconfig.tsbuildinfo
|-- .gitignore
|-- AGENT.md
```

