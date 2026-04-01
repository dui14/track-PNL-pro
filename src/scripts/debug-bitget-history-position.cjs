const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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

function hmacBase64(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64')
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { response, data }
}

async function callBitgetPrivate(apiKey, apiSecret, passphrase, pathWithQuery) {
  const ts = Date.now().toString()
  const sign = hmacBase64(apiSecret, `${ts}GET${pathWithQuery}`)

  const { response, data } = await fetchJson(`https://api.bitget.com${pathWithQuery}`, {
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-TIMESTAMP': ts,
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  })

  return {
    status: response.status,
    ok: response.ok,
    data,
  }
}

async function run() {
  const env = parseEnvFile(path.join(process.cwd(), '..', 'keydata.env'))
  const apiKey = env.BITGET_API_KEY
  const apiSecret = env.BITGET_API_SECRET
  const passphrase = env.BITGET_PASSPHRASE

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error('Missing BITGET credentials in keydata.env')
  }

  const now = Date.now()
  const start90 = now - 90 * 24 * 60 * 60 * 1000
  const start7 = now - 7 * 24 * 60 * 60 * 1000

  const fillQuery = new URLSearchParams({
    productType: 'USDT-FUTURES',
    startTime: String(start7),
    endTime: String(now),
    limit: '100',
  })
  const fillPath = `/api/v2/mix/order/fill-history?${fillQuery.toString()}`
  const fillResult = await callBitgetPrivate(apiKey, apiSecret, passphrase, fillPath)

  const historyQuery = new URLSearchParams({
    startTime: String(start90),
    endTime: String(now),
    pageSize: '100',
  })
  const historyPath = `/api/v2/mix/position/history-position?${historyQuery.toString()}`
  const historyResult = await callBitgetPrivate(apiKey, apiSecret, passphrase, historyPath)

  const fillCount = Array.isArray(fillResult.data?.data?.fillList)
    ? fillResult.data.data.fillList.length
    : null

  const historyData = historyResult.data?.data
  const historyRows = Array.isArray(historyData)
    ? historyData
    : Array.isArray(historyData?.list)
      ? historyData.list
      : []

  console.log(
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        fillHistory: {
          status: fillResult.status,
          ok: fillResult.ok,
          code: fillResult.data?.code ?? null,
          msg: fillResult.data?.msg ?? null,
          count: fillCount,
        },
        historyPosition: {
          status: historyResult.status,
          ok: historyResult.ok,
          code: historyResult.data?.code ?? null,
          msg: historyResult.data?.msg ?? null,
          count: historyRows.length,
          firstRow: historyRows[0] ?? null,
        },
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
