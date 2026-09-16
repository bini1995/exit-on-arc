const EXIT_TOKEN = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
const ARC_CHAIN_ID = '5042';
const ARCPAD_BASE = 'https://arcpad.meme';
const DEX_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens/';

const $ = (id) => document.getElementById(id);
const form = $('tokenForm');
const input = $('tokenInput');
const toast = $('toast');

input.value = new URLSearchParams(location.search).get('token') || EXIT_TOKEN;

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function short(value, left = 6, right = 4) {
  if (!value) return '—';
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function money(value, max = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) > 0 && Math.abs(n) < 0.01) {
    return `$${n.toLocaleString(undefined, { maximumSignificantDigits: 5 })}`;
  }
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;
}

function integer(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function badge(id, text, type) {
  const el = $(id);
  el.textContent = text;
  el.className = `badge ${type}`;
}

function compare(id, text, type) {
  const el = $(id);
  el.textContent = text;
  el.className = `compare-status ${type}`;
}

function showToast(text = 'COPIED') {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

async function copy(text, label = 'COPIED') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
  } catch {
    showToast('COPY FAILED');
  }
}

function setLink(id, href) {
  const el = $(id);
  if (!href) {
    el.href = '#';
    el.classList.add('disabled');
    return;
  }
  el.href = href;
  el.classList.remove('disabled');
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
}

function reset(token) {
  $('errorBox').hidden = true;
  $('errorBox').textContent = '';
  $('tokenTitle').textContent = 'CHECKING THE EXIT...';
  $('lastChecked').textContent = 'RUNNING...';
  $('arcContract').textContent = token;
  $('summaryToken').textContent = token;
  $('terminalToken').textContent = short(token, 8, 6).toUpperCase();
  $('terminalArcPad').textContent = 'CHECKING';
  $('terminalPool').textContent = 'CHECKING';
  $('terminalDex').textContent = 'CHECKING';
  $('terminalStatus').textContent = 'RUNNING_';
  badge('arcPadBadge', 'CHECKING', 'loading');
  badge('poolBadge', 'CHECKING', 'loading');
  badge('dexBadge', 'CHECKING', 'loading');
  badge('summaryBadge', 'CHECKING', 'loading');
  compare('compareArcPad', 'CHECKING...', 'loading-text');
  compare('compareDex', 'CHECKING...', 'loading-text');
  $('arcPadHeadline').textContent = 'Looking for launch metadata';
  $('arcPadCopy').textContent = "Querying ArcPad's public developer API.";
  $('arcPadPool').textContent = '—';
  $('arcPadPrice').textContent = '—';
  $('arcPadMcap').textContent = '—';
  $('poolHeadline').textContent = 'Resolving market';
  $('poolCopy').textContent = 'Looking for an indexed pool associated with this contract.';
  $('poolAddress').textContent = '—';
  $('copyPool').disabled = true;
  $('copyPool').dataset.pool = '';
  $('dexHeadline').textContent = 'Searching indexed pairs';
  $('dexCopy').textContent = "Querying DexScreener's public market-data API.";
  $('dexLiquidity').textContent = '—';
  $('dexVolume').textContent = '—';
  $('dexMcap').textContent = '—';
  $('dexTxns').textContent = '—';
  $('summaryHeadline').textContent = 'Running checks';
  $('summaryCopy').textContent = 'Waiting for live sources to respond.';
  $('exitFomoNote').hidden = token.toLowerCase() !== EXIT_TOKEN.toLowerCase();
  setLink('arcPadLink', null);
  setLink('dexLink', null);
  const explorer = `https://arcscan.app/address/${token}`;
  $('arcscanLink').href = explorer;
  $('arcCardLink').href = explorer;
}

async function getArcPad(token) {
  const url = `${ARCPAD_BASE}/api/token/${token}/meta`;
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`ArcPad HTTP ${response.status}`);
    const data = await response.json();
    const meta = data?.meta;
    if (!meta || !meta.name) return { found: false };
    return { found: true, meta };
  } catch (error) {
    return { found: false, error };
  }
}

