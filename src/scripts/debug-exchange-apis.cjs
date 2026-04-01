const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function hmacBase64(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64');
}

function hmacSha512Hex(secret, payload) {
  return crypto.createHmac('sha512', secret).update(payload).digest('hex');
}

function sha512Hex(payload) {
  return crypto.createHash('sha512').update(payload).digest('hex');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

function daysAgoMs(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

async function testBinance(env) {
  const apiKey = env.BINANCE_API_KEY;
  const apiSecret = env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { exchange: 'binance', ok: false, reason: 'MISSING_KEYS' };
  }

  const recvWindow = 10000;
  const accountTimestamp = Date.now();
  const accountQuery = new URLSearchParams({
    recvWindow: String(recvWindow),
    timestamp: String(accountTimestamp),
  });
  accountQuery.append('signature', hmacHex(apiSecret, accountQuery.toString()));

  const accountRes = await fetchJson(`https://api.binance.com/api/v3/account?${accountQuery.toString()}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });

  const incomeTimestamp = Date.now();
  const incomeQuery = new URLSearchParams({
    incomeType: 'REALIZED_PNL',
    startTime: String(daysAgoMs(360)),
    endTime: String(Date.now()),
    limit: '100',
    timestamp: String(incomeTimestamp),
  });
  incomeQuery.append('signature', hmacHex(apiSecret, incomeQuery.toString()));

  const futuresRes = await fetchJson(`https://fapi.binance.com/fapi/v1/income?${incomeQuery.toString()}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });

  return {
    exchange: 'binance',
    ok: accountRes.ok && futuresRes.ok,
    accountStatus: accountRes.status,
    futuresStatus: futuresRes.status,
    spotTradeCountHint: Array.isArray(accountRes.data?.balances)
      ? accountRes.data.balances.filter((b) => Number(b.free || 0) + Number(b.locked || 0) > 0).length
      : null,
    futuresRecordCount: Array.isArray(futuresRes.data) ? futuresRes.data.length : null,
    accountCode: accountRes.data?.code ?? null,
    futuresCode: futuresRes.data?.code ?? null,
  };
}

async function testOkx(env) {
  const apiKey = env.OKX_API_KEY;
  const apiSecret = env.OKX_API_SECRET;
  const passphrase = env.OKX_PASSPHRASE;
  if (!apiKey || !apiSecret || !passphrase) {
    return { exchange: 'okx', ok: false, reason: 'MISSING_KEYS' };
  }

  const balancePath = '/api/v5/account/balance';
  const balanceTs = new Date().toISOString();
  const balanceSig = hmacBase64(apiSecret, `${balanceTs}GET${balancePath}`);
  const balanceRes = await fetchJson(`https://www.okx.com${balancePath}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': balanceSig,
      'OK-ACCESS-TIMESTAMP': balanceTs,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
  });

  const begin = daysAgoMs(360);
  const end = Date.now();
  const billPath = `/api/v5/account/bills-archive?type=2&begin=${begin}&end=${end}&limit=100`;
  const billTs = new Date().toISOString();
  const billSig = hmacBase64(apiSecret, `${billTs}GET${billPath}`);
  const billsRes = await fetchJson(`https://www.okx.com${billPath}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': billSig,
      'OK-ACCESS-TIMESTAMP': billTs,
      'OK-ACCESS-PASSPHRASE': passphrase,
    },
  });

  return {
    exchange: 'okx',
    ok: balanceRes.ok && balanceRes.data?.code === '0' && billsRes.ok,
    accountStatus: balanceRes.status,
    futuresStatus: billsRes.status,
    totalEq: balanceRes.data?.data?.[0]?.totalEq ?? null,
    billCode: billsRes.data?.code ?? null,
    billCount: Array.isArray(billsRes.data?.data) ? billsRes.data.data.length : null,
  };
}

