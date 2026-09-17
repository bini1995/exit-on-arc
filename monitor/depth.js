(() => {
  const RPC_URL = 'https://rpc.arc-scan.org';
  const USDC = '0x3600000000000000000000000000000000000000';
  const Q96 = 2 ** 96;
  const TIMEOUT_MS = 8000;
  const SEL = {
    token0: '0x0dfe1681',
    token1: '0xd21220a7',
    fee: '0xddca3f43',
    liquidity: '0x1a686502',
    slot0: '0x3850c7bd',
    decimals: '0x313ce567',
    balanceOf: '0x70a08231'
  };

  const el = (id) => document.getElementById(id);
  let currentModel = null;

  async function rpcCall(to, data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(body.error.message || 'RPC error');
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }

  function address(hex) {
    if (!hex || hex === '0x') return null;
    return `0x${hex.slice(-40)}`;
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

  function balanceData(owner) {
    return SEL.balanceOf + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  }

  async function decimals(token) {
    if (token.toLowerCase() === USDC.toLowerCase()) return 6;
    try {
      return Number(uint(await rpcCall(token, SEL.decimals)));
    } catch {
      return 18;
    }
  }

  function units(value, dec) {
    return Number(value.toString()) / (10 ** dec);
  }

  function symbolFor(addr, detail) {
    const lower = addr.toLowerCase();
    if (lower === USDC.toLowerCase()) return 'USDC';
    const base = detail?.dexPair?.baseToken;
    const quote = detail?.dexPair?.quoteToken;
    if (base?.address?.toLowerCase() === lower && base?.symbol) return base.symbol;
    if (quote?.address?.toLowerCase() === lower && quote?.symbol) return quote.symbol;
    if (detail?.token?.toLowerCase() === lower && detail?.arcPadMeta?.symbol) return detail.arcPadMeta.symbol;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  function num(value, max = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: max });
  }

  function money(value, max = 4) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n > 0 && n < 0.01) return `$${n.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;
  }

  function pct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${Math.min(n, 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  function setDepthState(text, type = 'loading') {
    const badge = el('depthBadge');
    if (badge) {
      badge.textContent = text;
      badge.className = `mini-badge ${type}`;
    }
    if (el('depthStatus')) el('depthStatus').textContent = text;
  }

  function clearDepth() {
    currentModel = null;
    setDepthState('WAITING', 'loading');
    if (el('depthError')) {
      el('depthError').hidden = true;
      el('depthError').textContent = '';
    }
    ['depthToken','depthReserve','depthBoundary','depthFee','depthEstimateOut','depthEstimateUsage','depthEstimateStatus'].forEach((id) => {
      if (el(id)) el(id).textContent = '—';
    });
    if (el('depthRows')) el('depthRows').innerHTML = '<tr><td colspan="4">Waiting for a compatible USDC pool…</td></tr>';
    if (el('depthAmount')) {
      el('depthAmount').value = '';
      el('depthAmount').placeholder = 'Enter token amount';
      el('depthAmount').disabled = true;
    }
    if (el('depthSubmit')) el('depthSubmit').disabled = true;
  }

  function estimate(amount, model) {
    const input = Number(amount);
    if (!Number.isFinite(input) || input <= 0) return null;
    const effective = input * (1 - model.feeFraction);
    const k = model.virtualIn * model.virtualOut;
    const modeled = model.virtualOut - (k / (model.virtualIn + effective));
    const reserveLimited = modeled >= model.usdcReserve;
    const output = Math.max(0, Math.min(modeled, model.usdcReserve));
    return {
      input,
      modeled,
      output,
      usage: model.usdcReserve > 0 ? (output / model.usdcReserve) * 100 : 0,
      reserveLimited
    };
  }

  function boundaryAmount(model) {
    const r = model.usdcReserve;
    if (!(r > 0) || !(model.virtualOut > r) || !(model.virtualIn > 0)) return null;
    const effective = (model.virtualIn * r) / (model.virtualOut - r);
    const gross = effective / (1 - model.feeFraction);
    return Number.isFinite(gross) && gross > 0 ? gross : null;
  }

  function statusFor(result) {
    if (!result) return { text: 'INVALID', cls: 'bad' };
    if (result.reserveLimited || result.usage >= 99.5) return { text: 'RESERVE LIMIT', cls: 'bad' };
    if (result.usage >= 75) return { text: 'HIGH STRESS', cls: 'warn' };
    if (result.usage >= 25) return { text: 'ELEVATED', cls: 'warn' };
    return { text: 'WITHIN MODEL', cls: 'ok' };
  }

  function renderManual(amount) {
    if (!currentModel) return;
    const result = estimate(amount, currentModel);
    if (!result) {
      el('depthEstimateOut').textContent = '—';
      el('depthEstimateUsage').textContent = '—';
      el('depthEstimateStatus').textContent = 'ENTER A POSITIVE AMOUNT';
      el('depthEstimateStatus').className = 'depth-result-status bad';
      return;
    }
    const status = statusFor(result);
    el('depthEstimateOut').textContent = money(result.output, 6);
    el('depthEstimateUsage').textContent = pct(result.usage);
    el('depthEstimateStatus').textContent = status.text;
    el('depthEstimateStatus').className = `depth-result-status ${status.cls}`;
  }

  function renderTable(model) {
    const boundary = boundaryAmount(model);
    let sizes;
    if (boundary) {
      sizes = [0.25, 0.5, 0.75, 1, 1.5, 3].map((m) => boundary * m);
    } else {
      sizes = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02].map((m) => model.trackedBalance * m);
    }

    el('depthRows').innerHTML = sizes.map((size) => {
      const result = estimate(size, model);
      const status = statusFor(result);
      return `<tr>
        <td>${num(size, size < 100 ? 4 : 2)} ${model.symbol}</td>
        <td>${money(result?.output, 6)}</td>
        <td>${pct(result?.usage)}</td>
        <td><span class="depth-table-status ${status.cls}">${status.text}</span></td>
      </tr>`;
    }).join('');
  }

  async function analyze(detail) {
    clearDepth();
    const pool = detail?.pool;
    const tracked = detail?.token;
    if (!pool || !tracked) {
      setDepthState('NO POOL', 'bad');
      return;
    }

    setDepthState('READING', 'loading');

    try {
      const [t0Hex, t1Hex, feeHex, liquidityHex, slotHex] = await Promise.all([
        rpcCall(pool, SEL.token0), rpcCall(pool, SEL.token1), rpcCall(pool, SEL.fee),
        rpcCall(pool, SEL.liquidity), rpcCall(pool, SEL.slot0)
      ]);
      const token0 = address(t0Hex);
      const token1 = address(t1Hex);
      if (!token0 || !token1) throw new Error('Could not decode pool tokens');

      const lowerTracked = tracked.toLowerCase();
      const t0Lower = token0.toLowerCase();
      const t1Lower = token1.toLowerCase();
      const trackedIs0 = t0Lower === lowerTracked;
      const trackedIs1 = t1Lower === lowerTracked;
      const usdcIs0 = t0Lower === USDC.toLowerCase();
      const usdcIs1 = t1Lower === USDC.toLowerCase();

      if (!(trackedIs0 || trackedIs1) || !(usdcIs0 || usdcIs1)) {
        setDepthState('NON-USDC PAIR', 'warn');
        el('depthError').hidden = false;
        el('depthError').textContent = 'Sell-side USDC depth estimation currently requires the tracked token to be directly paired with Arc USDC.';
        return;
      }

      const [dec0, dec1, bal0Hex, bal1Hex] = await Promise.all([
        decimals(token0), decimals(token1), rpcCall(token0, balanceData(pool)), rpcCall(token1, balanceData(pool))
      ]);

      const L = uint(liquidityHex);
      const sqrtWord = words(slotHex)[0];
      const sqrtP = BigInt(`0x${sqrtWord || '0'}`);
      const fee = Number(uint(feeHex));
      if (sqrtP <= 0n || L <= 0n) throw new Error('Pool has no active liquidity');

      const xVirtual = (Number(L.toString()) * Q96 / Number(sqrtP.toString())) / (10 ** dec0);
      const yVirtual = (Number(L.toString()) * Number(sqrtP.toString()) / Q96) / (10 ** dec1);
      const bal0 = units(uint(bal0Hex), dec0);
      const bal1 = units(uint(bal1Hex), dec1);
      const usdcReserve = usdcIs0 ? bal0 : bal1;
      const trackedBalance = trackedIs0 ? bal0 : bal1;
      const virtualIn = trackedIs0 ? xVirtual : yVirtual;
      const virtualOut = trackedIs0 ? yVirtual : xVirtual;
      const symbol = symbolFor(tracked, detail);
      const feeFraction = fee / 1_000_000;

      if (![usdcReserve, trackedBalance, virtualIn, virtualOut, feeFraction].every(Number.isFinite)) {
        throw new Error('Pool values could not be normalized');
      }

      currentModel = { pool, symbol, usdcReserve, trackedBalance, virtualIn, virtualOut, feeFraction };
      const boundary = boundaryAmount(currentModel);

      el('depthToken').textContent = symbol;
      el('depthReserve').textContent = money(usdcReserve, 6);
      el('depthBoundary').textContent = boundary ? `${num(boundary, 2)} ${symbol}` : 'NOT REACHED IN MODEL';
      el('depthFee').textContent = `${(feeFraction * 100).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
      el('depthAmount').disabled = false;
      el('depthSubmit').disabled = false;
      el('depthAmount').placeholder = boundary ? Math.round(boundary / 2).toString() : 'Enter token amount';
      renderTable(currentModel);
      setDepthState('LIVE ESTIMATE', 'ok');
    } catch (error) {
      setDepthState('INCOMPLETE', 'warn');
      el('depthError').hidden = false;
      el('depthError').textContent = 'Depth estimation could not complete from the current Arc RPC snapshot. Retry the token check.';
      console.warn('Arc Launch Monitor depth estimator failed:', error);
    }
  }

  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'depthForm') return;
    event.preventDefault();
    renderManual(el('depthAmount').value);
  });

  window.addEventListener('arc-monitor-reset', clearDepth);
  window.addEventListener('arc-monitor-result', (event) => analyze(event.detail));
  clearDepth();
})();

function loadHistoryModule() {
  if (document.querySelector('script[data-arc-market-history]')) return;
  const historyScript = document.createElement('script');
  historyScript.src = 'history.js';
  historyScript.dataset.arcMarketHistory = 'true';
  document.body.appendChild(historyScript);
}

// Keep optional visual modules modular while preserving the static GitHub Pages entrypoint.
if (!document.querySelector('script[data-arc-range-visual]')) {
  const rangeScript = document.createElement('script');
  rangeScript.src = 'range.js';
  rangeScript.dataset.arcRangeVisual = 'true';
  rangeScript.addEventListener('load', loadHistoryModule, { once: true });
  rangeScript.addEventListener('error', loadHistoryModule, { once: true });
  document.body.appendChild(rangeScript);
} else {
  loadHistoryModule();
}
