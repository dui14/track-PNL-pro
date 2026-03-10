# Prompt Templates

## Overview

All prompts are stored as templates and built dynamically at runtime with user context injected. Prompts are defined in `src/lib/services/aiPromptBuilder.ts`.

## System Prompt

The system prompt establishes the AI assistant's identity and injects relevant user context.

```typescript
// src/lib/services/aiPromptBuilder.ts

import { pnlService } from './pnlService'
import { exchangeService } from './exchangeService'

export async function buildSystemPrompt(userId: string): Promise<string> {
  const [pnlResult, accountsResult] = await Promise.all([
    pnlService.getSummary(userId, 'month'),
    exchangeService.getAccounts(userId)
  ])

  const pnlContext = pnlResult.success && pnlResult.data
    ? `
Current month trading performance:
- Total PNL: $${pnlResult.data.totalPnl.toFixed(2)}
- Win rate: ${pnlResult.data.winRate}%
- Total trades: ${pnlResult.data.tradeCount}
- Winning trades: ${pnlResult.data.winCount}
- Losing trades: ${pnlResult.data.lossCount}
- Best trade: $${pnlResult.data.bestTradePnl?.toFixed(2) ?? 'N/A'}
- Worst trade: $${pnlResult.data.worstTradePnl?.toFixed(2) ?? 'N/A'}
`
    : 'No trading data available yet.'

  const exchangeContext = accountsResult.success && accountsResult.data.length > 0
    ? `Connected exchanges: ${accountsResult.data.map(a => a.exchange).join(', ')}`
    : 'No exchanges connected.'

  return `You are an expert crypto trading analyst and AI assistant for the aiTrackProfit platform.

Your role:
- Help users understand their trading performance
- Provide actionable insights based on their PNL data
- Explain trading concepts clearly
- Suggest risk management improvements
- Answer questions about market analysis and trading strategies

User's current data:
${pnlContext}
${exchangeContext}

Guidelines:
- Be concise and direct. Avoid unnecessary filler text.
- When referencing numbers, use the user's actual data above.
- If asked about market predictions, note that you cannot predict prices.
- Never suggest specific buy/sell actions on specific assets.
- Always recommend proper risk management (never risk more than 1-2% per trade).
- Do not provide financial advice — educate and inform only.
- Respond in the same language the user uses.`
}
```

## Prompt Templates by Topic

### PNL Interpretation

```
System: You are a trading performance analyst. Analyze the user's PNL data and provide insights.

User: "Why is my win rate low?"

Expected response structure:
1. Acknowledge the current win rate
2. Identify possible causes from available data
3. Suggest 2-3 actionable improvements
4. Keep response under 300 words
```

### Strategy Analysis

```
System: You are a crypto trading strategy advisor.

User: "How should I trade BTC breakouts?"

Expected response structure:
1. Explain the breakout concept briefly
2. Describe a standard breakout strategy
3. Mention risk management rules
4. Note limitations of the approach
```

### Risk Assessment

```
System: You are a risk management specialist for crypto traders.

User: "I keep losing on my ALTCOIN positions. What am I doing wrong?"

Expected response structure:
1. Common reasons for altcoin losses
2. Risk management principles (position sizing, stop-losses)
3. Specific checklist for altcoin trading
4. Recommend reviewing worst trade stats
```

### PNL Data Context Prompt

When user asks about specific metrics:

```typescript
export function buildDataQueryPrompt(userMessage: string, relevantData: object): string {
  return `${userMessage}

Additional context from my trading data:
${JSON.stringify(relevantData, null, 2)}

Please use this data to give a specific, personalized answer.`
}
```

## Prompt Safety Guards

Inject into system prompt:

```
Safety guidelines:
- Never provide specific price predictions or entry/exit signals
- Never recommend taking out loans to trade
- Never suggest using 100% of capital on a single trade
- If a user shows signs of problem gambling or emotional trading, gently redirect
- Do not comment on tokens that may be securities
- Always add disclaimer: "This is not financial advice"
```

## Conversation Starters (Suggestions)

Show these as quick-action buttons when chat is empty:

```typescript
export const CHAT_SUGGESTIONS = [
  "What is my win rate this month?",
  "Analyze my biggest loss trade",
  "How can I improve my risk management?",
  "Explain my PNL trend this week",
  "What is a good position size for my portfolio?",
  "Why do traders use stop-loss orders?"
]
```

## Context Injection Strategy

| Data | When to Inject | Why |
|---|---|---|
| Monthly PNL summary | Always | Core context for most questions |
| Exchange list | Always | Know what exchanges user has |
| Recent trades | Only when asked | Avoids bloating context window |
| Full trade history | Never directly | Too large; use summarized stats |
| Demo trade history | Only when context is demo | Separate from real trading |

## Token Estimation

Before sending to LLM, estimate tokens to avoid context overflow:

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function truncateHistory(messages: LLMMessage[], maxTokens: number): LLMMessage[] {
  let total = 0
  const result: LLMMessage[] = []

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(messages[i].content)
    if (total + tokens > maxTokens) break
    result.unshift(messages[i])
    total += tokens
  }

  return result
}
```

Keep last 20 messages or until 3000 token budget is used, whichever comes first.