async function testBybit(env) {
  const apiKey = env.BYBIT_API_KEY;
  const apiSecret = env.BYBIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { exchange: 'bybit', ok: false, reason: 'MISSING_KEYS' };
  }

  const recvWindow = 5000;
  const timestamp = Date.now();

  const walletQuery = 'accountType=UNIFIED';
  const walletSignPayload = `${timestamp}${apiKey}${recvWindow}${walletQuery}`;
  const walletSig = hmacHex(apiSecret, walletSignPayload);
  const walletRes = await fetchJson(`https://api.bybit.com/v5/account/wallet-balance?${walletQuery}`, {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': walletSig,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': String(timestamp),
      'X-BAPI-RECV-WINDOW': String(recvWindow),
    },
  });

  const windowEnd = Date.now();
  const windowStart = windowEnd - 7 * 24 * 60 * 60 * 1000;

  const execTs = Date.now();
  const execQuery = `category=linear&startTime=${windowStart}&endTime=${windowEnd}&limit=100`;
  const execSig = hmacHex(apiSecret, `${execTs}${apiKey}${recvWindow}${execQuery}`);
  const futuresRes = await fetchJson(`https://api.bybit.com/v5/execution/list?${execQuery}`, {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': execSig,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': String(execTs),
      'X-BAPI-RECV-WINDOW': String(recvWindow),
    },
  });

  const spotTs = Date.now();
  const spotQuery = `category=spot&startTime=${windowStart}&endTime=${windowEnd}&limit=100`;
  const spotSig = hmacHex(apiSecret, `${spotTs}${apiKey}${recvWindow}${spotQuery}`);
  const spotRes = await fetchJson(`https://api.bybit.com/v5/execution/list?${spotQuery}`, {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': spotSig,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': String(spotTs),
      'X-BAPI-RECV-WINDOW': String(recvWindow),
    },
  });

  return {
    exchange: 'bybit',
    ok:
      walletRes.ok &&
      walletRes.data?.retCode === 0 &&
      futuresRes.ok &&
      futuresRes.data?.retCode === 0 &&
      spotRes.ok &&
      spotRes.data?.retCode === 0,
    accountStatus: walletRes.status,
    futuresStatus: futuresRes.status,
    spotStatus: spotRes.status,
    accountCode: walletRes.data?.retCode ?? null,
    futuresCode: futuresRes.data?.retCode ?? null,
    spotCode: spotRes.data?.retCode ?? null,
    futuresCount: Array.isArray(futuresRes.data?.result?.list) ? futuresRes.data.result.list.length : null,
    spotCount: Array.isArray(spotRes.data?.result?.list) ? spotRes.data.result.list.length : null,
  };
}

