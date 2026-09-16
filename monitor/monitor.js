const EXIT_TOKEN = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
const ARC_CHAIN_ID = '5042';
const ARCPAD_BASE = 'https://arcpad.meme';
const DEX_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens/';
const REQUEST_TIMEOUT_MS = 8000;

const $ = (id) => document.getElementById(id);
const form = $('tokenForm');
const input = $('tokenInput');
const toast = $('toast');

let activeContext = null;
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function badge(id, text, type) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${type}`;
}

function compare(id, text, type) {
  const el = $(id);
  if (!el) return;
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
  if (!el) return;
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

function resetMarkets() {
  if ($('marketsStatus')) $('marketsStatus').textContent = 'WAITING';
  if ($('marketsCount')) $('marketsCount').textContent = '—';
  if ($('activeMarket')) $('activeMarket').textContent = 'Waiting for market discovery…';
  if ($('marketsGrid')) $('marketsGrid').innerHTML = '<div class="markets-empty">Waiting for DexScreener and ArcPad market data…</div>';
}

function reset(token) {
  activeContext = null;
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
  resetMarkets();

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
  if (Array.isArray(data?.creations)) return data.creations;
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
    const seen = new Set();
    const arcPairs = allPairs.filter((pair) => {
      const chain = String(pair?.chainId || '').toLowerCase();
      if (!(chain === 'arc' || chain === 'arc-mainnet' || chain.startsWith('arc-'))) return false;
      const address = String(pair?.pairAddress || '').toLowerCase();
      if (!address || seen.has(address)) return false;
      seen.add(address);
      return true;
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
    badge('dexPadBadge', result.error ? 'UNAVAILABLE' : 'NOT FOUND', result.error ? 'warn' : 'bad');
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
  badge('dexBadge', result.pairs.length > 1 ? `${result.pairs.length} MARKETS` : 'INDEXED', 'ok');
  $('dexHeadline').textContent = result.pairs.length > 1
    ? `${result.pairs.length} Arc markets discovered`
    : `${p?.baseToken?.symbol || 'TOKEN'} / ${p?.quoteToken?.symbol || 'PAIR'}`;
  $('dexCopy').textContent = result.pairs.length > 1
    ? 'The metrics below are from the strongest market by DexScreener-reported liquidity. See Market Discovery to inspect each pool.'
    : `${p?.dexId ? p.dexId.toUpperCase() : 'DEX'} market indexed with live market data.`;
  $('dexLiquidity').textContent = money(p?.liquidity?.usd, 0);
  $('dexVolume').textContent = money(p?.volume?.h24, 0);
  $('dexMcap').textContent = money(p?.marketCap ?? p?.fdv, 0);
  $('dexTxns').textContent = integer(buys + sells);
  $('terminalDex').textContent = result.pairs.length > 1 ? `${result.pairs.length} MARKETS` : 'INDEXED';
  compare('compareDex', result.pairs.length > 1 ? `${result.pairs.length} MARKETS` : 'INDEXED', 'ok-text');
  setLink('dexLink', p?.url || null);
  return p;
}

function pairAddress(pair) {
  return String(pair?.pairAddress || '').toLowerCase();
}

function chooseDefaultMarket(arcPadMeta, dexResult) {
  const pairs = dexResult?.pairs || [];
  const requested = new URLSearchParams(location.search).get('pool')?.toLowerCase();
  if (requested) {
    const requestedPair = pairs.find((pair) => pairAddress(pair) === requested);
    if (requestedPair) return { pool: requestedPair.pairAddress, pair: requestedPair, reason: 'shared selection' };
    if (arcPadMeta?.pool?.toLowerCase() === requested) return { pool: arcPadMeta.pool, pair: null, reason: 'shared ArcPad launch pool' };
  }

  if (arcPadMeta?.pool) {
    const launchPair = pairs.find((pair) => pairAddress(pair) === arcPadMeta.pool.toLowerCase());
    return { pool: arcPadMeta.pool, pair: launchPair || null, reason: 'ArcPad launch pool' };
  }

  if (dexResult?.pair?.pairAddress) {
    return { pool: dexResult.pair.pairAddress, pair: dexResult.pair, reason: 'strongest reported market' };
  }
  return { pool: null, pair: null, reason: 'unresolved' };
}

function renderPool(pool, pair, reason, arcPadResult, dexResult) {
  if (!pool) {
    const incomplete = Boolean(arcPadResult?.error || dexResult?.error);
    badge('poolBadge', incomplete ? 'UNRESOLVED' : 'NOT FOUND', incomplete ? 'warn' : 'bad');
    $('poolHeadline').textContent = incomplete ? 'Pool check incomplete' : 'No pool resolved';
    $('poolCopy').textContent = incomplete
      ? 'At least one upstream source was unavailable, so the monitor cannot safely conclude that no pool exists.'
      : 'The checked sources responded but neither returned an Arc pool address.';
    $('poolAddress').textContent = '—';
    $('copyPool').disabled = true;
    $('copyPool').dataset.pool = '';
    $('terminalPool').textContent = incomplete ? 'UNRESOLVED' : 'NOT FOUND';
    return;
  }
  badge('poolBadge', 'ANALYZING', 'ok');
  $('poolHeadline').textContent = pair
    ? `${pair?.baseToken?.symbol || 'TOKEN'} / ${pair?.quoteToken?.symbol || 'PAIR'}`
    : 'ArcPad launch pool';
  $('poolCopy').textContent = `Currently analyzing ${reason}. Market Discovery below lets you switch pools when multiple markets exist.`;
  $('poolAddress').textContent = pool;
  $('copyPool').disabled = false;
  $('copyPool').dataset.pool = pool;
  $('terminalPool').textContent = 'ANALYZING';
}

function marketCard(pair, launchPool, topPool, activePool) {
  const address = pair?.pairAddress || '';
  const lower = address.toLowerCase();
  const isLaunch = Boolean(launchPool && lower === launchPool.toLowerCase());
  const isTop = Boolean(topPool && lower === topPool.toLowerCase());
  const isActive = Boolean(activePool && lower === activePool.toLowerCase());
  const buys = Number(pair?.txns?.h24?.buys || 0);
  const sells = Number(pair?.txns?.h24?.sells || 0);
  const tags = [
    isLaunch ? '<span class="market-tag launch">ARCPAD LAUNCH</span>' : '',
    isTop ? '<span class="market-tag top">TOP REPORTED</span>' : '',
    isActive ? '<span class="market-tag active">ANALYZING</span>' : ''
  ].join('');

  return `<article class="market-card${isActive ? ' active' : ''}" data-market="${escapeHtml(address)}">
    <div class="market-card-top">
      <div><strong class="market-pair">${escapeHtml(pair?.baseToken?.symbol || 'TOKEN')} / ${escapeHtml(pair?.quoteToken?.symbol || 'PAIR')}</strong><span class="market-dex">${escapeHtml(String(pair?.dexId || 'DEX').toUpperCase())}</span></div>
      <div class="market-tags">${tags}</div>
    </div>
    <code class="market-address">${escapeHtml(address)}</code>
    <div class="market-metrics">
      <div><span>Reported liquidity</span><strong>${money(pair?.liquidity?.usd, 0)}</strong></div>
      <div><span>24h volume</span><strong>${money(pair?.volume?.h24, 0)}</strong></div>
      <div><span>24h txns</span><strong>${integer(buys + sells)}</strong></div>
    </div>
    <div class="market-actions">
      <button class="market-analyze" type="button" data-analyze-pool="${escapeHtml(address)}">${isActive ? 'ANALYZING' : 'ANALYZE THIS POOL'}</button>
      ${pair?.url ? `<a class="market-link" href="${escapeHtml(pair.url)}" target="_blank" rel="noopener noreferrer">DEXSCREENER ↗</a>` : ''}
    </div>
  </article>`;
}

function renderMarkets(context) {
  const { arcPadMeta, dexResult, activePool } = context;
  const pairs = dexResult?.pairs || [];
  const launchPool = arcPadMeta?.pool || null;
  const topPool = dexResult?.pair?.pairAddress || null;
  const launchIndexed = launchPool ? pairs.some((pair) => pairAddress(pair) === launchPool.toLowerCase()) : false;
  const totalKnown = pairs.length + (launchPool && !launchIndexed ? 1 : 0);

  $('marketsStatus').textContent = totalKnown ? 'LIVE' : 'NO MARKETS';
  $('marketsCount').textContent = `${totalKnown} ${totalKnown === 1 ? 'POOL' : 'POOLS'}`;
  $('activeMarket').textContent = activePool || 'No pool selected';

  const cards = pairs.map((pair) => marketCard(pair, launchPool, topPool, activePool));
  if (launchPool && !launchIndexed) {
    const active = launchPool.toLowerCase() === activePool?.toLowerCase();
    cards.unshift(`<article class="market-card${active ? ' active' : ''}" data-market="${escapeHtml(launchPool)}">
      <div class="market-card-top"><div><strong class="market-pair">ArcPad launch pool</strong><span class="market-dex">NOT CURRENTLY INDEXED BY DEXSCREENER</span></div><div class="market-tags"><span class="market-tag launch">ARCPAD LAUNCH</span>${active ? '<span class="market-tag active">ANALYZING</span>' : ''}</div></div>
      <code class="market-address">${escapeHtml(launchPool)}</code>
      <div class="market-actions"><button class="market-analyze" type="button" data-analyze-pool="${escapeHtml(launchPool)}">${active ? 'ANALYZING' : 'ANALYZE THIS POOL'}</button></div>
    </article>`);
  }
  $('marketsGrid').innerHTML = cards.length ? cards.join('') : '<div class="markets-empty">No Arc market pool was resolved from the available sources.</div>';
}

function summarize(token, arcPad, dex, pool) {
  const liveCount = Number(Boolean(arcPad?.found)) + Number(Boolean(dex?.found));
  const hasSourceError = Boolean(arcPad?.error || dex?.error);
  if (liveCount === 2 && pool) {
    badge('summaryBadge', 'PROPAGATED', 'ok');
    $('summaryHeadline').textContent = 'Launch data is propagating';
    $('summaryCopy').textContent = dex?.pairs?.length > 1
      ? `${dex.pairs.length} Arc markets are indexed. The monitor can inspect each pool separately.`
      : 'ArcPad and DexScreener both currently recognize this token, with a market pool resolved.';
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

function dispatchAnalysis(context, pool, pair, reason, updateUrl = true) {
  context.activePool = pool;
  context.activePair = pair || null;
  context.reason = reason;
  activeContext = context;

  if (updateUrl) {
    const params = new URLSearchParams(location.search);
    params.set('token', context.token);
    if (pool) params.set('pool', pool); else params.delete('pool');
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }

  renderPool(pool, pair, reason, context.arcPadResult, context.dexResult);
  renderMarkets(context);
  window.dispatchEvent(new CustomEvent('arc-monitor-result', {
    detail: {
      token: context.token,
      pool,
      arcPadMeta: context.arcPadMeta,
      dexPair: pair,
      dexPairs: context.dexResult?.pairs || [],
      selectionReason: reason
    }
  }));
}

function selectMarket(poolAddress) {
  if (!activeContext || !poolAddress) return;
  const requested = poolAddress.toLowerCase();
  const pair = (activeContext.dexResult?.pairs || []).find((item) => pairAddress(item) === requested) || null;
  const launch = activeContext.arcPadMeta?.pool?.toLowerCase() === requested;
  if (!pair && !launch) return;
  const reason = launch ? 'ArcPad launch pool' : 'selected DexScreener market';
  dispatchAnalysis(activeContext, poolAddress, pair, reason, true);
  $('onchain')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  renderDex(dexResult);
  const choice = chooseDefaultMarket(arcPadMeta, dexResult);
  const context = { token, arcPadResult, dexResult, arcPadMeta, activePool: choice.pool, activePair: choice.pair, reason: choice.reason };
  summarize(token, arcPadResult, dexResult, choice.pool);
  $('lastChecked').textContent = new Date().toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).toUpperCase();
  dispatchAnalysis(context, choice.pool, choice.pair, choice.reason, false);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const params = new URLSearchParams(location.search);
  params.delete('pool');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  run(input.value);
});

$('marketsGrid')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-analyze-pool]');
  if (!button) return;
  selectMarket(button.dataset.analyzePool);
});

$('loadExit').addEventListener('click', () => {
  const params = new URLSearchParams(location.search);
  params.delete('pool');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  run(EXIT_TOKEN);
});
$('copyMonitorLink').addEventListener('click', () => copy(location.href, 'MONITOR LINK COPIED'));
$('copyToken').addEventListener('click', () => copy(input.value.trim(), 'TOKEN ADDRESS COPIED'));
$('copyPool').addEventListener('click', () => {
  const pool = $('copyPool').dataset.pool;
  if (pool) copy(pool, 'POOL ADDRESS COPIED');
});

// Delay the first run one tick so optional analyzer modules can attach event listeners.
setTimeout(() => run(input.value), 0);

// Automatic all-pool onchain comparison. Kept in an IIFE so it cannot collide
// with the existing monitor/onchain/depth modules.
(() => {
  const RPC_URL = 'https://rpc.arc-scan.org';
  const USDC = '0x3600000000000000000000000000000000000000';
  const RPC_TIMEOUT = 8000;
  const SELECTOR = {
    token0: '0x0dfe1681',
    token1: '0xd21220a7',
    fee: '0xddca3f43',
    liquidity: '0x1a686502',
    slot0: '0x3850c7bd',
    decimals: '0x313ce567',
    balanceOf: '0x70a08231'
  };
  let runVersion = 0;
  let cache = null;

  const style = document.createElement('style');
  style.textContent = `
    .pool-compare-section{position:relative}.pool-compare-state{text-align:right}.pool-compare-state span{display:block;color:var(--muted);font-size:.66rem;letter-spacing:.12em}.pool-compare-state strong{display:block;color:var(--green);font-size:.82rem;margin-top:6px}.pool-compare-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line-soft);border:1px solid var(--line);margin-bottom:22px}.pool-compare-summary>div{background:#080d09;padding:16px}.pool-compare-summary span{display:block;color:#667068;font-size:.58rem;text-transform:uppercase;letter-spacing:.08em}.pool-compare-summary strong{display:block;margin-top:7px;font-size:.8rem;word-break:break-word}.pool-compare-wrap{overflow-x:auto;border:1px solid var(--line)}.pool-compare-table{width:100%;border-collapse:collapse;font-size:.72rem;min-width:1080px}.pool-compare-table th,.pool-compare-table td{text-align:left;padding:13px 11px;border-bottom:1px solid var(--line-soft);vertical-align:top}.pool-compare-table th{color:var(--green);font-size:.59rem;letter-spacing:.08em;text-transform:uppercase;background:#060a07}.pool-compare-table td{color:#b6beb8}.pool-compare-table tr:last-child td{border-bottom:0}.pool-compare-table tr.active-row{background:rgba(0,255,71,.025)}.pool-compare-market strong{display:block;color:var(--text);font-size:.78rem}.pool-compare-market code{display:block;color:#6e7870;font-size:.61rem;margin-top:5px}.pool-compare-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}.pool-compare-tag{display:inline-block;border:1px solid var(--line);padding:3px 5px;font-size:.51rem;font-weight:900;letter-spacing:.05em}.pool-compare-tag.launch{color:var(--warn);border-color:rgba(255,204,77,.5)}.pool-compare-tag.top{color:#86c2ff;border-color:rgba(92,174,255,.5)}.pool-compare-tag.usdc{color:#d7a6ff;border-color:rgba(215,166,255,.45)}.pool-compare-tag.balance{color:#87e8bf;border-color:rgba(135,232,191,.45)}.pool-compare-tag.active{color:var(--green);border-color:var(--green)}.pool-composition{font-weight:900;font-size:.61rem;letter-spacing:.05em}.pool-composition.ok{color:var(--green)}.pool-composition.warn{color:var(--warn)}.pool-composition.bad{color:var(--bad)}.pool-composition.neutral{color:#8b948d}.pool-compare-action{border:1px solid var(--green);background:transparent;color:var(--green);font:inherit;font-size:.58rem;font-weight:900;padding:7px 9px;cursor:pointer;white-space:nowrap}.pool-compare-action:hover{background:var(--green);color:#001a07}.pool-compare-note{margin-top:16px;color:var(--muted);font-size:.73rem;line-height:1.55}.pool-compare-loading{padding:24px;color:var(--muted)}@media(max-width:960px){.pool-compare-summary{grid-template-columns:repeat(2,1fr)}.pool-compare-state{text-align:left;margin-top:18px}}@media(max-width:640px){.pool-compare-summary{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const onchainSection = document.getElementById('onchain');
  if (onchainSection) {
    const section = document.createElement('section');
    section.className = 'section shell pool-compare-section';
    section.id = 'poolCompare';
    section.innerHTML = `
      <div class="section-head">
        <div>
          <div class="kicker">03 // ALL-POOL ONCHAIN COMPARISON</div>
          <h2>WHERE DOES THE LIQUIDITY<br /><span>ACTUALLY LIVE?</span></h2>
        </div>
        <div class="pool-compare-state"><span>ARC RPC</span><strong id="poolCompareStatus">WAITING</strong><span style="margin-top:8px">POOLS READ</span><strong id="poolCompareCount">—</strong></div>
      </div>
      <div class="pool-compare-summary">
        <div><span>ArcPad launch pool</span><strong id="poolCompareLaunch">—</strong></div>
        <div><span>Largest reported market</span><strong id="poolCompareTop">—</strong></div>
        <div><span>Largest USDC reserve</span><strong id="poolCompareUsdc">—</strong></div>
        <div><span>Closest to 50/50 (est.)</span><strong id="poolCompareBalanced">—</strong></div>
      </div>
      <div class="pool-compare-wrap">
        <table class="pool-compare-table">
          <thead><tr><th>Market / pool</th><th>Reported liquidity</th><th>USDC held</th><th>Fee</th><th>Active L</th><th>USDC share (est.)</th><th>Composition</th><th></th></tr></thead>
          <tbody id="poolCompareRows"><tr><td colspan="8" class="pool-compare-loading">Waiting for discovered Arc markets…</td></tr></tbody>
        </table>
      </div>
      <p class="pool-compare-note"><strong>How to read this:</strong> “Largest reported” comes from DexScreener. “Largest USDC reserve” is a direct token balance held by a pool contract. “Closest to 50/50” is an estimated spot-value composition using the current V3 price, not a safety score, recommendation, or guarantee of executable depth. Non-USDC pools remain visible but cannot be ranked by USDC reserve.</p>
    `;
    onchainSection.before(section);

    const onchainKicker = document.querySelector('#onchain .kicker');
    const depthKicker = document.querySelector('#depth .kicker');
    const compareKicker = document.querySelector('.compare-section .kicker');
    const aboutKicker = document.querySelector('.about-section .kicker');
    if (onchainKicker) onchainKicker.textContent = '04 // ONCHAIN POOL COMPOSITION';
    if (depthKicker) depthKicker.textContent = '05 // SELL-SIDE DEPTH ESTIMATOR';
    if (compareKicker) compareKicker.textContent = '06 // INDEXER COMPARISON';
    if (aboutKicker) aboutKicker.textContent = '07 // WHY THIS EXISTS';
  }

  const el = (id) => document.getElementById(id);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value;
  }

  function resetComparison() {
    runVersion += 1;
    cache = null;
    setText('poolCompareStatus', 'WAITING');
    setText('poolCompareCount', '—');
    setText('poolCompareLaunch', '—');
    setText('poolCompareTop', '—');
    setText('poolCompareUsdc', '—');
    setText('poolCompareBalanced', '—');
    if (el('poolCompareRows')) el('poolCompareRows').innerHTML = '<tr><td colspan="8" class="pool-compare-loading">Waiting for discovered Arc markets…</td></tr>';
  }

  async function rpcCall(to, data, attempt = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT);
    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) {
        if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
          await delay(350 * (attempt + 1));
          return rpcCall(to, data, attempt + 1);
        }
        throw new Error(`RPC HTTP ${response.status}`);
      }
      const body = await response.json();
      if (body.error) throw new Error(body.error.message || 'RPC error');
      return body.result;
    } catch (error) {
      if ((error?.name === 'AbortError' || /fetch/i.test(String(error?.message))) && attempt < 2) {
        await delay(350 * (attempt + 1));
        return rpcCall(to, data, attempt + 1);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function decodeAddress(hex) {
    if (!hex || hex === '0x') return null;
    return `0x${hex.slice(-40)}`;
  }

  function decodeUint(hex) {
    return (!hex || hex === '0x') ? 0n : BigInt(hex);
  }

  function splitWords(hex) {
    const clean = String(hex || '').replace(/^0x/, '');
    const out = [];
    for (let i = 0; i < clean.length; i += 64) out.push(clean.slice(i, i + 64).padEnd(64, '0'));
    return out;
  }

  function balanceOfData(owner) {
    return SELECTOR.balanceOf + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  }

  async function decimals(token) {
    if (token.toLowerCase() === USDC.toLowerCase()) return 6;
    try {
      return Number(decodeUint(await rpcCall(token, SELECTOR.decimals)));
    } catch {
      return 18;
    }
  }

  function numericUnits(raw, dec) {
    return Number(raw.toString()) / (10 ** Number(dec));
  }

  function price1Per0(sqrtPriceX96, dec0, dec1) {
    const sqrt = Number(sqrtPriceX96.toString()) / (2 ** 96);
    return sqrt * sqrt * (10 ** (dec0 - dec1));
  }

  function moneyLocal(value, max = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n > 0 && n < 0.01) return `$${n.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;
  }

  function percent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n > 0 && n < 0.01) return '<0.01%';
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  function shortPool(value) {
    return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—';
  }

  function composition(share) {
    if (!Number.isFinite(share)) return { label: 'NON-USDC / N/A', cls: 'neutral' };
    const edge = Math.min(share, 100 - share);
    if (edge < 5) return { label: 'HIGHLY ONE-SIDED', cls: 'bad' };
    if (edge < 20) return { label: 'ONE-SIDED', cls: 'warn' };
    if (share >= 35 && share <= 65) return { label: 'MORE BALANCED', cls: 'ok' };
    return { label: 'SKEWED', cls: 'warn' };
  }

  function pairLabel(pair) {
    if (!pair) return 'ArcPad launch pool';
    return `${pair?.baseToken?.symbol || 'TOKEN'} / ${pair?.quoteToken?.symbol || 'PAIR'}`;
  }

  function collectPools(detail) {
    const map = new Map();
    const pairs = Array.isArray(detail?.dexPairs) ? detail.dexPairs : (detail?.dexPair ? [detail.dexPair] : []);
    for (const pair of pairs) {
      const pool = String(pair?.pairAddress || '');
      if (!/^0x[a-fA-F0-9]{40}$/.test(pool)) continue;
      map.set(pool.toLowerCase(), { pool, pair });
    }
    const launchPool = detail?.arcPadMeta?.pool;
    if (/^0x[a-fA-F0-9]{40}$/.test(String(launchPool || '')) && !map.has(launchPool.toLowerCase())) {
      map.set(launchPool.toLowerCase(), { pool: launchPool, pair: null });
    }
    return [...map.values()].sort((a, b) => Number(b.pair?.liquidity?.usd || 0) - Number(a.pair?.liquidity?.usd || 0));
  }

  async function inspectPool(entry, detail) {
    const { pool, pair } = entry;
    try {
      const [t0Hex, t1Hex, feeHex, liquidityHex, slotHex] = await Promise.all([
        rpcCall(pool, SELECTOR.token0),
        rpcCall(pool, SELECTOR.token1),
        rpcCall(pool, SELECTOR.fee),
        rpcCall(pool, SELECTOR.liquidity),
        rpcCall(pool, SELECTOR.slot0)
      ]);
      const token0 = decodeAddress(t0Hex);
      const token1 = decodeAddress(t1Hex);
      if (!token0 || !token1) throw new Error('pool tokens could not be decoded');

      const [dec0, dec1, bal0Hex, bal1Hex] = await Promise.all([
        decimals(token0), decimals(token1), rpcCall(token0, balanceOfData(pool)), rpcCall(token1, balanceOfData(pool))
      ]);

      const balance0 = numericUnits(decodeUint(bal0Hex), dec0);
      const balance1 = numericUnits(decodeUint(bal1Hex), dec1);
      const fee = Number(decodeUint(feeHex));
      const activeLiquidity = decodeUint(liquidityHex);
      const sqrtWord = splitWords(slotHex)[0];
      const sqrtPriceX96 = BigInt(`0x${sqrtWord || '0'}`);
      const tokenLower = String(detail?.token || '').toLowerCase();
      const t0 = token0.toLowerCase();
      const t1 = token1.toLowerCase();
      const usdc = USDC.toLowerCase();
      const trackedIs0 = t0 === tokenLower;
      const trackedIs1 = t1 === tokenLower;
      const usdcIs0 = t0 === usdc;
      const usdcIs1 = t1 === usdc;
      const tokenInPool = trackedIs0 || trackedIs1;
      const directUsdc = usdcIs0 || usdcIs1;
      const usdcReserve = usdcIs0 ? balance0 : (usdcIs1 ? balance1 : null);

      let trackedPrice = null;
      let usdcShare = null;
      if (tokenInPool && directUsdc && sqrtPriceX96 > 0n) {
        const p1p0 = price1Per0(sqrtPriceX96, dec0, dec1);
        if (trackedIs0 && usdcIs1) trackedPrice = p1p0;
        if (trackedIs1 && usdcIs0 && p1p0 > 0) trackedPrice = 1 / p1p0;
        const trackedBalance = trackedIs0 ? balance0 : balance1;
        const tokenValue = Number.isFinite(trackedPrice) ? trackedBalance * trackedPrice : null;
        if (Number.isFinite(tokenValue) && Number.isFinite(usdcReserve)) {
          const total = tokenValue + usdcReserve;
          if (total > 0) usdcShare = (usdcReserve / total) * 100;
        }
      }

      return {
        pool,
        pair,
        ok: true,
        token0,
        token1,
        tokenInPool,
        directUsdc,
        usdcReserve,
        usdcShare,
        fee,
        activeLiquidity,
        reportedLiquidity: Number(pair?.liquidity?.usd),
        composition: composition(usdcShare)
      };
    } catch (error) {
      return { pool, pair, ok: false, error: String(error?.message || error), reportedLiquidity: Number(pair?.liquidity?.usd), composition: { label: 'READ INCOMPLETE', cls: 'warn' } };
    }
  }

  function renderSummary(results, detail) {
    const launch = detail?.arcPadMeta?.pool || null;
    const top = results.filter((r) => Number.isFinite(r.reportedLiquidity)).sort((a, b) => b.reportedLiquidity - a.reportedLiquidity)[0] || null;
    const largestUsdc = results.filter((r) => r.ok && Number.isFinite(r.usdcReserve)).sort((a, b) => b.usdcReserve - a.usdcReserve)[0] || null;
    const balanced = results.filter((r) => r.ok && Number.isFinite(r.usdcShare)).sort((a, b) => Math.abs(a.usdcShare - 50) - Math.abs(b.usdcShare - 50))[0] || null;

    setText('poolCompareLaunch', launch ? shortPool(launch) : 'NOT RESOLVED');
    setText('poolCompareTop', top ? `${moneyLocal(top.reportedLiquidity, 0)} // ${shortPool(top.pool)}` : 'NO REPORTED MARKET');
    setText('poolCompareUsdc', largestUsdc ? `${moneyLocal(largestUsdc.usdcReserve, 6)} // ${shortPool(largestUsdc.pool)}` : 'NO DIRECT USDC POOL');
    setText('poolCompareBalanced', balanced ? `${percent(balanced.usdcShare)} USDC // ${shortPool(balanced.pool)}` : 'NOT CALCULABLE');

    return {
      launch: launch?.toLowerCase() || null,
      top: top?.pool?.toLowerCase() || null,
      largestUsdc: largestUsdc?.pool?.toLowerCase() || null,
      balanced: balanced?.pool?.toLowerCase() || null
    };
  }

  function renderRows(results, detail) {
    const labels = renderSummary(results, detail);
    const active = String(detail?.pool || '').toLowerCase();
    const rows = results.map((result) => {
      const lower = result.pool.toLowerCase();
      const tags = [
        lower === labels.launch ? '<span class="pool-compare-tag launch">ARCPAD LAUNCH</span>' : '',
        lower === labels.top ? '<span class="pool-compare-tag top">TOP REPORTED</span>' : '',
        lower === labels.largestUsdc ? '<span class="pool-compare-tag usdc">LARGEST USDC</span>' : '',
        lower === labels.balanced ? '<span class="pool-compare-tag balance">CLOSEST 50/50</span>' : '',
        lower === active ? '<span class="pool-compare-tag active">ANALYZING</span>' : ''
      ].join('');
      const fee = result.ok ? `${(result.fee / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 })}%` : '—';
      const activeL = result.ok ? result.activeLiquidity.toLocaleString() : '—';
      const reported = Number.isFinite(result.reportedLiquidity) ? moneyLocal(result.reportedLiquidity, 0) : '—';
      const usdcReserve = result.ok ? (Number.isFinite(result.usdcReserve) ? moneyLocal(result.usdcReserve, 6) : 'NON-USDC') : '—';
      const share = result.ok && Number.isFinite(result.usdcShare) ? percent(result.usdcShare) : '—';
      const dex = result.pair?.dexId ? String(result.pair.dexId).toUpperCase() : 'ARCPAD';
      return `<tr class="${lower === active ? 'active-row' : ''}">
        <td class="pool-compare-market"><strong>${escapeHtml(pairLabel(result.pair))} // ${escapeHtml(dex)}</strong><code>${escapeHtml(result.pool)}</code><div class="pool-compare-tags">${tags}</div></td>
        <td>${reported}</td>
        <td>${usdcReserve}</td>
        <td>${fee}</td>
        <td>${activeL}</td>
        <td>${share}</td>
        <td><span class="pool-composition ${result.composition.cls}">${escapeHtml(result.composition.label)}</span></td>
        <td><button type="button" class="pool-compare-action" data-compare-analyze="${escapeHtml(result.pool)}">ANALYZE</button></td>
      </tr>`;
    });
    el('poolCompareRows').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8" class="pool-compare-loading">No Arc pools were available for direct comparison.</td></tr>';
    const good = results.filter((r) => r.ok).length;
    setText('poolCompareStatus', good === results.length ? 'LIVE' : (good ? 'PARTIAL' : 'INCOMPLETE'));
    setText('poolCompareCount', `${good}/${results.length}`);
  }

  function cacheKey(detail, entries) {
    return `${String(detail?.token || '').toLowerCase()}::${entries.map((e) => e.pool.toLowerCase()).sort().join(',')}`;
  }

  async function analyzeAll(detail) {
    const entries = collectPools(detail);
    if (!entries.length) {
      setText('poolCompareStatus', 'NO POOLS');
      setText('poolCompareCount', '0/0');
      if (el('poolCompareRows')) el('poolCompareRows').innerHTML = '<tr><td colspan="8" class="pool-compare-loading">No Arc market pools were resolved from the available sources.</td></tr>';
      return;
    }

    const key = cacheKey(detail, entries);
    if (cache?.key === key) {
      renderRows(cache.results, detail);
      return;
    }

    const version = ++runVersion;
    setText('poolCompareStatus', 'READING');
    setText('poolCompareCount', `0/${entries.length}`);
    if (el('poolCompareRows')) el('poolCompareRows').innerHTML = `<tr><td colspan="8" class="pool-compare-loading">Reading ${entries.length} pool${entries.length === 1 ? '' : 's'} directly from Arc mainnet…</td></tr>`;

    const results = [];
    for (let i = 0; i < entries.length; i += 1) {
      const result = await inspectPool(entries[i], detail);
      if (version !== runVersion) return;
      results.push(result);
      setText('poolCompareCount', `${results.filter((r) => r.ok).length}/${entries.length}`);
      if (i < entries.length - 1) await delay(120);
    }

    cache = { key, results };
    renderRows(results, detail);
  }

  el('poolCompareRows')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-compare-analyze]');
    if (!button) return;
    const pool = button.dataset.compareAnalyze?.toLowerCase();
    const target = [...document.querySelectorAll('[data-analyze-pool]')].find((candidate) => candidate.dataset.analyzePool?.toLowerCase() === pool);
    if (target) target.click();
  });

  window.addEventListener('arc-monitor-reset', resetComparison);
  window.addEventListener('arc-monitor-result', (event) => analyzeAll(event.detail));
  resetComparison();
})();
