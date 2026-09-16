const ARC_RPC = 'https://rpc.arc-scan.org';
const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_EXPLORER = 'https://explorer.arc.io/address/';
const RPC_TIMEOUT_MS = 8000;

const SELECTOR = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  fee: '0xddca3f43',
  liquidity: '0x1a686502',
  slot0: '0x3850c7bd',
  decimals: '0x313ce567',
  symbol: '0x95d89b41',
  balanceOf: '0x70a08231'
};

const byId = (id) => document.getElementById(id);

function setOnchainBadge(text, type) {
  const el = byId('onchainBadge');
  el.textContent = text;
  el.className = `mini-badge ${type}`;
}

function setCompositionBadge(text, type) {
  const el = byId('compositionBadge');
  el.textContent = text;
  el.className = `mini-badge ${type}`;
}

function setOnchainCompare(text, type) {
  const el = byId('compareOnchain');
  if (!el) return;
  el.textContent = text;
  el.className = `compare-status ${type}`;
}

function clearOnchain() {
  byId('onchainError').hidden = true;
  byId('onchainError').textContent = '';
  byId('onchainStatus').textContent = 'WAITING';
  byId('terminalOnchain').textContent = 'WAITING';
  setOnchainBadge('WAITING', 'loading');
  setCompositionBadge('WAITING', 'loading');
  setOnchainCompare('WAITING...', 'loading-text');
  ['chainPool','chainToken0','chainToken1','chainFee','chainTick','chainActiveLiquidity','reserve0','reserve1','reportedLiquidity','usdcReserve','usdcShare','chainPrice'].forEach((id) => {
    byId(id).textContent = '—';
  });
  byId('reserve0Label').textContent = 'TOKEN 0 RESERVE';
  byId('reserve1Label').textContent = 'TOKEN 1 RESERVE';
  byId('compositionWarning').textContent = 'Waiting for onchain pool data.';
  byId('compositionWarning').className = 'composition-warning';
  byId('poolExplorerLink').href = '#';
  byId('poolExplorerLink').classList.add('disabled');
}

