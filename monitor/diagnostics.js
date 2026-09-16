(() => {
  let latestDetail = null;
  let debounceTimer = null;

  const byId = (id) => document.getElementById(id);
  const text = (id) => byId(id)?.textContent?.trim() || '—';

  const style = document.createElement('style');
  style.textContent = `
    .report-section{position:relative}.report-state{text-align:right}.report-state span{display:block;color:var(--muted);font-size:.66rem;letter-spacing:.12em}.report-state strong{display:block;color:var(--green);font-size:.82rem;margin-top:6px}.report-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:0;border-top:1px solid var(--line);border-left:1px solid var(--line)}.report-panel{padding:26px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.012)}.report-panel .panel-top{margin-bottom:16px}.report-preview{margin:0;min-height:360px;max-height:620px;overflow:auto;white-space:pre-wrap;word-break:break-word;background:#030604;border:1px solid var(--line-soft);padding:18px;color:#b9c2bb;font:500 .72rem/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.report-actions{display:grid;gap:10px}.report-actions button{border:1px solid var(--green);background:transparent;color:var(--green);padding:13px 14px;font:inherit;font-size:.68rem;font-weight:900;letter-spacing:.08em;cursor:pointer;text-align:left}.report-actions button:hover{background:var(--green);color:#001a07}.report-actions button.secondary{border-color:var(--line);color:#a7b0a9}.report-actions button.secondary:hover{background:#111813;color:var(--text)}.report-summary{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line-soft);margin-bottom:18px}.report-summary>div{background:#080d09;padding:14px}.report-summary span{display:block;color:#667068;font-size:.57rem;text-transform:uppercase;letter-spacing:.08em}.report-summary strong{display:block;margin-top:6px;font-size:.79rem;word-break:break-word}.report-help{margin:18px 0 0;color:var(--muted);font-size:.75rem;line-height:1.55}.report-ready{color:var(--green)}.report-waiting{color:var(--warn)}@media(max-width:960px){.report-grid{grid-template-columns:1fr}.report-state{text-align:left;margin-top:18px}}@media(max-width:640px){.report-panel{padding:20px}.report-summary{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const compareSection = document.querySelector('.compare-section');
  if (!compareSection) return;

  const section = document.createElement('section');
  section.className = 'section shell report-section';
  section.id = 'diagnosticsReport';
  section.innerHTML = `
    <div class="section-head">
      <div>
        <div class="kicker">06 // SHAREABLE DIAGNOSTICS REPORT</div>
        <h2>TURN THE SNAPSHOT<br /><span>INTO A REPORT.</span></h2>
      </div>
      <div class="report-state"><span>REPORT STATUS</span><strong id="reportStatus" class="report-waiting">WAITING</strong></div>
    </div>
    <div class="report-grid">
      <article class="report-panel">
        <div class="panel-top"><span>PLAIN-TEXT DIAGNOSTIC</span><b class="mini-badge neutral">READ ONLY</b></div>
        <pre id="reportPreview" class="report-preview">Waiting for token diagnostics…</pre>
      </article>
      <article class="report-panel">
        <div class="panel-top"><span>SHARE / EXPORT</span><b id="reportBadge" class="mini-badge loading">WAITING</b></div>
        <div class="report-summary">
          <div><span>Token</span><strong id="reportToken">—</strong></div>
          <div><span>Markets</span><strong id="reportMarketCount">—</strong></div>
          <div><span>Selected pool</span><strong id="reportPool">—</strong></div>
          <div><span>Onchain status</span><strong id="reportOnchain">—</strong></div>
        </div>
        <div class="report-actions">
          <button id="copyDiagnosticsReport" type="button">COPY REPORT</button>
          <button id="copyDiagnosticsLink" type="button">COPY SHARE LINK</button>
          <button id="downloadDiagnosticsJson" class="secondary" type="button">DOWNLOAD JSON</button>
        </div>
        <p class="report-help">The report separates third-party reported liquidity from direct onchain reserves. A pool's USDC balance is a snapshot, not a guaranteed executable sell amount. JSON export contains the same read-only diagnostic state for debugging or integrations.</p>
      </article>
    </div>
  `;
  compareSection.before(section);

  const compareKicker = document.querySelector('.compare-section .kicker');
  const aboutKicker = document.querySelector('.about-section .kicker');
  if (compareKicker) compareKicker.textContent = '07 // INDEXER COMPARISON';
  if (aboutKicker) aboutKicker.textContent = '08 // WHY THIS EXISTS';

  function clean(value) {
    const v = String(value ?? '').trim();
    return v && v !== '—' ? v : null;
  }

  function marketCount(detail) {
    const pairs = Array.isArray(detail?.dexPairs) ? detail.dexPairs : [];
    const addresses = new Set(pairs.map((pair) => String(pair?.pairAddress || '').toLowerCase()).filter(Boolean));
    const launch = String(detail?.arcPadMeta?.pool || '').toLowerCase();
    if (launch) addresses.add(launch);
    return addresses.size;
  }

  function parseAllPoolRows() {
    const rows = [...document.querySelectorAll('#poolCompareRows tr')];
    return rows.map((row) => {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 7) return null;
      const marketCell = cells[0];
      const tags = [...marketCell.querySelectorAll('.pool-compare-tag')].map((tag) => tag.textContent.trim());
      return {
        market: clean(marketCell.querySelector('strong')?.textContent),
        pool: clean(marketCell.querySelector('code')?.textContent),
        tags,
        reportedLiquidity: clean(cells[1]?.textContent),
        usdcHeld: clean(cells[2]?.textContent),
        feeTier: clean(cells[3]?.textContent),
        activeLiquidity: clean(cells[4]?.textContent),
        estimatedUsdcShare: clean(cells[5]?.textContent),
        composition: clean(cells[6]?.textContent)
      };
    }).filter(Boolean);
  }

  function topPair(detail) {
    const pairs = Array.isArray(detail?.dexPairs) ? detail.dexPairs : [];
    return [...pairs].sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0] || null;
  }

  function snapshot() {
    if (!latestDetail?.token) return null;
    const detail = latestDetail;
    const top = topPair(detail);
    const pools = parseAllPoolRows();
    const tokenName = detail?.arcPadMeta?.name || detail?.dexPair?.baseToken?.name || 'Unknown token';
    const symbol = detail?.arcPadMeta?.symbol || detail?.dexPair?.baseToken?.symbol || 'TOKEN';
    const count = marketCount(detail);
    const shareUrl = location.href;
    const composition = clean(text('compositionBadge'));
    const onchainStatus = clean(text('onchainStatus'));
    const depthStatus = clean(text('depthStatus'));
    const selectedPool = clean(detail.pool);

    const warnings = [];
    if (composition && /ONE-SIDED/i.test(composition)) {
      warnings.push(`Selected pool composition is ${composition.toLowerCase()}. Reported liquidity should not be treated as immediately sellable USDC.`);
    }
    const compareStatus = clean(text('poolCompareStatus'));
    if (compareStatus && !['LIVE'].includes(compareStatus)) {
      warnings.push(`All-pool RPC comparison status is ${compareStatus}; one or more direct reads may be incomplete.`);
    }
    if (onchainStatus && !['LIVE'].includes(onchainStatus)) {
      warnings.push(`Selected-pool onchain status is ${onchainStatus}; retry before treating missing values as definitive.`);
    }

    return {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      network: { name: 'Arc mainnet', chainId: 5042 },
      token: { name: tokenName, symbol, contract: detail.token },
      sources: {
        arcPad: Boolean(detail.arcPadMeta),
        dexScreener: Array.isArray(detail.dexPairs) && detail.dexPairs.length > 0,
        arcRpc: onchainStatus || 'UNKNOWN'
      },
      marketDiscovery: {
        knownPools: count,
        arcPadLaunchPool: clean(detail?.arcPadMeta?.pool),
        largestReportedMarket: top ? {
          pool: clean(top.pairAddress),
          pair: `${top?.baseToken?.symbol || 'TOKEN'} / ${top?.quoteToken?.symbol || 'PAIR'}`,
          reportedLiquidityUsd: Number.isFinite(Number(top?.liquidity?.usd)) ? Number(top.liquidity.usd) : null
        } : null,
        allPoolComparisonStatus: compareStatus,
        largestUsdcReserveSummary: clean(text('poolCompareUsdc')),
        closestTo5050Summary: clean(text('poolCompareBalanced')),
        pools
      },
      selectedPool: {
        pool: selectedPool,
        selectionReason: clean(detail.selectionReason),
        reportedLiquidity: clean(text('reportedLiquidity')),
        usdcHeld: clean(text('usdcReserve')),
        estimatedUsdcShare: clean(text('usdcShare')),
        composition,
        feeTier: clean(text('chainFee')),
        currentTick: clean(text('chainTick')),
        activeLiquidity: clean(text('chainActiveLiquidity')),
        onchainTokenPrice: clean(text('chainPrice')),
        onchainStatus
      },
      sellSideDepth: {
        status: depthStatus,
        usdcHeld: clean(text('depthReserve')),
        approximateReserveBoundary: clean(text('depthBoundary')),
        poolFee: clean(text('depthFee')),
        note: 'Local V3 estimate only; not a router quote or guaranteed executable amount.'
      },
      warnings,
      shareUrl,
      disclaimer: 'Read-only informational snapshot. Reported liquidity, raw reserves, and local depth estimates are different concepts. Pool state can change immediately.'
    };
  }

  function formatMoneyNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  function buildReport(data) {
    if (!data) return 'Waiting for token diagnostics…';
    const lines = [];
    lines.push('ARC LAUNCH MONITOR // DIAGNOSTIC REPORT');
    lines.push('');
    lines.push(`${data.token.name} (${data.token.symbol})`);
    lines.push(`Contract: ${data.token.contract}`);
    lines.push('Network: Arc mainnet // 5042');
    lines.push(`Generated: ${data.generatedAt}`);
    lines.push('');
    lines.push('MARKET DISCOVERY');
    lines.push(`- Known Arc pools: ${data.marketDiscovery.knownPools}`);
    lines.push(`- ArcPad launch pool: ${data.marketDiscovery.arcPadLaunchPool || 'not resolved'}`);
    if (data.marketDiscovery.largestReportedMarket) {
      lines.push(`- Largest DexScreener-reported market: ${formatMoneyNumber(data.marketDiscovery.largestReportedMarket.reportedLiquidityUsd)} // ${data.marketDiscovery.largestReportedMarket.pool}`);
    } else {
      lines.push('- Largest DexScreener-reported market: not available');
    }
    lines.push(`- Largest direct USDC reserve: ${data.marketDiscovery.largestUsdcReserveSummary || 'not calculable'}`);
    lines.push(`- Closest to 50/50 by estimated spot value: ${data.marketDiscovery.closestTo5050Summary || 'not calculable'}`);
    lines.push('');
    lines.push('SELECTED POOL // DIRECT ARC RPC');
    lines.push(`- Pool: ${data.selectedPool.pool || 'not resolved'}`);
    lines.push(`- Reported liquidity: ${data.selectedPool.reportedLiquidity || 'not available'}`);
    lines.push(`- USDC held by pool: ${data.selectedPool.usdcHeld || 'not available'}`);
    lines.push(`- Estimated USDC share: ${data.selectedPool.estimatedUsdcShare || 'not available'}`);
    lines.push(`- Composition: ${data.selectedPool.composition || 'not available'}`);
    lines.push(`- Fee tier: ${data.selectedPool.feeTier || 'not available'}`);
    lines.push(`- Active liquidity (L): ${data.selectedPool.activeLiquidity || 'not available'}`);
    lines.push('');
    lines.push('SELL-SIDE DEPTH');
    lines.push(`- Approx. reserve boundary: ${data.sellSideDepth.approximateReserveBoundary || 'not available'}`);
    lines.push(`- Depth model status: ${data.sellSideDepth.status || 'not available'}`);
    lines.push('- Estimate only; this is not a live router quote.');
    if (data.warnings.length) {
      lines.push('');
      lines.push('DIAGNOSTIC FLAGS');
      data.warnings.forEach((warning) => lines.push(`- ${warning}`));
    }
    lines.push('');
    lines.push("Important: headline/reported liquidity, the pool's raw USDC balance, and executable sell depth are not the same thing.");
    lines.push('No wallet connected. Read-only analysis.');
    lines.push('');
    lines.push(`Share: ${data.shareUrl}`);
    return lines.join('\n');
  }

  function render() {
    const data = snapshot();
    const preview = byId('reportPreview');
    if (!preview) return;
    if (!data) {
      preview.textContent = 'Waiting for token diagnostics…';
      byId('reportBadge').textContent = 'WAITING';
      byId('reportBadge').className = 'mini-badge loading';
      byId('reportStatus').textContent = 'WAITING';
      byId('reportStatus').className = 'report-waiting';
      return;
    }
    preview.textContent = buildReport(data);
    byId('reportToken').textContent = `${data.token.symbol} // ${data.token.contract.slice(0, 8)}…${data.token.contract.slice(-6)}`;
    byId('reportMarketCount').textContent = `${data.marketDiscovery.knownPools} ${data.marketDiscovery.knownPools === 1 ? 'POOL' : 'POOLS'}`;
    byId('reportPool').textContent = data.selectedPool.pool ? `${data.selectedPool.pool.slice(0, 8)}…${data.selectedPool.pool.slice(-6)}` : 'UNRESOLVED';
    byId('reportOnchain').textContent = data.selectedPool.onchainStatus || 'WAITING';
    byId('reportBadge').textContent = 'READY';
    byId('reportBadge').className = 'mini-badge ok';
    byId('reportStatus').textContent = 'READY';
    byId('reportStatus').className = 'report-ready';
  }

  function scheduleRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 120);
  }

  function copyText(value, label) {
    navigator.clipboard.writeText(value).then(() => {
      if (typeof showToast === 'function') showToast(label);
    }).catch(() => {
      if (typeof showToast === 'function') showToast('COPY FAILED');
    });
  }

  byId('copyDiagnosticsReport')?.addEventListener('click', () => {
    const data = snapshot();
    if (!data) return;
    copyText(buildReport(data), 'REPORT COPIED');
  });

  byId('copyDiagnosticsLink')?.addEventListener('click', () => {
    const data = snapshot();
    if (!data) return;
    copyText(data.shareUrl, 'SHARE LINK COPIED');
  });

  byId('downloadDiagnosticsJson')?.addEventListener('click', () => {
    const data = snapshot();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const symbol = String(data.token.symbol || 'token').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
    a.href = url;
    a.download = `arc-launch-monitor-${symbol}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  window.addEventListener('arc-monitor-reset', () => {
    latestDetail = null;
    scheduleRender();
  });

  window.addEventListener('arc-monitor-result', (event) => {
    latestDetail = event.detail;
    scheduleRender();
    setTimeout(scheduleRender, 700);
    setTimeout(scheduleRender, 1800);
  });

  const observed = ['poolCompareRows','poolCompareStatus','onchainStatus','reportedLiquidity','usdcReserve','usdcShare','compositionBadge','chainFee','chainTick','chainActiveLiquidity','depthStatus','depthBoundary'];
  const observer = new MutationObserver(scheduleRender);
  observed.forEach((id) => {
    const node = byId(id);
    if (node) observer.observe(node, { subtree: true, childList: true, characterData: true, attributes: true });
  });

  render();
})();
