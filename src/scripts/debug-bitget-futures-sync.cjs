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

  const accountsRes = await fetch('http://localhost:3000/api/exchange/accounts', {
    headers: { Cookie: cookieHeader },
  })
  const accountsPayload = await accountsRes.json()
  if (!accountsPayload.success || !Array.isArray(accountsPayload.data)) {
    throw new Error('Failed to load exchange accounts')
  }

  const bitgetAccount = accountsPayload.data.find((item) => item.exchange === 'bitget')
  if (!bitgetAccount?.id) {
    throw new Error('No Bitget account found')
  }

  const updateRes = await fetch(`http://localhost:3000/api/exchange/accounts/${bitgetAccount.id}`, {
    method: 'PUT',
    headers: {
      Cookie: cookieHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apiKey: keyEnv.BITGET_API_KEY,
      apiSecret: keyEnv.BITGET_API_SECRET,
      passphrase: keyEnv.BITGET_PASSPHRASE,
      label: bitgetAccount.label ?? undefined,
    }),
  })

  const updatePayload = await updateRes.json()

  const syncRes = await fetch('http://localhost:3000/api/exchange/sync', {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ exchangeAccountId: bitgetAccount.id }),
  })

  const syncPayload = await syncRes.json()

  const tradesRes = await fetch(
    'http://localhost:3000/api/pnl/trades?page=1&limit=10&segment=futures&exchange=bitget',
    {
      headers: { Cookie: cookieHeader },
    }
  )

  const tradesPayload = await tradesRes.json()
  const rows = Array.isArray(tradesPayload?.data) ? tradesPayload.data : []

  console.log(
    JSON.stringify(
      {
        update_status: updateRes.status,
        update_success: Boolean(updatePayload?.success),
        update_error: updatePayload?.error ?? null,
        sync_status: syncRes.status,
        sync_success: Boolean(syncPayload?.success),
        sync_data: syncPayload?.data ?? null,
        sync_error: syncPayload?.error ?? null,
        trades_status: tradesRes.status,
        trades_success: Boolean(tradesPayload?.success),
        trades_count: rows.length,
        trades_total: tradesPayload?.meta?.total ?? 0,
        first_trade: rows[0] ?? null,
      },
      null,
      2
    )
  )
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
