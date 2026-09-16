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