async function rpc(method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(ARC_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || 'RPC error');
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

async function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

function decodeAddress(hex) {
  if (!hex || hex === '0x') return null;
  return `0x${hex.slice(-40)}`;
}

function decodeUint(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

function decodeSigned256(wordHex) {
  let n = BigInt(`0x${wordHex}`);
  const sign = 1n << 255n;
  if (n & sign) n -= 1n << 256n;
  return n;
}

function splitWords(hex) {
  const clean = String(hex || '').replace(/^0x/, '');
  const words = [];
  for (let i = 0; i < clean.length; i += 64) words.push(clean.slice(i, i + 64).padEnd(64, '0'));
  return words;
}

function balanceOfData(owner) {
  return SELECTOR.balanceOf + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

function formatUnits(value, decimals, max = 6) {
  const d = Number(decimals);
  const base = 10n ** BigInt(d);
  const whole = value / base;
  const rem = value % base;
  const places = Math.min(d, max);
  if (!places) return whole.toLocaleString();
  const fraction = rem.toString().padStart(d, '0').slice(0, places).replace(/0+$/, '');
  const wholeFormatted = Number(whole) <= Number.MAX_SAFE_INTEGER ? Number(whole).toLocaleString() : whole.toString();
  return fraction ? `${wholeFormatted}.${fraction}` : wholeFormatted;
}

function numericUnits(value, decimals) {
  const raw = Number(value.toString());
  return raw / (10 ** Number(decimals));
}

function formatMoney(value, max = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) > 0 && Math.abs(n) < 0.01) return `$${n.toLocaleString(undefined, { maximumSignificantDigits: 5 })}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n > 0 && n < 0.01) return '<0.01%';
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function shortAddress(address) {
  return address ? `${address.slice(0, 8)}…${address.slice(-6)}` : '—';
}

async function getDecimals(token) {
  try {
    const result = await ethCall(token, SELECTOR.decimals);
    return Number(decodeUint(result));
  } catch {
    return 18;
  }
}

function symbolFor(address, detail) {
  const lower = address.toLowerCase();
  if (lower === ARC_USDC.toLowerCase()) return 'USDC';
  const base = detail?.dexPair?.baseToken;
  const quote = detail?.dexPair?.quoteToken;
  if (base?.address?.toLowerCase() === lower && base?.symbol) return base.symbol;
  if (quote?.address?.toLowerCase() === lower && quote?.symbol) return quote.symbol;
  if (detail?.token?.toLowerCase() === lower && detail?.arcPadMeta?.symbol) return detail.arcPadMeta.symbol;
  return shortAddress(address);
}

function priceToken1PerToken0(sqrtPriceX96, dec0, dec1) {
  const q96 = 2 ** 96;
  const sqrt = Number(sqrtPriceX96.toString()) / q96;
  return sqrt * sqrt * (10 ** (dec0 - dec1));
}

function deriveTrackedPrice(token, token0, token1, p1Per0) {
  const t = token.toLowerCase();
  if (!Number.isFinite(p1Per0) || p1Per0 <= 0) return null;
  if (token0.toLowerCase() === t && token1.toLowerCase() === ARC_USDC.toLowerCase()) return p1Per0;
  if (token1.toLowerCase() === t && token0.toLowerCase() === ARC_USDC.toLowerCase()) return 1 / p1Per0;
  return null;
}

function resetForPool(pool) {
  clearOnchain();
  if (!pool) {
    byId('onchainStatus').textContent = 'NO POOL';
    byId('terminalOnchain').textContent = 'NO POOL';
    setOnchainBadge('NO POOL', 'bad');
    setCompositionBadge('N/A', 'neutral');
    setOnchainCompare('NO POOL', 'bad-text');
    byId('compositionWarning').textContent = 'No pool address was resolved, so no direct onchain pool analysis can run.';
    return false;
  }
  byId('chainPool').textContent = pool;
  byId('poolExplorerLink').href = `${ARC_EXPLORER}${pool}`;
  byId('poolExplorerLink').classList.remove('disabled');
  byId('onchainStatus').textContent = 'READING';
  byId('terminalOnchain').textContent = 'READING';
  setOnchainBadge('READING', 'loading');
  setCompositionBadge('CHECKING', 'loading');
  setOnchainCompare('READING...', 'loading-text');
  return true;
}

async function analyzePool(detail) {
  const { token, pool, dexPair } = detail;
  if (!resetForPool(pool)) return;

  try {
    const [token0Hex, token1Hex, feeHex, liquidityHex, slot0Hex] = await Promise.all([
      ethCall(pool, SELECTOR.token0),
      ethCall(pool, SELECTOR.token1),
      ethCall(pool, SELECTOR.fee),
      ethCall(pool, SELECTOR.liquidity),
      ethCall(pool, SELECTOR.slot0)
    ]);

    const token0 = decodeAddress(token0Hex);
    const token1 = decodeAddress(token1Hex);
    if (!token0 || !token1) throw new Error('Pool token addresses could not be decoded');

    const [dec0, dec1, balance0Hex, balance1Hex] = await Promise.all([
      getDecimals(token0),
      getDecimals(token1),
      ethCall(token0, balanceOfData(pool)),
      ethCall(token1, balanceOfData(pool))
    ]);

    const fee = Number(decodeUint(feeHex));
    const activeLiquidity = decodeUint(liquidityHex);
    const slotWords = splitWords(slot0Hex);
    const sqrtPriceX96 = BigInt(`0x${slotWords[0] || '0'}`);
    const tick = Number(decodeSigned256(slotWords[1] || ''.padStart(64, '0')));
    const balance0 = decodeUint(balance0Hex);
    const balance1 = decodeUint(balance1Hex);
    const sym0 = symbolFor(token0, detail);
    const sym1 = symbolFor(token1, detail);

    byId('chainToken0').textContent = `${sym0} // ${token0}`;
    byId('chainToken1').textContent = `${sym1} // ${token1}`;
    byId('chainFee').textContent = `${(fee / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
    byId('chainTick').textContent = tick.toLocaleString();
    byId('chainActiveLiquidity').textContent = activeLiquidity.toLocaleString();
    byId('reserve0Label').textContent = `${sym0} RESERVE`;
    byId('reserve1Label').textContent = `${sym1} RESERVE`;
    byId('reserve0').textContent = `${formatUnits(balance0, dec0, 6)} ${sym0}`;
    byId('reserve1').textContent = `${formatUnits(balance1, dec1, 6)} ${sym1}`;

    const p1Per0 = priceToken1PerToken0(sqrtPriceX96, dec0, dec1);
    const trackedPrice = deriveTrackedPrice(token, token0, token1, p1Per0);
    byId('chainPrice').textContent = trackedPrice ? formatMoney(trackedPrice, 8) : 'N/A';

    const reported = Number(dexPair?.liquidity?.usd);
    byId('reportedLiquidity').textContent = Number.isFinite(reported) ? formatMoney(reported, 0) : '—';

    const usdcIs0 = token0.toLowerCase() === ARC_USDC.toLowerCase();
    const usdcIs1 = token1.toLowerCase() === ARC_USDC.toLowerCase();
    let usdcBalance = null;
    if (usdcIs0) usdcBalance = numericUnits(balance0, dec0);
    if (usdcIs1) usdcBalance = numericUnits(balance1, dec1);
    byId('usdcReserve').textContent = usdcBalance == null ? 'NO USDC PAIR' : formatMoney(usdcBalance, 6);

    let tokenValueUsd = null;
    if (trackedPrice && (usdcIs0 || usdcIs1)) {
      const trackedIs0 = token0.toLowerCase() === token.toLowerCase();
      const trackedBalance = trackedIs0 ? numericUnits(balance0, dec0) : numericUnits(balance1, dec1);
      tokenValueUsd = trackedBalance * trackedPrice;
    }

    let usdcShare = null;
    if (usdcBalance != null && Number.isFinite(tokenValueUsd)) {
      const total = usdcBalance + tokenValueUsd;
      usdcShare = total > 0 ? (usdcBalance / total) * 100 : null;
    }
    byId('usdcShare').textContent = usdcShare == null ? '—' : formatPercent(usdcShare);

    let warning = 'Pool state read successfully. Compare the raw reserves with third-party market-data figures above.';
    let warningClass = 'composition-warning ok';
    let badgeText = 'BALANCED CHECK';
    let badgeType = 'ok';

    if (usdcBalance != null && Number.isFinite(tokenValueUsd)) {
      const total = usdcBalance + tokenValueUsd;
      const share = total > 0 ? usdcBalance / total : 0;
      if (share < 0.05) {
        warning = `Highly one-sided pool: only ${formatMoney(usdcBalance, 6)} is currently held as USDC, while the paired token inventory is worth roughly ${formatMoney(tokenValueUsd, 0)} at the current onchain price. Do not interpret headline liquidity as directly sellable USDC.`;
        warningClass = 'composition-warning bad';
        badgeText = 'HIGHLY ONE-SIDED';
        badgeType = 'bad';
      } else if (share < 0.2) {
        warning = `One-sided pool: USDC is about ${formatPercent(share * 100)} of the estimated pool value at this snapshot. Executable sell capacity may be much lower than headline liquidity.`;
        warningClass = 'composition-warning';
        badgeText = 'ONE-SIDED';
        badgeType = 'warn';
      }
    } else if (usdcBalance == null) {
      warning = 'This resolved pool is not paired directly with Arc USDC, so the monitor cannot calculate a USDC reserve comparison for it yet.';
      warningClass = 'composition-warning';
      badgeText = 'NON-USDC PAIR';
      badgeType = 'warn';
    }

    byId('compositionWarning').textContent = warning;
    byId('compositionWarning').className = warningClass;
    setCompositionBadge(badgeText, badgeType);
    setOnchainBadge('LIVE', 'ok');
    setOnchainCompare('LIVE READ', 'ok-text');
    byId('onchainStatus').textContent = 'LIVE';
    byId('terminalOnchain').textContent = 'LIVE';
  } catch (error) {
    byId('onchainError').hidden = false;
    byId('onchainError').textContent = 'Direct Arc RPC pool analysis could not complete. This is an upstream/read failure, not proof that the pool is missing. Retry the check.';
    byId('onchainStatus').textContent = 'INCOMPLETE';
    byId('terminalOnchain').textContent = 'RETRY';
    setOnchainBadge('RETRY', 'warn');
    setCompositionBadge('INCOMPLETE', 'warn');
    setOnchainCompare('RETRY NEEDED', 'warn-text');
    byId('compositionWarning').textContent = 'Onchain reserve analysis is incomplete because one or more JSON-RPC reads failed.';
    byId('compositionWarning').className = 'composition-warning';
    console.warn('Arc Launch Monitor onchain analysis failed:', error);
  }
}

window.addEventListener('arc-monitor-reset', () => clearOnchain());
window.addEventListener('arc-monitor-result', (event) => analyzePool(event.detail));
clearOnchain();
