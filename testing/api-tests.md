# API Tests

## Overview

API route tests validate that each endpoint correctly handles authentication, input validation, business logic, and error responses. Tests use Jest with mocked Supabase clients.

## Test Setup

```typescript
// src/test/setup.ts

import { jest } from '@jest/globals'

// Mock Supabase server client
jest.mock('@/lib/db/supabase-server', () => ({
  createSupabaseServerClient: jest.fn()
}))

// Mock exchange adapters
jest.mock('@/lib/adapters/exchangeRegistry', () => ({
  getExchangeAdapter: jest.fn()
}))

// Mock LLM adapter
jest.mock('@/lib/adapters/openaiAdapter', () => ({
  openaiAdapter: {
    stream: jest.fn()
  }
}))
```

## Test Utilities

```typescript
// src/test/helpers.ts

import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createMockRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), options)
}

export function createAuthenticatedRequest(url: string, body?: object): NextRequest {
  return createMockRequest(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer mock-jwt' },
    body: body ? JSON.stringify(body) : undefined
  })
}

export function mockSupabaseUser(userId = 'test-user-id'): Partial<SupabaseClient> {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: userId, email: 'test@example.com' } },
        error: null
      })
    } as unknown as SupabaseClient['auth'],
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null })
  } as Partial<SupabaseClient>
}
```

## Exchange Connect Endpoint Tests

```typescript
// src/app/api/exchange/connect/route.test.ts

import { POST } from './route'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { getExchangeAdapter } from '@/lib/adapters/exchangeRegistry'
import { createAuthenticatedRequest, mockSupabaseUser } from '@/test/helpers'

jest.mock('@/lib/db/supabase-server')
jest.mock('@/lib/adapters/exchangeRegistry')

const mockCreateClient = createSupabaseServerClient as jest.Mock
const mockGetAdapter = getExchangeAdapter as jest.Mock

describe('POST /api/exchange/connect', () => {
  beforeEach(() => {
    mockCreateClient.mockResolvedValue(mockSupabaseUser())
  })

  it('returns 401 when unauthenticated', async () => {
    mockCreateClient.mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) }
    })

    const req = createAuthenticatedRequest('http://localhost/api/exchange/connect', {
      exchange: 'binance',
      apiKey: 'testkey',
      apiSecret: 'testsecret'
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid exchange name', async () => {
    const req = createAuthenticatedRequest('http://localhost/api/exchange/connect', {
      exchange: 'invalid-exchange',
      apiKey: 'testkey',
      apiSecret: 'testsecret'
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('VALIDATION_ERROR')
  })

  it('successfully connects valid exchange account', async () => {
    mockGetAdapter.mockReturnValue({
      validateCredentials: jest.fn().mockResolvedValue({ success: true, data: true })
    })

    const supabaseMock = mockSupabaseUser()
    ;(supabaseMock.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'account-uuid', exchange: 'binance', is_active: true },
            error: null
          })
        })
      })
    })
    mockCreateClient.mockResolvedValue(supabaseMock)

    const req = createAuthenticatedRequest('http://localhost/api/exchange/connect', {
      exchange: 'binance',
      apiKey: 'validkey123456789',
      apiSecret: 'validsecret123456789'
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.exchange).toBe('binance')
  })

  it('returns 409 when exchange already connected', async () => {
    const supabaseMock = mockSupabaseUser()
    ;(supabaseMock.from as jest.Mock).mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'unique_violation' }
          })
        })
      })
    })
    mockCreateClient.mockResolvedValue(supabaseMock)
    mockGetAdapter.mockReturnValue({
      validateCredentials: jest.fn().mockResolvedValue({ success: true, data: true })
    })

    const req = createAuthenticatedRequest('http://localhost/api/exchange/connect', {
      exchange: 'binance',
      apiKey: 'validkey123456789',
      apiSecret: 'validsecret123456789'
    })

    const res = await POST(req)
    expect(res.status).toBe(409)
  })
})
```

## PNL Summary Endpoint Tests

```typescript
// src/app/api/pnl/summary/route.test.ts

import { GET } from './route'
import { createSupabaseServerClient } from '@/lib/db/supabase-server'
import { createMockRequest, mockSupabaseUser } from '@/test/helpers'

jest.mock('@/lib/db/supabase-server')

describe('GET /api/pnl/summary', () => {
  it('returns PNL summary for authenticated user', async () => {
    const mockSummary = {
      total_pnl: 1250.5,
      win_rate: 68.5,
      trade_count: 124,
      win_count: 85,
      loss_count: 39
    }

    const supabaseMock = mockSupabaseUser()
    ;(supabaseMock.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockSummary, error: null })
        })
      })
    })
    ;(createSupabaseServerClient as jest.Mock).mockResolvedValue(supabaseMock)

    const req = createMockRequest('http://localhost/api/pnl/summary?range=month')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.total_pnl).toBe(1250.5)
  })

  it('returns empty summary when no trades exist', async () => {
    const supabaseMock = mockSupabaseUser()
    ;(supabaseMock.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null })
        })
      })
    })
    ;(createSupabaseServerClient as jest.Mock).mockResolvedValue(supabaseMock)

    const req = createMockRequest('http://localhost/api/pnl/summary?range=month')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.total_pnl).toBe(0)
  })
})
```

## Demo Order Tests

```typescript
// src/app/api/demo/order/route.test.ts

describe('POST /api/demo/order', () => {
  it('deducts demo balance on buy order', async () => {
    // test virtual balance deduction
  })

  it('rejects order when insufficient demo balance', async () => {
    // test balance check
  })

  it('creates market order at current price', async () => {
    // test market order fills at current price
  })

  it('creates limit order in open status', async () => {
    // test limit order stored as open
  })
})
```

## Running Tests

```bash
pnpm test                          # Run all unit tests
pnpm test src/app/api/exchange     # Run specific directory
pnpm test --watch                  # Watch mode
pnpm test --coverage               # Coverage report
```

## Coverage Targets

| Module | Minimum Coverage |
|---|---|
| API routes | 80% |
| Domain services | 90% |
| PNL engine | 95% |
| Exchange adapters | 85% |
| Validators | 100% |
| Utilities | 90% |
