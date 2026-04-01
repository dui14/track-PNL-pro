const fs = require('fs')
const path = require('path')

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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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

async function run() {
  applyEnv(parseEnvFile(path.join(process.cwd(), '.env.local')))
  const chatMessage =
    typeof process.env.CHAT_MESSAGE === 'string' && process.env.CHAT_MESSAGE.trim().length > 0
      ? process.env.CHAT_MESSAGE.trim()
      : 'Tom tat nhanh PNL 30 ngay va 2 tin crypto moi nhat'

  const keyEnv = parseEnvFile(path.join(process.cwd(), '..', 'keydata.env'))
  const email = process.env.EMAIL || keyEnv.EMAIL
  const password = process.env.PASSWORD || keyEnv.PASSWORD

  if (!email || !password) {
    throw new Error('Missing EMAIL/PASSWORD in keydata.env')
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase env')
  }

  const { createBrowserClient } = await import('@supabase/ssr')

  const cookieJar = new Map()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () =>
          Array.from(cookieJar.entries()).map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const cookie of cookiesToSet) {
            if (!cookie.value) cookieJar.delete(cookie.name)
            else cookieJar.set(cookie.name, cookie.value)
          }
        },
      },
    }
  )

  const signIn = await supabase.auth.signInWithPassword({ email, password })
  if (signIn.error) {
    throw new Error(`SIGN_IN_ERROR: ${signIn.error.message}`)
  }

  const cookieHeader = Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

  if (!cookieHeader) {
    throw new Error('No auth cookie created')
  }

  const response = await fetch('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: chatMessage,
      conversationId: null,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`CHAT_HTTP_${response.status}: ${text.slice(0, 240)}`)
  }

  if (!response.body) {
    throw new Error('Chat stream body is empty')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  let conversationId = null
  let errorText = null
  let fullContent = ''
  let contentChunks = 0
  const eventTypes = []

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
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          continue
        }

        const eventType = typeof parsed.type === 'string' ? parsed.type : null
        const eventPayload =
          parsed.payload && typeof parsed.payload === 'object' && !Array.isArray(parsed.payload)
            ? parsed.payload
            : parsed

        if (eventType) {
          eventTypes.push(eventType)
        }

        if (typeof eventPayload.conversationId === 'string') {
          conversationId = eventPayload.conversationId
        }

        if (eventType === 'error') {
          if (typeof eventPayload.message === 'string' && eventPayload.message) {
            errorText = eventPayload.message
          }
        }

        if (eventType === 'done') {
          done = true
        }

        if (eventType === 'content_chunk' && typeof eventPayload.text === 'string' && eventPayload.text) {
          fullContent += eventPayload.text
          contentChunks += 1
        }

        if (typeof parsed.error === 'string' && parsed.error) {
          errorText = parsed.error
        }

        if (typeof parsed.content === 'string' && parsed.content) {
          fullContent += parsed.content
          contentChunks += 1
        }
      } catch {}
    }
  }

  const eventCounts = {}
  for (const type of eventTypes) {
    eventCounts[type] = (eventCounts[type] || 0) + 1
  }

  console.log(
    JSON.stringify(
      {
        chat_status: response.status,
        done,
        hasConversationId: typeof conversationId === 'string' && conversationId.length > 0,
        contentChunks,
        contentLength: fullContent.length,
        contentPreview: fullContent.slice(0, 240),
        eventCount: eventTypes.length,
        eventTypes,
        eventCounts,
        error: errorText,
      },
      null,
      2
    )
  )
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})