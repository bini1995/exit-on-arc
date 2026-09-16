const EXIT_TOKEN = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
const ARC_CHAIN_ID = '5042';
const ARCPAD_BASE = 'https://arcpad.meme';
const DEX_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens/';
const REQUEST_TIMEOUT_MS = 8000;

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

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
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
  if ($('terminalOnchain')) $('terminalOnchain').textContent = 'WAITING';
  $('terminalStatus').textContent = 'RUNNING_';
  badge('arcPadBadge', 'CHECKING', 'loading');
  badge('poolBadge', 'CHECKING', 'loading');
  badge('dexBadge', 'CHECKING', 'loading');
  badge('summaryBadge', 'CHECKING', 'loading');
  compare('compareArcPad', 'CHECKING...', 'loading-text');
  compare('compareDex', 'CHECKING...', 'loading-text');
  if ($('compareOnchain')) compare('compareOnchain', 'WAITING...', 'loading-text');
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

  setLink('arcPadLink', `${ARCPAD_BASE}/token/${token}`);
  setLink('dexLink', null);

  const explorer = `https://explorer.arc.io/address/${token}`;
  $('arcscanLink').href = explorer;
  $('arcCardLink').href = explorer;

  window.dispatchEvent(new CustomEvent('arc-monitor-reset', { detail: { token } }));
}

function normalizeArcPadMeta(value) {
  if (!value || typeof value !== 'object') return null;
  const nested = value.meta && typeof value.meta === 'object' ? value.meta : value;
  const name = nested.name ?? value.name;
  const symbol = nested.symbol ?? value.symbol;
  if (!name && !symbol) return null;
  return {
    ...nested,
    name: name || 'Unknown token',
    symbol: symbol || '—',
    pool: nested.pool ?? value.pool ?? value.poolAddress ?? null,
    pad: nested.pad ?? value.pad ?? null,
    price: nested.price ?? value.price ?? null,
    marketCapUsd: nested.marketCapUsd ?? value.marketCapUsd ?? value.marketCap ?? value.fdv ?? null,
  };
}

function extractTokenRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.tokens)) return data.tokens;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function rowAddress(row) {
  return String(row?.address ?? row?.tokenAddress ?? row?.token ?? row?.contractAddress ?? '').toLowerCase();
}

async function getArcPad(token) {
  const wanted = token.toLowerCase();
  const addressVariants = [...new Set([token, wanted])];
  let successfulRead = false;
  let transientError = null;

  for (const address of addressVariants) {
    try {
      const result = await fetchJson(`${ARCPAD_BASE}/api/token/${address}/meta`);
      if (result.ok) {
        successfulRead = true;
        const meta = normalizeArcPadMeta(result.data?.meta ?? result.data);
        if (meta) return { found: true, meta, source: 'meta' };
      } else if (result.status === 404) {
        successfulRead = true;
      } else {
        transientError = new Error(`ArcPad HTTP ${result.status}`);
      }
    } catch (error) {
      transientError = error;
    }
  }

  try {
    const result = await fetchJson(`${ARCPAD_BASE}/api/tokens?limit=50&q=${encodeURIComponent(token)}`);
    if (result.ok) {
      successfulRead = true;
      const rows = extractTokenRows(result.data);
      const exact = rows.find((row) => rowAddress(row) === wanted);
      const candidate = exact || (rows.length === 1 ? rows[0] : null);
      const meta = normalizeArcPadMeta(candidate);
      if (meta) return { found: true, meta, source: 'search' };
    } else if (result.status !== 404) {
      transientError = new Error(`ArcPad search HTTP ${result.status}`);
    }
  } catch (error) {
    transientError = error;
  }

  if (successfulRead) return { found: false, error: null };
  return { found: false, error: transientError || new Error('ArcPad request failed') };
}

async function getDex(token) {
  try {
    const result = await fetchJson(`${DEX_TOKEN_API}${token}`);
    if (!result.ok) throw new Error(`DexScreener HTTP ${result.status}`);
    const allPairs = Array.isArray(result.data?.pairs) ? result.data.pairs : [];
    const arcPairs = allPairs.filter((pair) => {
      const chain = String(pair?.chainId || '').toLowerCase();
      return chain === 'arc' || chain === 'arc-mainnet' || chain.startsWith('arc-');
    });
    if (!arcPairs.length) return { found: false };
    arcPairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
    return { found: true, pair: arcPairs[0], pairs: arcPairs };
  } catch (error) {
    return { found: false, error };
  }
}

