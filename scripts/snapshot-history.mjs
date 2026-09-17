import fs from 'node:fs/promises';

const CONFIG_PATH = 'monitor/history-config.json';
const DATA_PATH = 'monitor/history-data.json';
const ARCPAD = 'https://arcpad.meme';
const DEX = 'https://api.dexscreener.com/latest/dex/tokens/';
const RPC = 'https://rpc.arc-scan.org';
const USDC = '0x3600000000000000000000000000000000000000';
const Q96 = 2 ** 96;
const SEL = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  fee: '0xddca3f43',
  liquidity: '0x1a686502',
  slot0: '0x3850c7bd',
  decimals: '0x313ce567',
  balanceOf: '0x70a08231'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestJson(url, options = {}, retries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (response.ok) return response.json();
      const transient = response.status === 429 || response.status >= 500;
      lastError = new Error(`${url} -> HTTP ${response.status}`);
      if (!transient || attempt === retries) throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await sleep(500 * attempt);
  }
  throw lastError;
}

async function rpc(to, data) {
  const body = await requestJson(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  }, 5);
  if (body?.error) throw new Error(`RPC ${to}: ${body.error.message || 'unknown error'}`);
  return body.result;
}

function address(hex) {
  if (!hex || hex === '0x') return null;
  return `0x${String(hex).slice(-40)}`;
}

function uint(hex) {
  return (!hex || hex === '0x') ? 0n : BigInt(hex);
}

function words(hex) {
  const clean = String(hex || '').replace(/^0x/, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 64) out.push(clean.slice(i, i + 64).padEnd(64, '0'));
  return out;
}

function signedWord(word) {
  let value = BigInt(`0x${word || '0'}`);
  if ((value & (1n << 255n)) !== 0n) value -= 1n << 256n;
  return Number(value);
}

