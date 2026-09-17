(() => {
  const DATA_URL = 'history-data.json';
  const byId = (id) => document.getElementById(id);
  let activeToken = null;
  let requestVersion = 0;

  const style = document.createElement('style');
  style.textContent = `
    .history-section{position:relative}.history-state{text-align:right}.history-state span{display:block;color:var(--muted);font-size:.66rem;letter-spacing:.12em}.history-state strong{display:block;color:var(--green);font-size:.82rem;margin-top:6px}.history-intro{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:22px}.history-intro p{margin:0;color:var(--muted);font-size:.78rem;line-height:1.55}.history-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line-soft);border:1px solid var(--line);margin-bottom:18px}.history-summary>div{background:#080d09;padding:14px}.history-summary span{display:block;color:#667068;font-size:.55rem;text-transform:uppercase;letter-spacing:.08em}.history-summary strong{display:block;margin-top:6px;font-size:.8rem}.history-charts{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);border-left:1px solid var(--line)}.history-chart{padding:22px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.012)}.history-chart-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.history-chart-head span{color:var(--muted);font-size:.59rem;letter-spacing:.08em;text-transform:uppercase}.history-chart-head strong{font-size:.86rem}.history-svg{display:block;width:100%;height:160px;border:1px solid var(--line-soft);background:#040705}.history-gridline{stroke:#1a211b;stroke-width:1}.history-line{fill:none;stroke:var(--green);stroke-width:2;vector-effect:non-scaling-stroke}.history-dot{fill:var(--green)}.history-axis{fill:#6e786f;font-size:9px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.history-range{display:flex;justify-content:space-between;color:#667068;font-size:.58rem;margin-top:8px}.history-flags{margin-top:18px;border:1px solid var(--line)}.history-flags-head{padding:12px 15px;border-bottom:1px solid var(--line);font-size:.62rem;color:var(--green);font-weight:900;letter-spacing:.08em}.history-flag{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:12px 15px;border-bottom:1px solid var(--line-soft);align-items:start}.history-flag:last-child{border-bottom:0}.history-flag b{font-size:.55rem;border:1px solid var(--line);padding:3px 5px;color:#89928b}.history-flag.warn b{color:var(--warn);border-color:rgba(255,204,77,.45)}.history-flag.bad b{color:var(--bad);border-color:rgba(255,91,91,.45)}.history-flag.ok b{color:var(--green);border-color:rgba(0,255,71,.35)}.history-flag p{margin:0;color:#a9b2ab;font-size:.71rem;line-height:1.45}.history-empty{padding:22px;border:1px solid var(--line);color:var(--muted);font-size:.76rem;line-height:1.55}.history-note{margin-top:16px;color:var(--muted);font-size:.7rem;line-height:1.55}@media(max-width:960px){.history-intro,.history-charts{grid-template-columns:1fr}.history-summary{grid-template-columns:1fr 1fr}.history-state{text-align:left;margin-top:18px}}@media(max-width:640px){.history-summary{grid-template-columns:1fr}.history-chart{padding:18px}}
  `;
  document.head.appendChild(style);

  const rangeSection = document.getElementById('rangeVisual');
  const depthSection = document.getElementById('depth');
  const anchor = rangeSection || depthSection;
  if (!anchor) return;

  const section = document.createElement('section');
  section.className = 'section shell history-section';
  section.id = 'marketHistory';
  section.innerHTML = `
    <div class="section-head">
      <div>
        <div class="kicker">06 // MARKET HISTORY</div>
        <h2>HOW HAS THE POOL<br /><span>CHANGED OVER TIME?</span></h2>
      </div>
      <div class="history-state"><span>SNAPSHOT ENGINE</span><strong id="historyStatus">WAITING</strong><span style="margin-top:8px">SAMPLES</span><strong id="historySamples">—</strong></div>
    </div>
    <div class="history-intro">
      <p>Arc Launch Monitor now records benchmark token snapshots every six hours through GitHub Actions. The history view keeps reported market data separate from direct Arc RPC reserves so changes can be compared over time.</p>
      <p>History is currently enabled for a fixed four-token benchmark set. A missing history series means the contract is not tracked yet or the first scheduled capture has not completed — not that the token has no market activity.</p>
    </div>
    <div class="history-summary">
      <div><span>Latest snapshot</span><strong id="historyLatest">—</strong></div>
      <div><span>USDC reserve</span><strong id="historyLatestUsdc">—</strong></div>
      <div><span>Reported liquidity</span><strong id="historyLatestReported">—</strong></div>
      <div><span>Composition</span><strong id="historyLatestComposition">—</strong></div>
    </div>
    <div id="historyBody" class="history-empty">Waiting for a token check…</div>
    <p class="history-note">Snapshots are periodic observations, not continuous market data. Reported liquidity comes from DexScreener while reserves, tick and active liquidity come from direct Arc RPC reads. Historical values can have gaps when an upstream service is unavailable.</p>
  `;
  if (rangeSection) rangeSection.after(section); else depthSection.before(section);

  setTimeout(() => {
    const setKicker = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };
    setKicker('#poolCompare .kicker', '03 // ALL-POOL ONCHAIN COMPARISON');
    setKicker('#onchain .kicker', '04 // ONCHAIN POOL COMPOSITION');
    setKicker('#rangeVisual .kicker', '05 // V3 RANGE / TICK MAP');
    setKicker('#marketHistory .kicker', '06 // MARKET HISTORY');
    setKicker('#depth .kicker', '07 // SELL-SIDE DEPTH ESTIMATOR');
    setKicker('#diagnosticsReport .kicker', '08 // SHAREABLE DIAGNOSTICS REPORT');
    setKicker('.compare-section .kicker', '09 // INDEXER COMPARISON');
    setKicker('.about-section .kicker', '10 // WHY THIS EXISTS');
  }, 0);

  function money(value, max = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n > 0 && n < 0.01) return `$${n.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: max })}`;
  }

  function percent(value, digits = 1) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}%` : '—';
  }

  function dateLabel(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatComposition(value) {
    return String(value || '—').replaceAll('_', ' ');
  }

  function reset() {
    requestVersion += 1;
    activeToken = null;
    byId('historyStatus').textContent = 'WAITING';
    byId('historySamples').textContent = '—';
    byId('historyLatest').textContent = '—';
    byId('historyLatestUsdc').textContent = '—';
    byId('historyLatestReported').textContent = '—';
    byId('historyLatestComposition').textContent = '—';
    byId('historyBody').className = 'history-empty';
    byId('historyBody').textContent = 'Waiting for a token check…';
  }

  function finiteSeries(snapshots, key) {
    return snapshots.map((snap) => ({ timestamp: snap.timestamp, value: Number(snap?.[key]) })).filter((point) => Number.isFinite(point.value));
  }

  function svgChart(points, formatter) {
    if (!points.length) return '<div class="history-empty">No values captured for this metric yet.</div>';
    const width = 640;
    const height = 160;
    const padX = 18;
    const padY = 18;
    const values = points.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      const delta = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
      min -= delta;
      max += delta;
    }
    const x = (i) => points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = (v) => height - padY - ((v - min) / (max - min)) * (height - padY * 2);
    const coords = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
    const dots = points.length <= 24 ? points.map((p, i) => `<circle class="history-dot" cx="${x(i).toFixed(2)}" cy="${y(p.value).toFixed(2)}" r="2.4"><title>${dateLabel(p.timestamp)} // ${formatter(p.value)}</title></circle>`).join('') : '';
    return `<svg class="history-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historical metric chart">
      <line class="history-gridline" x1="${padX}" y1="${padY}" x2="${width - padX}" y2="${padY}" />
      <line class="history-gridline" x1="${padX}" y1="${height / 2}" x2="${width - padX}" y2="${height / 2}" />
      <line class="history-gridline" x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" />
      <text class="history-axis" x="${padX + 3}" y="${padY + 11}">${formatter(max)}</text>
      <text class="history-axis" x="${padX + 3}" y="${height - padY - 4}">${formatter(min)}</text>
      <polyline class="history-line" points="${coords}" />${dots}
    </svg>`;
  }

  function chartCard(title, points, formatter) {
    const latest = points.at(-1);
    return `<article class="history-chart">
      <div class="history-chart-head"><span>${title}</span><strong>${latest ? formatter(latest.value) : '—'}</strong></div>
      ${svgChart(points, formatter)}
      <div class="history-range"><span>${points.length ? dateLabel(points[0].timestamp) : '—'}</span><span>${points.length ? dateLabel(points.at(-1).timestamp) : '—'}</span></div>
    </article>`;
  }

  function changePct(previous, current) {
    if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function flags(snapshots) {
    if (snapshots.length < 2) return [{ type: 'ok', label: 'COLLECTING', text: 'One snapshot is available. Change flags begin after the next successful capture.' }];
    const prev = snapshots.at(-2);
    const curr = snapshots.at(-1);
    const out = [];
    const usdcChange = changePct(Number(prev.usdcReserve), Number(curr.usdcReserve));
    const reportedChange = changePct(Number(prev.reportedLiquidityUsd), Number(curr.reportedLiquidityUsd));
    const priceChange = changePct(Number(prev.priceUsd), Number(curr.priceUsd));

    if (Number.isFinite(usdcChange) && usdcChange <= -20) out.push({ type: 'bad', label: 'RESERVE', text: `USDC reserve fell ${Math.abs(usdcChange).toFixed(1)}% since the previous snapshot.` });
    else if (Number.isFinite(usdcChange) && Math.abs(usdcChange) >= 10) out.push({ type: 'warn', label: 'RESERVE', text: `USDC reserve changed ${usdcChange > 0 ? '+' : ''}${usdcChange.toFixed(1)}% since the previous snapshot.` });

    if (Number.isFinite(reportedChange) && Number.isFinite(usdcChange) && reportedChange >= 10 && usdcChange <= -10) {
      out.push({ type: 'bad', label: 'DIVERGENCE', text: `Reported liquidity rose ${reportedChange.toFixed(1)}% while the pool's USDC reserve fell ${Math.abs(usdcChange).toFixed(1)}%. These metrics are diverging and should be interpreted separately.` });
    }

    if (prev.composition && curr.composition && prev.composition !== curr.composition) {
      out.push({ type: 'warn', label: 'COMPOSITION', text: `Pool composition changed from ${formatComposition(prev.composition)} to ${formatComposition(curr.composition)}.` });
    }

    if (Number.isFinite(priceChange) && Math.abs(priceChange) >= 20) {
      out.push({ type: 'warn', label: 'PRICE', text: `Onchain token price changed ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% since the previous snapshot.` });
    }

    if (!out.length) out.push({ type: 'ok', label: 'STABLE SNAPSHOT', text: 'No configured large-change condition was detected between the two latest successful snapshots.' });
    return out;
  }

  function renderSeries(record) {
    const snapshots = [...(record.snapshots || [])].filter((snap) => snap?.timestamp).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    byId('historySamples').textContent = `${snapshots.length}`;
    if (!snapshots.length) {
      byId('historyStatus').textContent = 'COLLECTING';
      byId('historyBody').className = 'history-empty';
      byId('historyBody').textContent = 'This token is tracked, but no successful historical snapshot has been committed yet. The collector runs every six hours.';
      return;
    }

    const latest = snapshots.at(-1);
    byId('historyStatus').textContent = snapshots.length > 1 ? 'LIVE HISTORY' : 'FIRST SNAPSHOT';
    byId('historyLatest').textContent = dateLabel(latest.timestamp);
    byId('historyLatestUsdc').textContent = money(latest.usdcReserve, 6);
    byId('historyLatestReported').textContent = money(latest.reportedLiquidityUsd, 0);
    byId('historyLatestComposition').textContent = formatComposition(latest.composition);

    const price = finiteSeries(snapshots, 'priceUsd');
    const reported = finiteSeries(snapshots, 'reportedLiquidityUsd');
    const usdc = finiteSeries(snapshots, 'usdcReserve');
    const share = finiteSeries(snapshots, 'usdcSharePct');
    const currentTick = finiteSeries(snapshots, 'currentTick');
    const activeL = snapshots.map((snap) => ({ timestamp: snap.timestamp, value: Number(snap.activeLiquidity) })).filter((p) => Number.isFinite(p.value));
    const eventFlags = flags(snapshots);

    byId('historyBody').className = '';
    byId('historyBody').innerHTML = `
      <div class="history-charts">
        ${chartCard('DIRECT USDC RESERVE', usdc, (v) => money(v, 4))}
        ${chartCard('DEXSCREENER REPORTED LIQUIDITY', reported, (v) => money(v, 0))}
        ${chartCard('ONCHAIN TOKEN PRICE', price, (v) => money(v, 8))}
        ${chartCard('ESTIMATED USDC SHARE', share, (v) => percent(v, 1))}
        ${chartCard('CURRENT TICK', currentTick, (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }))}
        ${chartCard('ACTIVE LIQUIDITY (L)', activeL, (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 }))}
      </div>
      <div class="history-flags">
        <div class="history-flags-head">LATEST CHANGE FLAGS // PREVIOUS SNAPSHOT → CURRENT</div>
        ${eventFlags.map((flag) => `<div class="history-flag ${flag.type}"><b>${flag.label}</b><p>${flag.text}</p></div>`).join('')}
      </div>`;
  }

  async function load(token) {
    activeToken = token?.toLowerCase() || null;
    const version = ++requestVersion;
    byId('historyStatus').textContent = 'LOADING';
    byId('historyBody').className = 'history-empty';
    byId('historyBody').textContent = 'Loading committed historical snapshots…';
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`history data HTTP ${response.status}`);
      const data = await response.json();
      if (version !== requestVersion || activeToken !== token.toLowerCase()) return;
      const record = data?.tokens?.[token.toLowerCase()];
      if (!record) {
        byId('historyStatus').textContent = 'UNTRACKED';
        byId('historySamples').textContent = '0';
        byId('historyBody').className = 'history-empty';
        byId('historyBody').textContent = 'Historical collection is not currently enabled for this contract. The benchmark collector tracks $EXIT, ARCHE, BIKETYSON and NAMESONARC.';
        return;
      }
      renderSeries(record);
    } catch (error) {
      if (version !== requestVersion) return;
      byId('historyStatus').textContent = 'UNAVAILABLE';
      byId('historyBody').className = 'history-empty';
      byId('historyBody').textContent = 'Historical snapshot data could not be loaded. Current live diagnostics above are unaffected.';
      console.warn('Arc Launch Monitor history load failed:', error);
    }
  }

  window.addEventListener('arc-monitor-reset', reset);
  window.addEventListener('arc-monitor-result', (event) => {
    const token = event.detail?.token;
    if (token) load(token);
  });
  reset();
})();
