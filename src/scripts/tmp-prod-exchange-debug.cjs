const fs = require('node:fs');
const path = require('node:path');

function loadEnv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;

    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }

  return out;
}

async function verify(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  return {
    httpStatus: response.status,
    success: Boolean(payload.success),
    verified: payload?.data?.verified ?? null,
    upstreamStatus: payload?.data?.upstreamStatus ?? null,
    exchangeCode: payload?.data?.exchangeCode ?? null,
    exchangeMessage: payload?.data?.exchangeMessage ?? null,
    hints: payload?.data?.hints ?? [],
    error: payload?.error ?? null,
  };
}

async function main() {
  const env = loadEnv(path.resolve(__dirname, '..', '..', 'keydata.env'));
  const url = 'https://track-pnl.duii.dev/api/exchange/debug/verify';

  const [binance, bybit] = await Promise.all([
    verify(url, {
      exchange: 'binance',
      apiKey: env.BINANCE_API_KEY,
      apiSecret: env.BINANCE_API_SECRET,
      recvWindow: 10000,
    }),
    verify(url, {
      exchange: 'bybit',
      apiKey: env.BYBIT_API_KEY,
      apiSecret: env.BYBIT_API_SECRET,
      recvWindow: 5000,
      accountType: 'UNIFIED',
    }),
  ]);

  process.stdout.write(
    `${JSON.stringify({ testedAt: new Date().toISOString(), binance, bybit }, null, 2)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
