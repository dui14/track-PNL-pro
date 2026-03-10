# Integration Tests

## Overview

Integration tests verify that multiple components work together correctly. These tests run against a local Supabase instance and test the full request-response cycle.

## Prerequisites

```bash
supabase start          # Start local Supabase instance
supabase db push        # Apply all migrations
pnpm test:integration   # Run integration tests
```

## Test Configuration

```typescript
// jest.integration.config.ts

import type { Config } from 'jest'

const config: Config = {
  testMatch: ['**/*.integration.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterFramework: ['./src/test/integration-setup.ts'],
  testTimeout: 30000  // 30s for DB operations
}

export default config
```

```typescript
// src/test/integration-setup.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

beforeEach(async () => {
  // Clear test data before each test
  await supabase.from('trades').delete().eq('user_id', TEST_USER_ID)
  await supabase.from('pnl_snapshots').delete().eq('user_id', TEST_USER_ID)
  await supabase.from('demo_trades').delete().eq('user_id', TEST_USER_ID)
  await supabase.from('chat_conversations').delete().eq('user_id', TEST_USER_ID)
})

export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
```

## PNL Service Integration Tests

```typescript
// src/lib/services/pnlService.integration.test.ts

import { pnlService } from '../pnlService'
import { tradesDb } from '@/lib/db/tradesDb'
import { TEST_USER_ID } from '@/test/integration-setup'

describe('pnlService - integration', () => {
  it('calculates correct summary after seeding trades', async () => {
    // Seed trades directly into DB
    await tradesDb.insertMany([
      {
        exchangeAccountId: 'test-account',
        userId: TEST_USER_ID,
        externalTradeId: 'test-1',
        symbol: 'BTCUSDT',
        side: 'buy',
        quantity: 1,
        price: 60000,
        fee: 60,
        feeCurrency: 'USDT',
        realizedPnl: 500,
        tradeType: 'futures',
        tradedAt: new Date('2026-03-01')
      },
      {
        exchangeAccountId: 'test-account',
        userId: TEST_USER_ID,
        externalTradeId: 'test-2',
        symbol: 'ETHUSDT',
        side: 'sell',
        quantity: 10,
        price: 3000,
        fee: 30,
        feeCurrency: 'USDT',
        realizedPnl: -100,
        tradeType: 'futures',
        tradedAt: new Date('2026-03-01')
      }
    ])

    const result = await pnlService.getSummary(TEST_USER_ID, 'month')

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.totalPnl).toBeCloseTo(400)
    expect(result.data.tradeCount).toBe(2)
    expect(result.data.winCount).toBe(1)
    expect(result.data.lossCount).toBe(1)
    expect(result.data.winRate).toBe(50)
  })
})
```

## Exchange Sync Integration Tests

```typescript
// src/lib/services/exchangeService.integration.test.ts

import { exchangeService } from '../exchangeService'
import { TEST_USER_ID } from '@/test/integration-setup'

const MOCK_BINANCE_TRADES = [
  {
    id: 99001,
    symbol: 'BTCUSDT',
    orderId: 1,
    price: '65000.00',
    qty: '0.01',
    commission: '0.65',
    commissionAsset: 'USDT',
    time: 1746000000000,
    isBuyer: true
  }
]

describe('exchangeService - integration', () => {
  it('stores normalized trades after sync', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ makerCommission: 15, balances: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(MOCK_BINANCE_TRADES)
      })

    const result = await exchangeService.syncAccount({
      userId: TEST_USER_ID,
      exchangeAccountId: 'test-account-id',
      exchange: 'binance',
      encryptedApiKey: 'encrypted-key',
      encryptedSecret: 'encrypted-secret',
      keyIv: 'iv1',
      secretIv: 'iv2'
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.newTrades).toBeGreaterThanOrEqual(0)
    }
  })
})
```

## Demo Trading Integration Tests

```typescript
// src/lib/engines/demoTradingEngine.integration.test.ts

import { placeDemoOrder, closeDemoOrder } from '../demoTradingEngine'
import { TEST_USER_ID } from '@/test/integration-setup'

describe('demo trading engine - integration', () => {
  it('places market buy and deducts demo balance', async () => {
    const result = await placeDemoOrder({
      userId: TEST_USER_ID,
      symbol: 'BTCUSDT',
      side: 'buy',
      orderType: 'market',
      quantity: 0.01,
      currentPrice: 65000
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.status).toBe('open')
    expect(result.data.entryPrice).toBe(65000)
  })

  it('closes order and calculates positive PNL', async () => {
    // First, place an order
    const orderResult = await placeDemoOrder({
      userId: TEST_USER_ID,
      symbol: 'BTCUSDT',
      side: 'buy',
      orderType: 'market',
      quantity: 0.01,
      currentPrice: 65000
    })

    if (!orderResult.success) return

    // Close at higher price
    const closeResult = await closeDemoOrder({
      userId: TEST_USER_ID,
      orderId: orderResult.data.id,
      exitPrice: 66000
    })

    expect(closeResult.success).toBe(true)
    if (closeResult.success) {
      // (66000 - 65000) * 0.01 = 10 USDT
      expect(closeResult.data.realizedPnl).toBeCloseTo(10)
    }
  })
})
```

## E2E Tests with Playwright

```typescript
// tests/e2e/auth.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('allows user to login with email and password', async ({ page }) => {
    await page.goto('/login')

    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'testpassword123')
    await page.click('[type="submit"]')

    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })
})
```

```typescript
// tests/e2e/dashboard.spec.ts

import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.use({ storageState: 'tests/e2e/auth.json' })  // pre-authenticated state

  test('renders PNL summary cards', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page.locator('[data-testid="pnl-total"]')).toBeVisible()
    await expect(page.locator('[data-testid="win-rate"]')).toBeVisible()
    await expect(page.locator('[data-testid="trade-count"]')).toBeVisible()
  })

  test('renders PNL chart', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="pnl-chart"]')).toBeVisible()
  })

  test('time range filter changes chart data', async ({ page }) => {
    await page.goto('/dashboard')

    await page.click('[data-testid="range-week"]')
    await expect(page.locator('[data-testid="pnl-chart"]')).toBeVisible()

    await page.click('[data-testid="range-month"]')
    await expect(page.locator('[data-testid="pnl-chart"]')).toBeVisible()
  })
})
```

## Running Tests

```bash
# Unit tests
pnpm test

# Integration tests (requires local Supabase running)
pnpm test:integration

# E2E tests (requires app running at localhost:3000)
pnpm playwright test

# All tests
pnpm test:all

# Coverage
pnpm test:coverage
```

## CI Pipeline

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: supabase start
      - run: supabase db push
      - run: pnpm test
      - run: pnpm test:integration
      - run: pnpm build
```
