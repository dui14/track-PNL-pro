const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function parseEnvFile(filePath) {
  const output = {}
  if (!fs.existsSync(filePath)) return output

  const content = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const index = line.indexOf('=')
    if (index === -1) continue

    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    output[key] = value
  }

  return output
}

function applyEnv(envMap) {
  for (const [key, value] of Object.entries(envMap)) {
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

async function readSSE(response) {
  if (!response.body) {
    return {
      done: false,
      error: 'EMPTY_STREAM',
      conversationId: null,
      content: '',
      tools: [],
      eventCounts: {},
    }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  let error = null
  let conversationId = null
  let content = ''
  const tools = []
  const eventCounts = {}

  while (true) {
    const { done: streamDone, value } = await reader.read()
    if (streamDone) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith('data:')) continue

      const payloadText = line.slice(5).trim()
      if (!payloadText) continue

      if (payloadText === '[DONE]') {
        done = true
        continue
      }

      try {
        const parsed = JSON.parse(payloadText)
        const eventType = typeof parsed.type === 'string' ? parsed.type : null
        const payload =
          parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)
            ? parsed.payload
            : parsed

        if (eventType) {
          eventCounts[eventType] = (eventCounts[eventType] || 0) + 1
        }

        if (typeof payload.conversationId === 'string') {
          conversationId = payload.conversationId
        }

        if (eventType === 'content_chunk' && typeof payload.text === 'string') {
          content += payload.text
        }

        if (eventType === 'tool_start') {
          tools.push({
            phase: 'start',
            tool: typeof payload.tool === 'string' ? payload.tool : null,
            label: typeof payload.label === 'string' ? payload.label : null,
          })
        }

        if (eventType === 'tool_done') {
          tools.push({
            phase: 'done',
            tool: typeof payload.tool === 'string' ? payload.tool : null,
            summary: typeof payload.summary === 'string' ? payload.summary : null,
          })
        }

        if (eventType === 'error' && typeof payload.message === 'string') {
          error = payload.message
        }

        if (eventType === 'done') {
          done = true
        }
      } catch {}
    }
  }

  return {
    done,
    error,
    conversationId,
    content,
    tools,
    eventCounts,
  }
}

async function streamChat(cookieHeader, message, conversationId, baseUrl) {
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      conversationId,
    }),
  })

  const sse = await readSSE(response)

  return {
    status: response.status,
    ok: response.ok,
    done: sse.done,
    error: sse.error,
    conversationId: sse.conversationId,
    eventCounts: sse.eventCounts,
    tools: sse.tools,
    contentPreview: sse.content.slice(0, 300),
    contentLength: sse.content.length,
  }
}

async function run() {
  applyEnv(parseEnvFile(path.join(process.cwd(), '.env.local')))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const baseUrl = process.env.CHAT_BASE_URL || 'http://localhost:3001'

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase env')
  }

  const testEmail = `copilot-rss-debug-${Date.now()}@example.com`
  const testPassword = `TmpPass!${Math.random().toString(36).slice(2, 12)}A1`

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey)
  const createUserResult = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  })

  if (createUserResult.error) {
    throw new Error(`CREATE_TEST_USER_FAILED: ${createUserResult.error.message}`)
  }

  const createdUserId = createUserResult.data.user?.id
  if (!createdUserId) {
    throw new Error('CREATE_TEST_USER_FAILED:NO_USER_ID')
  }

  try {
    const { createBrowserClient } = await import('@supabase/ssr')

    const cookieJar = new Map()
    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const cookie of cookiesToSet) {
            if (!cookie.value) cookieJar.delete(cookie.name)
            else cookieJar.set(cookie.name, cookie.value)
          }
        },
      },
    })

    const signIn = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    })

    if (signIn.error) {
      throw new Error(`SIGN_IN_ERROR: ${signIn.error.message}`)
    }

    const cookieHeader = Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')

    if (!cookieHeader) {
      throw new Error('AUTH_COOKIE_MISSING')
    }

    const firstTurn = await streamChat(
      cookieHeader,
      'phan tich du lieu onchain BTC va dua ra chien luoc giao dich hom nay',
      null,
      baseUrl
    )

    const secondTurn = await streamChat(
      cookieHeader,
      'cap nhat them ETF BTC va sentiment thi truong trong ngay',
      firstTurn.conversationId,
      baseUrl
    )

    console.log(
      JSON.stringify(
        {
          baseUrl,
          firstTurn,
          secondTurn,
          reusedConversationId:
            typeof firstTurn.conversationId === 'string' &&
            firstTurn.conversationId.length > 0 &&
            firstTurn.conversationId === secondTurn.conversationId,
        },
        null,
        2
      )
    )
  } finally {
    await adminClient.auth.admin.deleteUser(createdUserId)
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
