(() => {
  const CONTRACT = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
  const TARGET = 25;
  const BLOCKSCOUT = 'https://explorer.arc.io/api/v2';
  const ARC_RPC = 'https://rpc.arc-scan.org';
  const BALANCE_OF_SELECTOR = '0x70a08231';
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

  function validAddress(value) {
    return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
  }

  function validCount(value) {
    const count = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(count) && count >= 0 ? count : null;
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

  async function rpc(method, params, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(ARC_RPC, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(body.error.message || 'Arc RPC error');
      return body.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  function balanceOfData(owner) {
    const encodedOwner = owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    return `${BALANCE_OF_SELECTOR}${encodedOwner}`;
  }

  async function currentBalance(address) {
    const result = await rpc('eth_call', [{ to: CONTRACT, data: balanceOfData(address) }, 'latest']);
    if (!result || result === '0x') return 0n;
    return BigInt(result);
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

  function memberIdentity(member) {
    return member?.displayName || member?.xHandle || shortAddress(member?.address);
  }

  function makeMemberCard(member, index) {
    const card = document.createElement('div');
    card.className = 'founding-member';
    card.dataset.address = member.address.toLowerCase();

    const number = document.createElement('span');
    number.className = 'founding-member-number';
    number.textContent = `FOUNDING ${String(index + 1).padStart(2, '0')}`;

    const identity = document.createElement('strong');
    identity.className = 'founding-member-identity';
    identity.textContent = memberIdentity(member);

    const address = document.createElement('code');
    address.className = 'founding-member-address';
    address.textContent = shortAddress(member.address);
    address.title = member.address;

    const chain = document.createElement('span');
    chain.className = 'founding-chain-badge checking';
    chain.dataset.foundingChain = member.address.toLowerCase();
    chain.textContent = 'RPC CHECK…';

    card.append(number, identity, address, chain);
    return card;
  }

  function makeOpenCard(index) {
    const card = document.createElement('div');
    card.className = 'founding-member founding-slot-open';

    const number = document.createElement('span');
    number.className = 'founding-member-number';
    number.textContent = `FOUNDING ${String(index + 1).padStart(2, '0')}`;

    const identity = document.createElement('strong');
    identity.className = 'founding-member-identity';
    identity.textContent = 'OPEN';

    const detail = document.createElement('span');
    detail.className = 'founding-slot-copy';
    detail.textContent = 'Verified holder spot';

    card.append(number, identity, detail);
    return card;
  }

  function renderRoster(members) {
    const list = byId('foundingRosterList');
    if (!list) return;
    list.replaceChildren();

    for (let index = 0; index < TARGET; index += 1) {
      list.appendChild(members[index] ? makeMemberCard(members[index], index) : makeOpenCard(index));
    }
  }

  async function verifyCurrentRoster(members) {
    if (!members.length) return;

    const checks = await Promise.allSettled(
      members.map(async (member) => ({
        address: member.address.toLowerCase(),
        balance: await currentBalance(member.address)
      }))
    );

    checks.forEach((check, index) => {
      const member = members[index];
      const badge = document.querySelector(`[data-founding-chain="${member.address.toLowerCase()}"]`);
      if (!badge) return;

      if (check.status === 'rejected') {
        badge.className = 'founding-chain-badge warn';
        badge.textContent = 'RPC UNAVAILABLE';
        return;
      }

      if (check.value.balance > 0n) {
        badge.className = 'founding-chain-badge live';
        badge.textContent = 'HOLDING NOW';
      } else {
        badge.className = 'founding-chain-badge historic';
        badge.textContent = 'OG RECORD';
      }
    });
  }

  async function loadRoster() {
    try {
      const response = await fetch(`founding-roster.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
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

      setText('foundingVerifiedCount', verified.toLocaleString());
      setText('foundingOpenSpots', open.toLocaleString());
      setText('foundingBigCount', verified.toLocaleString());
      setText('foundingRosterUpdated', data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'NOT YET');

      const progress = byId('foundingProgressFill');
      if (progress) progress.style.width = `${(verified / TARGET) * 100}%`;

      renderRoster(members);
      verifyCurrentRoster(members).catch((error) => {
        console.warn('Founding 25 live roster verification unavailable:', error);
      });
    } catch (error) {
      setText('foundingVerifiedCount', '—');
      setText('foundingOpenSpots', '—');
      setText('foundingBigCount', '—');
      setText('foundingRosterUpdated', 'UNAVAILABLE');
      renderRoster([]);
      console.warn('Founding 25 roster unavailable:', error);
    }
  }

  const note = document.querySelector('.founding-note');
  if (note) {
    note.textContent = 'The live holder-address count comes from Arc Explorer and can include pools, contracts, project wallets and people who never opted in. Founding 25 entries are separate: each published member must have a recorded positive $EXIT balance verified through direct Arc RPC at the time they are added. The page rechecks current balances live; selling later changes the badge to OG RECORD but does not erase permanent Founding recognition.';
  }

  loadHolderCount();
  loadRoster();
})();