async function getDex(token) {
  try {
    const response = await fetch(`${DEX_TOKEN_API}${token}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
    const data = await response.json();
    const allPairs = Array.isArray(data?.pairs) ? data.pairs : [];
    const arcPairs = allPairs.filter((p) => String(p?.chainId || '').toLowerCase() === 'arc');
    const pairs = arcPairs.length ? arcPairs : allPairs;
    if (!pairs.length) return { found: false };
    pairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
    return { found: true, pair: pairs[0], pairs };
  } catch (error) {
    return { found: false, error };
  }
}

function renderArcPad(result) {
  if (!result.found) {
    badge('arcPadBadge', result.error ? 'UNAVAILABLE' : 'NOT FOUND', result.error ? 'warn' : 'bad');
    $('arcPadHeadline').textContent = result.error ? 'ArcPad API unavailable' : 'No ArcPad launch metadata found';
    $('arcPadCopy').textContent = result.error ? 'The browser could not retrieve ArcPad metadata during this check.' : 'This address may not have launched through ArcPad, or the launch has not indexed there yet.';
    $('terminalArcPad').textContent = result.error ? 'UNAVAILABLE' : 'NOT FOUND';
    compare('compareArcPad', result.error ? 'UNAVAILABLE' : 'NOT INDEXED', result.error ? 'warn-text' : 'bad-text');
    return null;
  }

  const m = result.meta;
  badge('arcPadBadge', 'INDEXED', 'ok');
  $('arcPadHeadline').textContent = `${m.name} (${m.symbol})`;
  $('arcPadCopy').textContent = 'ArcPad returned launch metadata and current pricing information.';
  $('arcPadPool').textContent = m.pool || '—';
  $('arcPadPrice').textContent = money(m.price, 8);
  $('arcPadMcap').textContent = money(m.marketCapUsd, 0);
  $('terminalArcPad').textContent = 'INDEXED';
  compare('compareArcPad', 'INDEXED', 'ok-text');
  setLink('arcPadLink', `${ARCPAD_BASE}/token/${input.value.trim()}`);
  return m;
}

function renderDex(result) {
  if (!result.found) {
    badge('dexBadge', result.error ? 'UNAVAILABLE' : 'NOT FOUND', result.error ? 'warn' : 'bad');
    $('dexHeadline').textContent = result.error ? 'DexScreener API unavailable' : 'No indexed pair found';
    $('dexCopy').textContent = result.error ? 'The browser could not retrieve market data during this check.' : 'DexScreener did not return a pair for this contract yet.';
    $('terminalDex').textContent = result.error ? 'UNAVAILABLE' : 'NOT INDEXED';
    compare('compareDex', result.error ? 'UNAVAILABLE' : 'NOT INDEXED', result.error ? 'warn-text' : 'bad-text');
    return null;
  }

  const p = result.pair;
  const buys = Number(p?.txns?.h24?.buys || 0);
  const sells = Number(p?.txns?.h24?.sells || 0);
  badge('dexBadge', 'INDEXED', 'ok');
  $('dexHeadline').textContent = `${p?.baseToken?.symbol || 'TOKEN'} / ${p?.quoteToken?.symbol || 'PAIR'}`;
  $('dexCopy').textContent = `${p?.dexId ? p.dexId.toUpperCase() : 'DEX'} market indexed with live market data.`;
  $('dexLiquidity').textContent = money(p?.liquidity?.usd, 0);
  $('dexVolume').textContent = money(p?.volume?.h24, 0);
  $('dexMcap').textContent = money(p?.marketCap ?? p?.fdv, 0);
  $('dexTxns').textContent = integer(buys + sells);
  $('terminalDex').textContent = 'INDEXED';
  compare('compareDex', 'INDEXED', 'ok-text');
  setLink('dexLink', p?.url || null);
  return p;
}

function renderPool(arcPadMeta, dexPair) {
  const pool = arcPadMeta?.pool || dexPair?.pairAddress || null;
  if (!pool) {
    badge('poolBadge', 'NOT FOUND', 'bad');
    $('poolHeadline').textContent = 'No pool resolved';
    $('poolCopy').textContent = 'Neither live source returned a pool address during this check.';
    $('terminalPool').textContent = 'NOT FOUND';
    return null;
  }

  badge('poolBadge', 'POOL FOUND', 'ok');
  $('poolHeadline').textContent = 'Market pool resolved';
  $('poolCopy').textContent = arcPadMeta?.pool && dexPair?.pairAddress && arcPadMeta.pool.toLowerCase() === dexPair.pairAddress.toLowerCase()
    ? 'ArcPad and DexScreener agree on the same pool address.'
    : 'A market pool address was returned by at least one live source.';
  $('poolAddress').textContent = pool;
  $('copyPool').disabled = false;
  $('copyPool').dataset.pool = pool;
  $('terminalPool').textContent = 'POOL FOUND';
  return pool;
}

function summarize(token, arcPad, dex, pool) {
  const liveCount = Number(Boolean(arcPad?.found)) + Number(Boolean(dex?.found));
  if (liveCount === 2 && pool) {
    badge('summaryBadge', 'PROPAGATED', 'ok');
    $('summaryHeadline').textContent = 'Launch data is propagating';
    $('summaryCopy').textContent = 'ArcPad and DexScreener both currently recognize this token, with a market pool resolved.';
    $('terminalStatus').textContent = 'PROPAGATED_';
    $('tokenTitle').textContent = arcPad?.meta ? `${arcPad.meta.name} // ${arcPad.meta.symbol}` : 'TOKEN FOUND';
  } else if (liveCount >= 1) {
    badge('summaryBadge', 'PARTIAL', 'warn');
    $('summaryHeadline').textContent = 'Partial propagation detected';
    $('summaryCopy').textContent = 'At least one live source recognizes the token, but indexing is not yet consistent across checked services.';
    $('terminalStatus').textContent = 'PARTIAL_';
    $('tokenTitle').textContent = arcPad?.meta ? `${arcPad.meta.name} // ${arcPad.meta.symbol}` : `TOKEN // ${short(token)}`;
  } else {
    badge('summaryBadge', 'NO DATA', 'bad');
    $('summaryHeadline').textContent = 'No live indexed data found';
    $('summaryCopy').textContent = 'The token may be new, unsupported by these sources, or temporarily unavailable.';
    $('terminalStatus').textContent = 'NO DATA_';
    $('tokenTitle').textContent = `TOKEN // ${short(token)}`;
  }
}

async function run(token) {
  token = token.trim();
  if (!isAddress(token)) {
    $('errorBox').hidden = false;
    $('errorBox').textContent = 'Enter a valid EVM contract address: 0x followed by 40 hexadecimal characters.';
    input.focus();
    return;
  }

  input.value = token;
  const params = new URLSearchParams(location.search);
  params.set('token', token);
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  reset(token);

  const [arcPadResult, dexResult] = await Promise.all([getArcPad(token), getDex(token)]);
  const arcPadMeta = renderArcPad(arcPadResult);
  const dexPair = renderDex(dexResult);
  const pool = renderPool(arcPadMeta, dexPair);
  summarize(token, arcPadResult, dexResult, pool);
  $('lastChecked').textContent = new Date().toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).toUpperCase();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  run(input.value);
});

$('loadExit').addEventListener('click', () => run(EXIT_TOKEN));
$('copyMonitorLink').addEventListener('click', () => copy(location.href, 'MONITOR LINK COPIED'));
$('copyToken').addEventListener('click', () => copy(input.value.trim(), 'TOKEN ADDRESS COPIED'));
$('copyPool').addEventListener('click', () => {
  const pool = $('copyPool').dataset.pool;
  if (pool) copy(pool, 'POOL ADDRESS COPIED');
});

run(input.value);