function balanceOf(owner) {
  return SEL.balanceOf + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function decimals(token) {
  if (token.toLowerCase() === USDC.toLowerCase()) return 6;
  try {
    return Number(uint(await rpc(token, SEL.decimals)));
  } catch {
    return 18;
  }
}

function units(raw, dec) {
  return Number(raw.toString()) / 10 ** dec;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function classifyComposition(usdcSharePct) {
  if (!Number.isFinite(usdcSharePct)) return 'UNAVAILABLE';
  const edge = Math.min(usdcSharePct, 100 - usdcSharePct);
  if (edge < 5) return 'HIGHLY_ONE_SIDED';
  if (edge < 20) return 'ONE_SIDED';
  if (usdcSharePct >= 35 && usdcSharePct <= 65) return 'MORE_BALANCED';
  return 'SKEWED';
}

function arcPairs(data) {
  const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
  const seen = new Set();
  return pairs.filter((pair) => {
    const chain = String(pair?.chainId || '').toLowerCase();
    if (!(chain === 'arc' || chain === 'arc-mainnet' || chain.startsWith('arc-'))) return false;
    const pool = String(pair?.pairAddress || '').toLowerCase();
    if (!pool || seen.has(pool)) return false;
    seen.add(pool);
    return true;
  }).sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
}

async function collectToken(seed, capturedAt) {
  const token = seed.address;
  const lowerToken = token.toLowerCase();
  const [metaResponse, dexResponse] = await Promise.all([
    requestJson(`${ARCPAD}/api/token/${token}/meta`),
    requestJson(`${DEX}${token}`)
  ]);
  const meta = metaResponse?.meta || metaResponse || {};
  const pairs = arcPairs(dexResponse);
  const topPair = pairs[0] || null;
  const launchPool = meta?.pool || null;
  const launchPair = launchPool ? pairs.find((pair) => String(pair?.pairAddress || '').toLowerCase() === launchPool.toLowerCase()) || null : null;
  const pool = launchPool || topPair?.pairAddress || null;
  if (!pool) throw new Error('No Arc pool resolved from ArcPad or DexScreener');

  const [token0Hex, token1Hex, feeHex, liquidityHex, slot0Hex] = await Promise.all([
    rpc(pool, SEL.token0),
    rpc(pool, SEL.token1),
    rpc(pool, SEL.fee),
    rpc(pool, SEL.liquidity),
    rpc(pool, SEL.slot0)
  ]);
  const token0 = address(token0Hex);
  const token1 = address(token1Hex);
  if (!token0 || !token1) throw new Error('Pool token addresses could not be decoded');

  const [dec0, dec1, balance0Hex, balance1Hex] = await Promise.all([
    decimals(token0),
    decimals(token1),
    rpc(token0, balanceOf(pool)),
    rpc(token1, balanceOf(pool))
  ]);

  const balance0 = units(uint(balance0Hex), dec0);
  const balance1 = units(uint(balance1Hex), dec1);
  const fee = Number(uint(feeHex));
  const activeLiquidity = uint(liquidityHex);
  const slot = words(slot0Hex);
  const sqrtPriceX96 = BigInt(`0x${slot[0] || '0'}`);
  const currentTick = signedWord(slot[1]);

  const t0 = token0.toLowerCase();
  const t1 = token1.toLowerCase();
  const usdc = USDC.toLowerCase();
  const trackedIs0 = t0 === lowerToken;
  const trackedIs1 = t1 === lowerToken;
  const usdcIs0 = t0 === usdc;
  const usdcIs1 = t1 === usdc;
  const directUsdc = usdcIs0 || usdcIs1;
  const trackedBalance = trackedIs0 ? balance0 : (trackedIs1 ? balance1 : null);
  const usdcReserve = usdcIs0 ? balance0 : (usdcIs1 ? balance1 : null);

  let onchainPriceUsd = null;
  if ((trackedIs0 || trackedIs1) && directUsdc && sqrtPriceX96 > 0n) {
    const sqrt = Number(sqrtPriceX96.toString()) / Q96;
    const p1Per0 = sqrt * sqrt * 10 ** (dec0 - dec1);
    if (trackedIs0 && usdcIs1) onchainPriceUsd = p1Per0;
    if (trackedIs1 && usdcIs0 && p1Per0 > 0) onchainPriceUsd = 1 / p1Per0;
  }

  let tokenValueUsd = null;
  let usdcSharePct = null;
  if (Number.isFinite(trackedBalance) && Number.isFinite(onchainPriceUsd) && Number.isFinite(usdcReserve)) {
    tokenValueUsd = trackedBalance * onchainPriceUsd;
    const total = tokenValueUsd + usdcReserve;
    if (total > 0) usdcSharePct = (usdcReserve / total) * 100;
  }

  const reportedPair = launchPair || topPair;
  const buys = Number(reportedPair?.txns?.h24?.buys || 0);
  const sells = Number(reportedPair?.txns?.h24?.sells || 0);

  return {
    timestamp: capturedAt,
    pool,
    poolSource: launchPool ? 'arcpad_launch' : 'dex_top_reported',
    dexPairCount: pairs.length,
    priceUsd: finite(onchainPriceUsd ?? meta?.price ?? reportedPair?.priceUsd),
    arcPadPriceUsd: finite(meta?.price),
    reportedLiquidityUsd: finite(reportedPair?.liquidity?.usd),
    reportedVolume24hUsd: finite(reportedPair?.volume?.h24),
    reportedTxns24h: buys + sells,
    marketCapUsd: finite(meta?.marketCapUsd ?? reportedPair?.marketCap ?? reportedPair?.fdv),
    usdcReserve: finite(usdcReserve),
    tokenReserve: finite(trackedBalance),
    tokenValueAtSpotUsd: finite(tokenValueUsd),
    usdcSharePct: finite(usdcSharePct),
    composition: classifyComposition(usdcSharePct),
    feeTier: fee,
    feePercent: fee / 10000,
    activeLiquidity: activeLiquidity.toString(),
    currentTick,
    token0,
    token1,
    directUsdcPair: directUsdc
  };
}

const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
let store;
try {
  store = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'));
} catch {
  store = { schemaVersion: 1, generatedAt: null, intervalHours: config.intervalHours, retentionDays: config.retentionDays, tokens: {} };
}

store.schemaVersion = 1;
store.intervalHours = config.intervalHours;
store.retentionDays = config.retentionDays;
store.tokens ||= {};
const capturedAt = new Date().toISOString();
const cutoff = Date.now() - Number(config.retentionDays || 30) * 24 * 60 * 60 * 1000;
let successes = 0;

console.log(`Arc Launch Monitor history capture @ ${capturedAt}`);
for (const seed of config.tokens) {
  const key = seed.address.toLowerCase();
  const current = store.tokens[key] || {
    name: seed.name,
    symbol: seed.symbol,
    address: seed.address,
    snapshots: []
  };
  current.name = seed.name;
  current.symbol = seed.symbol;
  current.address = seed.address;
  current.snapshots = Array.isArray(current.snapshots) ? current.snapshots : [];
  current.snapshots = current.snapshots.filter((snap) => {
    const time = Date.parse(snap?.timestamp || '');
    return Number.isFinite(time) && time >= cutoff;
  });

  try {
    const snapshot = await collectToken(seed, capturedAt);
    current.snapshots.push(snapshot);
    current.lastSuccessAt = capturedAt;
    current.lastError = null;
    successes += 1;
    console.log(`PASS ${seed.symbol}: pool=${snapshot.pool} USDC=${snapshot.usdcReserve ?? 'n/a'} reported=${snapshot.reportedLiquidityUsd ?? 'n/a'} tick=${snapshot.currentTick}`);
  } catch (error) {
    current.lastError = { timestamp: capturedAt, message: String(error?.message || error) };
    console.warn(`WARN ${seed.symbol}: ${current.lastError.message}`);
  }

  store.tokens[key] = current;
  await sleep(350);
}

store.generatedAt = capturedAt;
store.capture = { attempted: config.tokens.length, succeeded: successes };
await fs.writeFile(DATA_PATH, `${JSON.stringify(store, null, 2)}\n`);
console.log(`Wrote ${DATA_PATH}: ${successes}/${config.tokens.length} token snapshots captured.`);
if (successes === 0) process.exitCode = 1;
