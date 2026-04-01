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
    '/api/pnl/trades?page=1&limit=10&segment=all',
    '/api/pnl/trades?page=1&limit=10&segment=all&exchange=binance',
    '/api/pnl/trades?page=1&limit=10&segment=spot',
    '/api/pnl/trades?page=1&limit=10&segment=futures',
    '/api/pnl/trades?page=1&limit=10&segment=futures&exchange=binance',
    '/api/pnl/trades?page=1&limit=10&segment=futures&exchange=bitget',
  ]

  for (const url of tests) {
    const response = await fetch(`http://localhost:3000${url}`, {
      headers: { Cookie: cookieHeader },
    })

    const payload = await response.json()
    const rows = Array.isArray(payload?.data) ? payload.data : []
    const zeroRows = rows.filter((row) => Number(row.price) <= 0 || Number(row.quantity) <= 0).length
    const dedupCount = new Set(rows.map((row) => `${row.exchange_account_id}:${row.external_trade_id}`)).size
    const duplicateRows = rows.length - dedupCount

    console.log(
      `${url} status=${response.status} success=${Boolean(payload?.success)} count=${rows.length} total=${payload?.meta?.total ?? 0} zeroRows=${zeroRows} duplicateRows=${duplicateRows}`
    )

    if (rows[0]) {
      const sample = rows[0]
      console.log(
        `sample symbol=${sample.symbol} exchange=${sample.exchange ?? 'n/a'} type=${sample.trade_type} price=${sample.price} quantity=${sample.quantity}`
      )
    }
  }
}

run()
  .then(() => {
    console.log('recent trades payload test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
