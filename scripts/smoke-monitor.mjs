const ARCPAD = 'https://arcpad.meme';
const DEX = 'https://api.dexscreener.com/latest/dex/tokens/';
const RPC = 'https://rpc.arc-scan.org';
const USDC = '0x3600000000000000000000000000000000000000';
const EXIT = '0x1b556933D64AE9bb32044711C5393B2E5663d185'.toLowerCase();
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  assert(response.ok, `${url} -> HTTP ${response.status}`);
  return response.json();
}

async function rpc(to, data) {
  const body = await json(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] })
  });
  assert(!body.error, `RPC error for ${to}: ${body.error?.message}`);
  return body.result;
}

function addr(hex) {
  return `0x${String(hex).slice(-40)}`;
}
function uint(hex) {
  return BigInt(hex || '0x0');
}
function balanceOf(owner) {
  return SEL.balanceOf + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}
async function decimals(token) {
  if (token.toLowerCase() === USDC.toLowerCase()) return 6;
  return Number(uint(await rpc(token, SEL.decimals)));
}
function unit(raw, dec) {
  return Number(raw.toString()) / 10 ** dec;
}
function words(hex) {
  const clean = String(hex || '').replace(/^0x/, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 64) out.push(clean.slice(i, i + 64));
  return out;
}
function money(n) {
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 6 });
}

async function discoverCandidates() {
  const data = await json(`${ARCPAD}/api/tokens?limit=200`);
  const rows = Array.isArray(data?.creations) ? data.creations :
    Array.isArray(data?.tokens) ? data.tokens :
    Array.isArray(data) ? data : [];
  assert(rows.length >= 3, `ArcPad token list returned only ${rows.length} rows`);
  return rows
    .filter((row) => row?.token && row?.pool && row.token.toLowerCase() !== EXIT)
    .sort((a, b) => Number(b.volume24Usd || 0) - Number(a.volume24Usd || 0))
    .slice(0, 3);
}

