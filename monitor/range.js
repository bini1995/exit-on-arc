(() => {
  const RPC_URL = 'https://rpc.arc-scan.org';
  const ARC_USDC = '0x3600000000000000000000000000000000000000';
  const MAX_TICK = 887272;
  const RPC_TIMEOUT_MS = 8000;
  const MAX_WORDS_PER_DIRECTION = 24;
  const SELECTOR = {
    token0: '0x0dfe1681',
    token1: '0xd21220a7',
    slot0: '0x3850c7bd',
    tickSpacing: '0xd0c93a7c',
    liquidity: '0x1a686502',
    decimals: '0x313ce567',
    tickBitmap: '0x5339c296'
  };

  const byId = (id) => document.getElementById(id);
  let analysisVersion = 0;

  const style = document.createElement('style');
  style.textContent = `
    .range-section{position:relative}.range-state{text-align:right}.range-state span{display:block;color:var(--muted);font-size:.66rem;letter-spacing:.12em}.range-state strong{display:block;color:var(--green);font-size:.82rem;margin-top:6px}.range-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:0;border-top:1px solid var(--line);border-left:1px solid var(--line)}.range-panel{padding:26px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.012)}.range-metrics{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line-soft);margin-top:16px}.range-metrics>div{background:#080d09;padding:14px}.range-metrics span{display:block;color:#667068;font-size:.57rem;text-transform:uppercase;letter-spacing:.08em}.range-metrics strong{display:block;margin-top:6px;font-size:.82rem;word-break:break-word}.range-map{margin-top:20px;padding:20px 14px 12px;border:1px solid var(--line-soft);background:#040705}.range-track-wrap{position:relative;padding-top:30px;padding-bottom:32px}.range-track{height:8px;background:#182019;position:relative;border:1px solid #253027}.range-track::before,.range-track::after{content:'';position:absolute;top:-7px;width:1px;height:22px;background:#657067}.range-track::before{left:0}.range-track::after{right:0}.range-fill{position:absolute;left:0;top:0;bottom:0;background:rgba(0,255,71,.28);width:50%}.range-marker{position:absolute;top:-11px;width:3px;height:30px;background:var(--green);transform:translateX(-1px);box-shadow:0 0 12px rgba(0,255,71,.35)}.range-marker::before{content:'PRICE';position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:.52rem;color:var(--green);letter-spacing:.08em;font-weight:900}.range-label{position:absolute;bottom:0;font-size:.59rem;color:#79837b}.range-label.left{left:0}.range-label.right{right:0;text-align:right}.range-position{text-align:center;margin-top:7px;color:#a6afa8;font-size:.68rem}.range-prices{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:var(--line-soft);margin-top:16px}.range-prices>div{background:#080d09;padding:12px;text-align:center}.range-prices span{display:block;color:#667068;font-size:.54rem;text-transform:uppercase;letter-spacing:.07em}.range-prices strong{display:block;margin-top:5px;font-size:.72rem}.range-explainer{margin-top:18px;border-left:3px solid var(--green);background:rgba(0,255,71,.025);padding:15px 17px}.range-explainer strong{display:block;font-size:.76rem;letter-spacing:.04em}.range-explainer p{margin:7px 0 0;color:var(--muted);font-size:.75rem;line-height:1.55}.range-warning{margin-top:14px;padding:12px 14px;border:1px solid rgba(255,204,77,.28);color:#c8b574;background:rgba(255,204,77,.035);font-size:.72rem;line-height:1.5}.range-error{margin-top:14px;color:var(--muted);font-size:.72rem}.range-edge{font-weight:900}.range-edge.ok{color:var(--green)}.range-edge.warn{color:var(--warn)}.range-edge.bad{color:var(--bad)}@media(max-width:960px){.range-grid{grid-template-columns:1fr}.range-state{text-align:left;margin-top:18px}}@media(max-width:640px){.range-panel{padding:20px}.range-metrics,.range-prices{grid-template-columns:1fr}.range-prices>div{text-align:left}}
  `;
  document.head.appendChild(style);

  const depthSection = document.getElementById('depth');
  if (!depthSection) return;

  const section = document.createElement('section');
  section.className = 'section shell range-section';
  section.id = 'rangeVisual';
  section.innerHTML = `
    <div class="section-head">
      <div>
        <div class="kicker">05 // V3 RANGE / TICK MAP</div>
        <h2>WHERE IS PRICE INSIDE<br /><span>THE LIQUIDITY INTERVAL?</span></h2>
      </div>
      <div class="range-state"><span>DIRECT ARC RPC</span><strong id="rangeStatus">WAITING</strong></div>
    </div>
    <div class="range-grid">
      <article class="range-panel">
        <div class="panel-top"><span>CURRENT V3 STATE</span><b id="rangeBadge" class="mini-badge loading">WAITING</b></div>
        <div class="range-metrics">
          <div><span>Current tick</span><strong id="rangeCurrentTick">—</strong></div>
          <div><span>Tick spacing</span><strong id="rangeTickSpacing">—</strong></div>
          <div><span>Nearest initialized lower tick</span><strong id="rangeLowerTick">—</strong></div>
          <div><span>Nearest initialized upper tick</span><strong id="rangeUpperTick">—</strong></div>
          <div><span>Active liquidity (L)</span><strong id="rangeLiquidity">—</strong></div>
          <div><span>Position in interval</span><strong id="rangePositionText">—</strong></div>
        </div>
        <div id="rangeScanNote" class="range-warning">Waiting for a selected Uniswap V3 pool.</div>
      </article>
      <article class="range-panel">
        <div class="panel-top"><span>NEAREST INITIALIZED-TICK INTERVAL</span><b class="mini-badge neutral">READ ONLY</b></div>
        <div class="range-map">
          <div class="range-track-wrap">
            <div class="range-track">
              <div id="rangeFill" class="range-fill"></div>
              <div id="rangeMarker" class="range-marker" style="left:50%"></div>
            </div>
            <span id="rangeLowerLabel" class="range-label left">LOWER —</span>
            <span id="rangeUpperLabel" class="range-label right">UPPER —</span>
          </div>
          <div id="rangePosition" class="range-position">Waiting for boundary discovery…</div>
        </div>
        <div class="range-prices">
          <div><span>Lower boundary price</span><strong id="rangeLowerPrice">—</strong></div>
          <div><span>Current tick price</span><strong id="rangeCurrentPrice">—</strong></div>
          <div><span>Upper boundary price</span><strong id="rangeUpperPrice">—</strong></div>
        </div>
        <div class="range-explainer">
          <strong id="rangeInterpretation">WHY THIS MATTERS</strong>
          <p id="rangeInterpretationCopy">In Uniswap V3, active liquidity can change when price crosses an initialized tick. Mapping the nearest initialized ticks around the current price helps explain where the current constant-liquidity interval begins and ends.</p>
        </div>
      </article>
    </div>
    <p class="range-error"><strong>Important:</strong> this is the nearest initialized-tick interval around the current tick, not necessarily the range of one LP position. Multiple concentrated-liquidity positions can overlap. If a boundary is not found within the bounded bitmap scan, the monitor reports it as unresolved instead of guessing.</p>
  `;
  depthSection.before(section);

  // Other modules also add sections dynamically. Renumber once they have all loaded.
  setTimeout(() => {
    const setKicker = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };
    setKicker('#poolCompare .kicker', '03 // ALL-POOL ONCHAIN COMPARISON');
    setKicker('#onchain .kicker', '04 // ONCHAIN POOL COMPOSITION');
    setKicker('#rangeVisual .kicker', '05 // V3 RANGE / TICK MAP');
    setKicker('#depth .kicker', '06 // SELL-SIDE DEPTH ESTIMATOR');
    setKicker('#diagnosticsReport .kicker', '07 // SHAREABLE DIAGNOSTICS REPORT');
    setKicker('.compare-section .kicker', '08 // INDEXER COMPARISON');
    setKicker('.about-section .kicker', '09 // WHY THIS EXISTS');
  }, 0);

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = value;
  }

  function setBadge(text, type) {
    const node = byId('rangeBadge');
    if (!node) return;
    node.textContent = text;
    node.className = `mini-badge ${type}`;
  }

  function reset() {
    analysisVersion += 1;
    setText('rangeStatus', 'WAITING');
    setBadge('WAITING', 'loading');
    ['rangeCurrentTick','rangeTickSpacing','rangeLowerTick','rangeUpperTick','rangeLiquidity','rangePositionText','rangeLowerPrice','rangeCurrentPrice','rangeUpperPrice'].forEach((id) => setText(id, '—'));
    setText('rangeLowerLabel', 'LOWER —');
    setText('rangeUpperLabel', 'UPPER —');
    setText('rangePosition', 'Waiting for boundary discovery…');
    setText('rangeScanNote', 'Waiting for a selected Uniswap V3 pool.');
    setText('rangeInterpretation', 'WHY THIS MATTERS');
    setText('rangeInterpretationCopy', 'In Uniswap V3, active liquidity can change when price crosses an initialized tick. Mapping the nearest initialized ticks around the current price helps explain where the current constant-liquidity interval begins and ends.');
    if (byId('rangeFill')) byId('rangeFill').style.width = '50%';
    if (byId('rangeMarker')) byId('rangeMarker').style.left = '50%';
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function rpcCall(to, data, attempt = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
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
          await delay(300 * (attempt + 1));
          return rpcCall(to, data, attempt + 1);
        }
        throw new Error(`RPC HTTP ${response.status}`);
      }
      const body = await response.json();
      if (body.error) throw new Error(body.error.message || 'RPC error');
      return body.result;
    } catch (error) {
      if ((error?.name === 'AbortError' || /fetch/i.test(String(error?.message))) && attempt < 2) {
        await delay(300 * (attempt + 1));
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

  function decodeSignedWord(word) {
    let value = BigInt(`0x${word || '0'}`);
    if ((value & (1n << 255n)) !== 0n) value -= 1n << 256n;
    return value;
  }

  function abiSigned(value) {
    return BigInt.asUintN(256, BigInt(value)).toString(16).padStart(64, '0');
  }

  function bitmapData(wordPosition) {
    return SELECTOR.tickBitmap + abiSigned(wordPosition);
  }

  function bitIsSet(bitmap, bit) {
    return ((bitmap >> BigInt(bit)) & 1n) === 1n;
  }

  function mod256(value) {
    return ((value % 256) + 256) % 256;
  }

  async function findLower(pool, currentTick, spacing) {
    const compressed = Math.floor(currentTick / spacing);
    const startWord = Math.floor(compressed / 256);
    const startBit = mod256(compressed);
    const minCompressed = Math.floor(-MAX_TICK / spacing);
    const minWord = Math.floor(minCompressed / 256);
    let scanned = 0;

    for (let word = startWord; word >= minWord && scanned < MAX_WORDS_PER_DIRECTION; word -= 1, scanned += 1) {
      const bitmap = decodeUint(await rpcCall(pool, bitmapData(word)));
      const firstBit = word === startWord ? startBit : 255;
      for (let bit = firstBit; bit >= 0; bit -= 1) {
        if (bitIsSet(bitmap, bit)) return { tick: (word * 256 + bit) * spacing, scanned: scanned + 1 };
      }
    }
    return { tick: null, scanned };
  }

  async function findUpper(pool, currentTick, spacing) {
    const compressed = Math.floor(currentTick / spacing);
    const startWord = Math.floor(compressed / 256);
    const startBit = mod256(compressed);
    const maxCompressed = Math.floor(MAX_TICK / spacing);
    const maxWord = Math.floor(maxCompressed / 256);
    let scanned = 0;

    for (let word = startWord; word <= maxWord && scanned < MAX_WORDS_PER_DIRECTION; word += 1, scanned += 1) {
      const bitmap = decodeUint(await rpcCall(pool, bitmapData(word)));
      const firstBit = word === startWord ? startBit + 1 : 0;
      for (let bit = firstBit; bit <= 255; bit += 1) {
        if (bitIsSet(bitmap, bit)) return { tick: (word * 256 + bit) * spacing, scanned: scanned + 1 };
      }
    }
    return { tick: null, scanned };
  }

  async function decimals(token) {
    try {
      return Number(decodeUint(await rpcCall(token, SELECTOR.decimals)));
    } catch {
      return 18;
    }
  }

  function tickPriceRaw(tick, dec0, dec1) {
    const price = Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  function trackedUsdcPrice(tick, token, token0, token1, dec0, dec1) {
    const raw = tickPriceRaw(tick, dec0, dec1);
    if (!raw) return null;
    const tracked = token.toLowerCase();
    const t0 = token0.toLowerCase();
    const t1 = token1.toLowerCase();
    const usdc = ARC_USDC.toLowerCase();
    if (tracked === t0 && t1 === usdc) return raw;
    if (tracked === t1 && t0 === usdc) return 1 / raw;
    return null;
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n > 0 && n < 0.01) return `$${n.toLocaleString(undefined, { maximumSignificantDigits: 5 })}`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 8 })}`;
  }

  function edgeInterpretation(position) {
    if (!Number.isFinite(position)) return { label: 'PARTIAL BOUNDARY DATA', cls: 'warn', copy: 'One or both nearby initialized tick boundaries could not be resolved within the bounded bitmap scan, so the monitor does not estimate a position inside the interval.' };
    if (position <= 5) return { label: 'VERY NEAR LOWER BOUNDARY', cls: 'bad', copy: 'The current tick is very close to the lower initialized boundary. Crossing that boundary can change active liquidity because initialized ticks are where V3 liquidity deltas are applied.' };
    if (position <= 15) return { label: 'NEAR LOWER BOUNDARY', cls: 'warn', copy: 'The current tick is near the lower initialized boundary. Price movement across that boundary can change the pool\'s active liquidity state.' };
    if (position >= 95) return { label: 'VERY NEAR UPPER BOUNDARY', cls: 'bad', copy: 'The current tick is very close to the upper initialized boundary. Crossing that boundary can change active liquidity because initialized ticks are where V3 liquidity deltas are applied.' };
    if (position >= 85) return { label: 'NEAR UPPER BOUNDARY', cls: 'warn', copy: 'The current tick is near the upper initialized boundary. Price movement across that boundary can change the pool\'s active liquidity state.' };
    return { label: 'INSIDE CURRENT INTERVAL', cls: 'ok', copy: 'The current tick sits away from the nearest initialized boundaries. Active liquidity remains constant between these two initialized ticks, although the token mix can still change continuously as price moves.' };
  }

  async function analyze(detail) {
    const version = ++analysisVersion;
    const pool = detail?.pool;
    const token = detail?.token;
    if (!pool || !token) {
      reset();
      setText('rangeStatus', 'NO POOL');
      setBadge('NO POOL', 'bad');
      setText('rangeScanNote', 'No selected pool is available for tick-range analysis.');
      return;
    }

    setText('rangeStatus', 'READING');
    setBadge('READING', 'loading');
    setText('rangeScanNote', 'Reading slot0, tick spacing and initialized tick bitmap directly from Arc mainnet…');

    try {
      const [token0Hex, token1Hex, slotHex, spacingHex, liquidityHex] = await Promise.all([
        rpcCall(pool, SELECTOR.token0),
        rpcCall(pool, SELECTOR.token1),
        rpcCall(pool, SELECTOR.slot0),
        rpcCall(pool, SELECTOR.tickSpacing),
        rpcCall(pool, SELECTOR.liquidity)
      ]);
      if (version !== analysisVersion) return;

      const token0 = decodeAddress(token0Hex);
      const token1 = decodeAddress(token1Hex);
      const slotWords = splitWords(slotHex);
      const currentTick = Number(decodeSignedWord(slotWords[1]));
      const spacing = Number(decodeUint(spacingHex));
      const activeLiquidity = decodeUint(liquidityHex);
      if (!token0 || !token1 || !Number.isInteger(currentTick) || !Number.isInteger(spacing) || spacing <= 0) throw new Error('Invalid V3 pool state');

      setText('rangeCurrentTick', currentTick.toLocaleString());
      setText('rangeTickSpacing', spacing.toLocaleString());
      setText('rangeLiquidity', activeLiquidity.toLocaleString());

      const [lower, upper, dec0, dec1] = await Promise.all([
        findLower(pool, currentTick, spacing),
        findUpper(pool, currentTick, spacing),
        decimals(token0),
        decimals(token1)
      ]);
      if (version !== analysisVersion) return;

      setText('rangeLowerTick', lower.tick == null ? 'UNRESOLVED' : lower.tick.toLocaleString());
      setText('rangeUpperTick', upper.tick == null ? 'UNRESOLVED' : upper.tick.toLocaleString());
      setText('rangeLowerLabel', lower.tick == null ? 'LOWER ?' : `LOWER ${lower.tick.toLocaleString()}`);
      setText('rangeUpperLabel', upper.tick == null ? 'UPPER ?' : `UPPER ${upper.tick.toLocaleString()}`);

      let position = null;
      if (lower.tick != null && upper.tick != null && upper.tick > lower.tick) {
        position = ((currentTick - lower.tick) / (upper.tick - lower.tick)) * 100;
        position = Math.max(0, Math.min(100, position));
        if (byId('rangeFill')) byId('rangeFill').style.width = `${position}%`;
        if (byId('rangeMarker')) byId('rangeMarker').style.left = `${position}%`;
        setText('rangePositionText', `${position.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`);
        setText('rangePosition', `${position.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of the way from the lower initialized tick to the upper initialized tick.`);
      } else {
        setText('rangePositionText', 'PARTIAL');
        setText('rangePosition', 'A complete nearest-boundary interval was not resolved, so no position percentage is shown.');
        if (byId('rangeFill')) byId('rangeFill').style.width = '50%';
        if (byId('rangeMarker')) byId('rangeMarker').style.left = '50%';
      }

      const currentPrice = trackedUsdcPrice(currentTick, token, token0, token1, dec0, dec1);
      const lowerPrice = lower.tick == null ? null : trackedUsdcPrice(lower.tick, token, token0, token1, dec0, dec1);
      const upperPrice = upper.tick == null ? null : trackedUsdcPrice(upper.tick, token, token0, token1, dec0, dec1);
      setText('rangeCurrentPrice', currentPrice == null ? 'NON-USDC PAIR' : money(currentPrice));
      setText('rangeLowerPrice', lowerPrice == null ? (currentPrice == null ? 'NON-USDC PAIR' : 'UNRESOLVED') : money(lowerPrice));
      setText('rangeUpperPrice', upperPrice == null ? (currentPrice == null ? 'NON-USDC PAIR' : 'UNRESOLVED') : money(upperPrice));

      const interpretation = edgeInterpretation(position);
      setText('rangeInterpretation', interpretation.label);
      setText('rangeInterpretationCopy', interpretation.copy);

      const lowerResolved = lower.tick != null;
      const upperResolved = upper.tick != null;
      if (lowerResolved && upperResolved) {
        setText('rangeScanNote', `Both nearest initialized tick boundaries were resolved from the pool's tick bitmap. This interval is where the current active-liquidity value L remains unchanged; it is not necessarily one LP position's range.`);
        setText('rangeStatus', interpretation.cls === 'ok' ? 'LIVE' : 'EDGE WATCH');
        setBadge(interpretation.label, interpretation.cls);
      } else {
        const sides = [lowerResolved ? null : 'lower', upperResolved ? null : 'upper'].filter(Boolean).join(' and ');
        setText('rangeScanNote', `The ${sides} initialized boundary was not found within ${MAX_WORDS_PER_DIRECTION} bitmap words in that direction. The monitor stops there rather than guessing a range.`);
        setText('rangeStatus', 'PARTIAL');
        setBadge('PARTIAL RANGE', 'warn');
      }
    } catch (error) {
      if (version !== analysisVersion) return;
      setText('rangeStatus', 'INCOMPLETE');
      setBadge('RETRY', 'warn');
      setText('rangeScanNote', 'The V3 tick-range read could not complete from the current Arc RPC snapshot. This is a read failure, not evidence that the pool has no initialized range.');
      setText('rangeInterpretation', 'RANGE READ INCOMPLETE');
      setText('rangeInterpretationCopy', 'Retry the token check. The monitor intentionally does not infer initialized tick boundaries when bitmap reads fail.');
      console.warn('Arc Launch Monitor range visualization failed:', error);
    }
  }

  window.addEventListener('arc-monitor-reset', reset);
  window.addEventListener('arc-monitor-result', (event) => analyze(event.detail));
  reset();
})();
