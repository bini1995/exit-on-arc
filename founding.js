(() => {
  const CONTRACT = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
  const TARGET = 25;
  const BLOCKSCOUT = 'https://explorer.arc.io/api/v2';
  const byId = (id) => document.getElementById(id);

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = value;
  }

  function shortAddress(value) {
    const address = String(value || '');
    if (address.length < 14) return address || '—';
    return `${address.slice(0, 8)}…${address.slice(-6)}`;
  }

  function validCount(value) {
    const count = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(count) && count >= 0 ? count : null;
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

  async function readHolderCount() {
    const countersUrl = `${BLOCKSCOUT}/tokens/${CONTRACT}/counters`;
    try {
      const counters = await fetchJson(countersUrl);
      const count = validCount(
        counters?.token_holders_count ??
        counters?.holders_count ??
        counters?.holders
      );
      if (count != null) return { count, source: 'Arc Explorer' };
    } catch (error) {
      console.warn('Founding 25 holder counter: counters endpoint unavailable', error);
    }

    const tokenUrl = `${BLOCKSCOUT}/tokens/${CONTRACT}`;
    const token = await fetchJson(tokenUrl);
    const count = validCount(token?.holders ?? token?.holders_count ?? token?.token_holders_count);
    if (count == null) throw new Error('Holder count missing from explorer response');
    return { count, source: 'Arc Explorer' };
  }

  async function loadHolderCount() {
    const status = byId('foundingHolderStatus');
    if (status) {
      status.textContent = 'READING CHAIN';
      status.className = 'warn';
    }

    try {
      const result = await readHolderCount();
      setText('foundingHolderCount', result.count.toLocaleString());
      setText('foundingHolderSource', result.source);
      if (status) {
        status.textContent = 'LIVE';
        status.className = 'live';
      }
    } catch (error) {
      setText('foundingHolderCount', '—');
      setText('foundingHolderSource', 'Arc Explorer');
      if (status) {
        status.textContent = 'READ UNAVAILABLE';
        status.className = 'warn';
      }
      console.warn('Founding 25 holder counter unavailable:', error);
    }
  }

  function renderRoster(members) {
    const list = byId('foundingRosterList');
    if (!list) return;
    list.replaceChildren();

    if (!members.length) {
      const empty = document.createElement('div');
      empty.className = 'founding-roster-empty';
      empty.textContent = 'No wallets have opted into public Founding 25 recognition yet. Onchain holder count and verified Founding 25 membership are intentionally kept separate.';
      list.appendChild(empty);
      return;
    }

    members.slice(0, TARGET).forEach((member, index) => {
      const card = document.createElement('div');
      card.className = 'founding-member';

      const number = document.createElement('span');
      number.textContent = `FOUNDING ${String(index + 1).padStart(2, '0')}`;

      const identity = document.createElement('strong');
      identity.textContent = member?.displayName || member?.xHandle || shortAddress(member?.address);
      identity.title = member?.address || '';

      card.append(number, identity);
      list.appendChild(card);
    });
  }

  async function loadRoster() {
    try {
      const data = await fetch(`founding-roster.json?v=${Date.now()}`, { cache: 'no-store' }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      const members = Array.isArray(data?.members) ? data.members.filter((member) => member?.address) : [];
      const verified = Math.min(members.length, TARGET);
      const open = Math.max(0, TARGET - verified);

      setText('foundingVerifiedCount', verified.toLocaleString());
      setText('foundingOpenSpots', open.toLocaleString());
      setText('foundingBigCount', verified.toLocaleString());
      setText('foundingRosterUpdated', data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'NOT YET');

      const progress = byId('foundingProgressFill');
      if (progress) progress.style.width = `${(verified / TARGET) * 100}%`;

      renderRoster(members);
    } catch (error) {
      setText('foundingVerifiedCount', '—');
      setText('foundingOpenSpots', '—');
      setText('foundingBigCount', '—');
      setText('foundingRosterUpdated', 'UNAVAILABLE');
      renderRoster([]);
      console.warn('Founding 25 roster unavailable:', error);
    }
  }

  loadHolderCount();
  loadRoster();
})();
