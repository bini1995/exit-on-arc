(() => {
  const CONTRACT = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
  const TARGET = 25;
  const BLOCKSCOUT = 'https://explorer.arc.io/api/v2';
  const SHARE_URL = 'https://exitonarc.xyz/founding/';
  const byId = (id) => document.getElementById(id);

  function validAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  }

  function validCount(value) {
    const count = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(count) && count >= 0 ? count : null;
  }

  function shortAddress(value) {
    const address = String(value || '');
    return validAddress(address) ? `${address.slice(0, 8)}…${address.slice(-6)}` : '—';
  }

  function hasRecordedRpcProof(member) {
    if (!validAddress(member?.address)) return false;
    if (member?.verification?.method !== 'arc-rpc-balanceOf') return false;
    const block = Number(member?.verification?.verifiedAtBlock);
    if (!Number.isInteger(block) || block <= 0) return false;
    try {
      return BigInt(String(member?.verification?.verifiedBalanceRaw ?? '0')) > 0n;
    } catch {
      return false;
    }
  }

  async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadHolderCount() {
    const status = byId('campaignHolderStatus');
    if (status) {
      status.textContent = 'READING CHAIN';
      status.className = 'campaign-warn';
    }

    try {
      let count = null;
      try {
        const counters = await fetchJson(`${BLOCKSCOUT}/tokens/${CONTRACT}/counters`);
        count = validCount(counters?.token_holders_count ?? counters?.holders_count ?? counters?.holders);
      } catch (error) {
        console.warn('Founding campaign counters endpoint unavailable:', error);
      }

      if (count == null) {
        const token = await fetchJson(`${BLOCKSCOUT}/tokens/${CONTRACT}`);
        count = validCount(token?.holders ?? token?.holders_count ?? token?.token_holders_count);
      }

      if (count == null) throw new Error('Holder count missing from explorer response');
      byId('campaignHolders').textContent = count.toLocaleString();
      status.textContent = 'LIVE';
      status.className = 'campaign-live';
    } catch (error) {
      byId('campaignHolders').textContent = '—';
      status.textContent = 'READ UNAVAILABLE';
      status.className = 'campaign-warn';
      console.warn('Founding campaign holder read unavailable:', error);
    }
  }

  function renderSlots(members) {
    const grid = byId('campaignRosterGrid');
    if (!grid) return;
    grid.replaceChildren();

    for (let index = 0; index < TARGET; index += 1) {
      const member = members[index];
      const slot = document.createElement('div');
      slot.className = `campaign-slot${member ? '' : ' open'}`;

      const number = document.createElement('small');
      number.textContent = `FOUNDING ${String(index + 1).padStart(2, '0')}`;

      const identity = document.createElement('strong');
      identity.textContent = member?.displayName || member?.xHandle || (member ? shortAddress(member.address) : 'OPEN');

      slot.append(number, identity);

      if (member) {
        const address = document.createElement('code');
        address.textContent = shortAddress(member.address);
        address.title = member.address;
        slot.appendChild(address);
      } else {
        const copy = document.createElement('code');
        copy.textContent = 'VERIFIED HOLDER SPOT';
        slot.appendChild(copy);
      }

      grid.appendChild(slot);
    }
  }

  async function loadRoster() {
    try {
      const data = await fetchJson(`../founding-roster.json?v=${Date.now()}`);
      const rawMembers = Array.isArray(data?.members) ? data.members : [];
      const seen = new Set();
      const members = rawMembers.filter((member) => {
        if (!hasRecordedRpcProof(member)) return false;
        const address = member.address.toLowerCase();
        if (seen.has(address)) return false;
        seen.add(address);
        return true;
      }).slice(0, TARGET);

      const verified = members.length;
      const open = Math.max(0, TARGET - verified);
      byId('campaignVerified').textContent = verified.toLocaleString();
      byId('campaignOpen').textContent = open.toLocaleString();
      byId('campaignProgressFill').style.width = `${(verified / TARGET) * 100}%`;
      renderSlots(members);
    } catch (error) {
      byId('campaignVerified').textContent = '—';
      byId('campaignOpen').textContent = '—';
      renderSlots([]);
      console.warn('Founding campaign roster unavailable:', error);
    }
  }

  const shareText = 'Arc mainnet is live. $EXIT is documenting its first 25 real community holders with onchain verification and permanent OG recognition — no giveaways, no fake wallets, no promised returns.\n\nTHE FOUNDING 25:';
  const share = byId('shareFoundingX');
  if (share) {
    share.href = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(SHARE_URL)}`;
  }

  const copyLink = byId('copyFoundingLink');
  copyLink?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      const previous = copyLink.textContent;
      copyLink.textContent = 'FOUNDING LINK COPIED';
      setTimeout(() => { copyLink.textContent = previous; }, 1800);
    } catch {
      copyLink.textContent = SHARE_URL;
    }
  });

  loadRoster();
  loadHolderCount();
})();