function renderArcPad(result) {
  if (!result.found) {
    badge('arcPadBadge', result.error ? 'UNAVAILABLE' : 'NOT FOUND', result.error ? 'warn' : 'bad');
    $('arcPadHeadline').textContent = result.error ? 'ArcPad check incomplete' : 'No ArcPad launch metadata found';
    $('arcPadCopy').textContent = result.error
      ? 'ArcPad could not be read reliably during this check. This is not evidence that the token does not exist — retry or use the ArcPad link below.'
      : 'ArcPad responded, but did not return launch metadata for this contract.';
    $('terminalArcPad').textContent = result.error ? 'UNAVAILABLE' : 'NOT FOUND';
    compare('compareArcPad', result.error ? 'RETRY NEEDED' : 'NOT INDEXED', result.error ? 'warn-text' : 'bad-text');
    return null;
  }
  const m = result.meta;
  badge('arcPadBadge', 'INDEXED', 'ok');
  $('arcPadHeadline').textContent = `${m.name} (${m.symbol})`;
  $('arcPadCopy').textContent = result.source === 'search'
    ? 'ArcPad launch metadata was resolved through the token-list fallback.'
    : 'ArcPad returned launch metadata and current pricing information.';
  $('arcPadPool').textContent = m.pool || '—';
  $('arcPadPrice').textContent = money(m.price, 8);
  $('arcPadMcap').textContent = money(m.marketCapUsd, 0);
  $('terminalArcPad').textContent = 'INDEXED';
  compare('compareArcPad', 'INDEXED', 'ok-text');
  return m;
}

function renderDex(result) {
  if (!result.found) {
    badge('dexBadge', result.error ? 'UNAVAILABLE' : 'NOT FOUND', result.error ? 'warn' : 'bad');
    $('dexHeadline').textContent = result.error ? 'DexScreener check incomplete' : 'No Arc pair indexed';
    $('dexCopy').textContent = result.error
      ? 'DexScreener could not be read reliably during this check. Retry before treating this as a missing listing.'
      : 'DexScreener responded, but did not return an Arc pair for this contract yet.';
    $('terminalDex').textContent = result.error ? 'UNAVAILABLE' : 'NOT INDEXED';
    compare('compareDex', result.error ? 'RETRY NEEDED' : 'NOT INDEXED', result.error ? 'warn-text' : 'bad-text');
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

function renderPool(arcPadMeta, dexPair, arcPadResult, dexResult) {
  const pool = arcPadMeta?.pool || dexPair?.pairAddress || null;
  if (!pool) {
    const incomplete = Boolean(arcPadResult?.error || dexResult?.error);
    badge('poolBadge', incomplete ? 'UNRESOLVED' : 'NOT FOUND', incomplete ? 'warn' : 'bad');
    $('poolHeadline').textContent = incomplete ? 'Pool check incomplete' : 'No pool resolved';
    $('poolCopy').textContent = incomplete
      ? 'At least one upstream source was unavailable, so the monitor cannot safely conclude that no pool exists.'
      : 'The checked sources responded but neither returned an Arc pool address.';
    $('terminalPool').textContent = incomplete ? 'UNRESOLVED' : 'NOT FOUND';
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
  const hasSourceError = Boolean(arcPad?.error || dex?.error);
  if (liveCount === 2 && pool) {
    badge('summaryBadge', 'PROPAGATED', 'ok');
    $('summaryHeadline').textContent = 'Launch data is propagating';
    $('summaryCopy').textContent = 'ArcPad and DexScreener both currently recognize this token, with a market pool resolved.';
    $('terminalStatus').textContent = 'PROPAGATED_';
    $('tokenTitle').textContent = arcPad?.meta ? `${arcPad.meta.name} // ${arcPad.meta.symbol}` : 'TOKEN FOUND';
  } else if (liveCount >= 1) {
    badge('summaryBadge', 'PARTIAL', 'warn');
    $('summaryHeadline').textContent = 'Partial propagation detected';
    $('summaryCopy').textContent = hasSourceError
      ? 'At least one source recognizes the token, while another source could not be checked reliably.'
      : 'At least one live source recognizes the token, but indexing is not yet consistent across checked services.';
    $('terminalStatus').textContent = 'PARTIAL_';
    $('tokenTitle').textContent = arcPad?.meta ? `${arcPad.meta.name} // ${arcPad.meta.symbol}` : `TOKEN // ${short(token)}`;
  } else if (hasSourceError) {
    badge('summaryBadge', 'CHECK INCOMPLETE', 'warn');
    $('summaryHeadline').textContent = 'Upstream check incomplete';
    $('summaryCopy').textContent = 'One or more data sources were unavailable. Retry before concluding that this token or its pool is missing.';
    $('terminalStatus').textContent = 'RETRY_';
    $('tokenTitle').textContent = `TOKEN // ${short(token)}`;
  } else {
    badge('summaryBadge', 'NO DATA', 'bad');
    $('summaryHeadline').textContent = 'No indexed Arc data found';
    $('summaryCopy').textContent = 'The checked sources responded successfully but did not return Arc market data for this contract.';
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
  const pool = renderPool(arcPadMeta, dexPair, arcPadResult, dexResult);
  summarize(token, arcPadResult, dexResult, pool);
  $('lastChecked').textContent = new Date().toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).toUpperCase();

  window.dispatchEvent(new CustomEvent('arc-monitor-result', {
    detail: { token, pool, arcPadMeta, dexPair }
  }));
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

// Delay the first run one tick so optional analyzer modules can attach event listeners.
setTimeout(() => run(input.value), 0);
