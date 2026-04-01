const fs = require('fs')
const path = require('path')

function parseEnvFile(filePath) {
  const output = {}
  if (!fs.existsSync(filePath)) return output
  const content = fs.readFileSync(filePath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const idx = line.indexOf('=')
    if (idx === -1) continue

    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()

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
    if (!(key in process.env)) process.env[key] = value
  }
}

async function run() {
  const appEnv = parseEnvFile(path.join(process.cwd(), '.env.local'))
  applyEnv(appEnv)

  const keyEnv = parseEnvFile(path.join(process.cwd(), '..', 'keydata.env'))
  const email = process.env.EMAIL || keyEnv.EMAIL
  const password = process.env.PASSWORD || keyEnv.PASSWORD

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase env')
  }

  if (!email || !password) {
    throw new Error('Missing EMAIL/PASSWORD in keydata.env')
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

  const tests = [
    ['/api/exchange/accounts', 'exchange accounts'],
    ['/api/pnl/overview?segment=all', 'pnl overview'],
    ['/api/pnl/overview?segment=futures', 'pnl overview futures'],
    ['/api/pnl/overview?segment=all&exchange=binance', 'pnl overview binance'],
    ['/api/pnl/overview?segment=all&exchange=gateio', 'pnl overview gateio'],
    ['/api/pnl/chart?range=week&segment=all', 'pnl chart week'],
    ['/api/pnl/chart?range=month&segment=all', 'pnl chart month'],
    ['/api/pnl/chart?range=week&segment=all&exchange=binance', 'pnl chart week binance'],
    ['/api/pnl/chart?range=week&segment=all&exchange=gateio', 'pnl chart week gateio'],
    ['/api/pnl/assets?segment=all', 'asset distribution'],
    ['/api/pnl/assets?segment=all&exchange=binance', 'asset distribution binance'],
    ['/api/pnl/assets?segment=all&exchange=gateio', 'asset distribution gateio'],
    ['/api/pnl/trades?page=1&limit=10&segment=all', 'recent trades page 1'],
    ['/api/pnl/trades?page=2&limit=10&segment=all', 'recent trades page 2'],
    ['/api/pnl/trades?page=3&limit=10&segment=all', 'recent trades page 3'],
    ['/api/pnl/trades?page=4&limit=10&segment=all', 'recent trades page 4'],
    ['/api/pnl/trades?page=5&limit=10&segment=all', 'recent trades page 5'],
    ['/api/pnl/trades?page=1&limit=10&segment=all&exchange=binance', 'recent trades binance'],
    ['/api/pnl/trades?page=1&limit=10&segment=all&exchange=gateio', 'recent trades gateio'],
    ['/api/pnl/trades?page=1&limit=10&segment=spot', 'recent trades spot'],
    ['/api/pnl/trades?page=1&limit=10&segment=futures', 'recent trades futures'],
    ['/api/pnl/trades?page=1&limit=10&segment=futures&exchange=binance', 'recent trades futures binance'],
    ['/api/pnl/trades?page=1&limit=10&segment=futures&exchange=bitget', 'recent trades futures bitget'],
    ['/api/pnl/trades?page=1&limit=10&segment=futures&exchange=gateio', 'recent trades futures gateio'],
  ]

  for (const [url, label] of tests) {
    const response = await fetch(`http://localhost:3000${url}`, {
      headers: { Cookie: cookieHeader },
    })

    let payload = null
    try {
      payload = await response.json()
    } catch {
      console.log(`${label}: status=${response.status} non-json`)
      continue
    }

    const count = Array.isArray(payload?.data) ? payload.data.length : null
    console.log(
      `${label}: status=${response.status} success=${Boolean(payload?.success)}${
        count === null ? '' : ` count=${count}`
      }`
    )
  }
}

run()
  .then(() => {
    console.log('dashboard api smoke test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