async function testBitget(env) {
  const apiKey = env.BITGET_API_KEY;
  const apiSecret = env.BITGET_API_SECRET;
  const passphrase = env.BITGET_PASSPHRASE;
  if (!apiKey || !apiSecret || !passphrase) {
    return { exchange: 'bitget', ok: false, reason: 'MISSING_KEYS' };
  }

  const accountPath = '/api/v2/spot/account/assets';
  const accountTs = Date.now().toString();
  const accountSig = hmacBase64(apiSecret, `${accountTs}GET${accountPath}`);
  const accountRes = await fetchJson(`https://api.bitget.com${accountPath}`, {
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': accountSig,
      'ACCESS-TIMESTAMP': accountTs,
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  });

  const bitgetWindowEnd = Date.now();
  const bitgetWindowStart = bitgetWindowEnd - 90 * 24 * 60 * 60 * 1000;
  const bitgetFuturesStart = bitgetWindowEnd - 7 * 24 * 60 * 60 * 1000;

  const spotQuery = new URLSearchParams({
    symbol: 'BTCUSDT',
    startTime: String(bitgetWindowStart),
    endTime: String(bitgetWindowEnd),
    limit: '100',
  }).toString();
  const spotPath = `/api/v2/spot/trade/fills?${spotQuery}`;
  const spotTs = Date.now().toString();
  const spotSig = hmacBase64(apiSecret, `${spotTs}GET${spotPath}`);
  const spotRes = await fetchJson(`https://api.bitget.com${spotPath}`, {
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': spotSig,
      'ACCESS-TIMESTAMP': spotTs,
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  });

  const futuresQuery = new URLSearchParams({
    productType: 'USDT-FUTURES',
    startTime: String(bitgetFuturesStart),
    endTime: String(bitgetWindowEnd),
    limit: '100',
  }).toString();
  const futuresPath = `/api/v2/mix/order/fill-history?${futuresQuery}`;
  const futuresTs = Date.now().toString();
  const futuresSig = hmacBase64(apiSecret, `${futuresTs}GET${futuresPath}`);
  const futuresRes = await fetchJson(`https://api.bitget.com${futuresPath}`, {
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': futuresSig,
      'ACCESS-TIMESTAMP': futuresTs,
      'ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  });

  return {
    exchange: 'bitget',
    ok:
      accountRes.ok &&
      accountRes.data?.code === '00000' &&
      spotRes.ok &&
      spotRes.data?.code === '00000' &&
      futuresRes.ok &&
      futuresRes.data?.code === '00000',
    accountStatus: accountRes.status,
    spotStatus: spotRes.status,
    futuresStatus: futuresRes.status,
    accountCode: accountRes.data?.code ?? null,
    spotCode: spotRes.data?.code ?? null,
    futuresCode: futuresRes.data?.code ?? null,
    spotCount: Array.isArray(spotRes.data?.data) ? spotRes.data.data.length : null,
    futuresCount: Array.isArray(futuresRes.data?.data?.fillList) ? futuresRes.data.data.fillList.length : null,
  };
}

async function testGateio(env) {
  const apiKey = env.GATEIO_API_KEY;
  const apiSecret = env.GATEIO_API_SECRET;
  if (!apiKey || !apiSecret) {
    return { exchange: 'gateio', ok: false, reason: 'MISSING_KEYS' };
  }

  const accountPath = '/api/v4/spot/accounts';
  const accountSignPath = '/spot/accounts';
  const accountQuery = 'currency=USDT';
  const accountTimestamp = Math.floor(Date.now() / 1000).toString();
  const accountPayload = `GET\n/api/v4${accountSignPath}\n${accountQuery}\n${sha512Hex('')}\n${accountTimestamp}`;
  const accountSig = hmacSha512Hex(apiSecret, accountPayload);
  const accountRes = await fetchJson(`https://api.gateio.ws${accountPath}?${accountQuery}`, {
    method: 'GET',
    headers: {
      KEY: apiKey,
      Timestamp: accountTimestamp,
      SIGN: accountSig,
      Accept: 'application/json',
    },
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = Math.floor(daysAgoMs(90) / 1000);
  const pnlParams = new URLSearchParams({
    from: String(fromSec),
    to: String(nowSec),
    limit: '100',
    offset: '0',
  });
  const pnlQuery = pnlParams.toString();
  const pnlPath = '/api/v4/futures/usdt/position_close';
  const pnlSignPath = '/futures/usdt/position_close';
  const pnlTimestamp = Math.floor(Date.now() / 1000).toString();
  const pnlPayload = `GET\n/api/v4${pnlSignPath}\n${pnlQuery}\n${sha512Hex('')}\n${pnlTimestamp}`;
  const pnlSig = hmacSha512Hex(apiSecret, pnlPayload);
  const pnlRes = await fetchJson(`https://api.gateio.ws${pnlPath}?${pnlQuery}`, {
    method: 'GET',
    headers: {
      KEY: apiKey,
      Timestamp: pnlTimestamp,
      SIGN: pnlSig,
      Accept: 'application/json',
    },
  });

  return {
    exchange: 'gateio',
    ok:
      accountRes.ok &&
      Array.isArray(accountRes.data) &&
      pnlRes.ok &&
      Array.isArray(pnlRes.data),
    accountStatus: accountRes.status,
    futuresStatus: pnlRes.status,
    accountCode:
      accountRes.data && !Array.isArray(accountRes.data)
        ? accountRes.data.label ?? accountRes.data.code ?? null
        : null,
    futuresCode:
      pnlRes.data && !Array.isArray(pnlRes.data)
        ? pnlRes.data.label ?? pnlRes.data.code ?? null
        : null,
    futuresCount: Array.isArray(pnlRes.data) ? pnlRes.data.length : null,
  };
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '..', 'keydata.env');
  const env = loadEnvFile(envPath);

  const results = [];
  results.push(await testBinance(env));
  results.push(await testOkx(env));
  results.push(await testBybit(env));
  results.push(await testBitget(env));
  results.push(await testGateio(env));

  const summary = {
    testedAt: new Date().toISOString(),
    allPassed: results.every((r) => r.ok),
    results,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