async function testToken(seed) {
  const token = seed.token;
  console.log(`\n=== ${seed.name} (${seed.symbol}) ===`);
  console.log(`token: ${token}`);
  console.log(`ArcPad pool: ${seed.pool}`);

  const meta = await json(`${ARCPAD}/api/token/${token}/meta`);
  const m = meta?.meta || meta;
  assert(m?.pool, 'ArcPad metadata has no pool');
  assert(m.pool.toLowerCase() === seed.pool.toLowerCase(), 'ArcPad list/meta pool mismatch');
  console.log(`ArcPad metadata: PASS | price=${m.price ?? 'n/a'} mcap=${m.marketCapUsd ?? 'n/a'}`);

  const dex = await json(`${DEX}${token}`);
  const arcPairs = (Array.isArray(dex?.pairs) ? dex.pairs : []).filter((pair) => {
    const chain = String(pair?.chainId || '').toLowerCase();
    return chain === 'arc' || chain === 'arc-mainnet' || chain.startsWith('arc-');
  });
  arcPairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  const launchPair = arcPairs.find((pair) => pair?.pairAddress?.toLowerCase() === m.pool.toLowerCase());
  console.log(`DexScreener: ${arcPairs.length ? 'PASS' : 'NOT YET INDEXED'} | Arc pairs=${arcPairs.length}${launchPair ? ' | launch pool matched' : ''}`);
  if (arcPairs.length) {
    console.log(`Top reported market: ${arcPairs[0].pairAddress} | liquidity=${money(arcPairs[0]?.liquidity?.usd || 0)}`);
  }

  const pool = m.pool;
  const [t0Hex, t1Hex, feeHex, liqHex, slotHex] = await Promise.all([
    rpc(pool, SEL.token0), rpc(pool, SEL.token1), rpc(pool, SEL.fee), rpc(pool, SEL.liquidity), rpc(pool, SEL.slot0)
  ]);
  const token0 = addr(t0Hex);
  const token1 = addr(t1Hex);
  const lower = token.toLowerCase();
  assert([token0.toLowerCase(), token1.toLowerCase()].includes(lower), 'Tracked token is not in resolved pool');
  assert([token0.toLowerCase(), token1.toLowerCase()].includes(USDC.toLowerCase()), 'ArcPad launch pool is not directly paired with Arc USDC');
  const fee = Number(uint(feeHex));
  const L = uint(liqHex);
  assert(fee > 0, 'fee() returned 0');
  assert(L > 0n, 'liquidity() returned 0');
  const slotWords = words(slotHex);
  const sqrtP = BigInt(`0x${slotWords[0]}`);
  assert(sqrtP > 0n, 'slot0 sqrtPriceX96 is 0');
  console.log(`Pool RPC: PASS | token0=${token0} token1=${token1} fee=${fee / 10000}% L=${L}`);

  const [dec0, dec1, b0Hex, b1Hex] = await Promise.all([
    decimals(token0), decimals(token1), rpc(token0, balanceOf(pool)), rpc(token1, balanceOf(pool))
  ]);
  const b0 = unit(uint(b0Hex), dec0);
  const b1 = unit(uint(b1Hex), dec1);
  const trackedIs0 = token0.toLowerCase() === lower;
  const usdcIs0 = token0.toLowerCase() === USDC.toLowerCase();
  const usdcReserve = usdcIs0 ? b0 : b1;
  const trackedBalance = trackedIs0 ? b0 : b1;
  assert(Number.isFinite(usdcReserve) && usdcReserve >= 0, 'USDC reserve decode failed');
  assert(Number.isFinite(trackedBalance) && trackedBalance >= 0, 'Tracked reserve decode failed');
  console.log(`Balances: PASS | token=${trackedBalance.toLocaleString()} | USDC=${money(usdcReserve)}`);

  const xVirtual = (Number(L.toString()) * Q96 / Number(sqrtP.toString())) / 10 ** dec0;
  const yVirtual = (Number(L.toString()) * Number(sqrtP.toString()) / Q96) / 10 ** dec1;
  const virtualIn = trackedIs0 ? xVirtual : yVirtual;
  const virtualOut = trackedIs0 ? yVirtual : xVirtual;
  const feeFraction = fee / 1_000_000;
  const sampleIn = Math.max(1, trackedBalance * 0.001);
  const effective = sampleIn * (1 - feeFraction);
  const modeled = virtualOut - ((virtualIn * virtualOut) / (virtualIn + effective));
  const output = Math.max(0, Math.min(modeled, usdcReserve));
  assert(Number.isFinite(output) && output >= 0 && output <= usdcReserve + 1e-9, 'Depth estimate failed sanity check');
  console.log(`Depth math: PASS | sample sell=${sampleIn.toLocaleString()} ${seed.symbol} -> local estimate ${money(output)}`);

  return {
    name: seed.name,
    symbol: seed.symbol,
    token,
    pool,
    dexPairs: arcPairs.length,
    launchPoolIndexed: Boolean(launchPair),
    usdcReserve,
    fee,
    activeLiquidity: L.toString()
  };
}

const candidates = await discoverCandidates();
console.log('Arc Launch Monitor live smoke test');
console.log(`Testing three unrelated ArcPad launches selected by 24h volume (excluding $EXIT).`);
console.log(candidates.map((x) => `${x.name} (${x.symbol}) ${x.token}`).join('\n'));

const results = [];
for (const candidate of candidates) results.push(await testToken(candidate));

console.log('\n=== SUMMARY ===');
for (const result of results) {
  console.log(`PASS ${result.name} (${result.symbol}) | Dex pairs=${result.dexPairs} | launchPoolIndexed=${result.launchPoolIndexed} | USDC=${money(result.usdcReserve)}`);
}
console.log(`\nPASS: ${results.length}/3 live Arc token smoke tests completed.`);
