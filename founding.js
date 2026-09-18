(() => {
  const CONTRACT = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
  const TARGET = 25;
  const BLOCKSCOUT = 'https://explorer.arc.io/api/v2';
  const ARC_RPC = 'https://rpc.arc-scan.org';
  const ARC_CHAIN_ID = 5042;
  const BALANCE_OF_SELECTOR = '0x70a08231';
  const DECIMALS_SELECTOR = '0x313ce567';
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

  async function tokenDecimals() {
    try {
      const result = await rpc('eth_call', [{ to: CONTRACT, data: DECIMALS_SELECTOR }, 'latest']);
      const decimals = Number(BigInt(result || '0x0'));
      return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : 18;
    } catch {
      return 18;
    }
  }

  function formatTokenBalance(value, decimals) {
    const places = Math.min(Math.max(Number(decimals) || 0, 0), 36);
    if (!places) return value.toString();
    const base = 10n ** BigInt(places);
    const whole = value / base;
    const fraction = (value % base).toString().padStart(places, '0').slice(0, 6).replace(/0+$/, '');
    const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction ? `${wholeText}.${fraction}` : wholeText;
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

  function setEligibilityResult(type, title, detail) {
    const result = byId('foundingEligibilityResult');
    const titleNode = byId('foundingEligibilityTitle');
    const detailNode = byId('foundingEligibilityDetail');
    if (!result || !titleNode || !detailNode) return;
    result.hidden = false;
    result.className = `founding-eligibility-result ${type}`;
    titleNode.textContent = title;
    detailNode.textContent = detail;
  }

  function claimMessage(address) {
    return [
      'Founding 25 claim for $EXIT on Arc',
      `Wallet: ${address}`,
      'Public name / X handle: [your choice]',
      'I opt in to public Founding 25 recognition if this wallet and identity pass verification.'
    ].join('\n');
  }

  function mountEligibilityChecker() {
    const grid = document.querySelector('.founding-grid');
    if (!grid || byId('foundingEligibility')) return;

    const panel = document.createElement('section');
    panel.className = 'founding-eligibility';
    panel.id = 'foundingEligibility';
    panel.setAttribute('aria-label', 'Check Founding 25 eligibility');
    panel.innerHTML = `
      <div class="founding-eligibility-head">
        <div>
          <span class="founding-panel-label">READ-ONLY ARC CHECK</span>
          <h3>CHECK YOUR WALLET</h3>
        </div>
        <p>Paste a public Arc address. The site reads the $EXIT balance directly from Arc RPC. No wallet connection, approval, signature or transaction is requested.</p>
      </div>
      <form class="founding-eligibility-form" id="foundingEligibilityForm">
        <label class="sr-only" for="foundingWalletAddress">Arc wallet address</label>
        <input class="founding-eligibility-input" id="foundingWalletAddress" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="0x… Arc wallet address" aria-describedby="foundingEligibilityPrivacy" />
        <button class="button button-primary" id="foundingEligibilityButton" type="submit">VERIFY ON ARC</button>
      </form>
      <div class="founding-eligibility-result checking" id="foundingEligibilityResult" role="status" aria-live="polite" hidden>
        <strong id="foundingEligibilityTitle"></strong>
        <span id="foundingEligibilityDetail"></span>
      </div>
      <div class="founding-claim-actions" id="foundingClaimActions" hidden>
        <button class="button button-primary" id="copyFoundingClaim" type="button">COPY CLAIM MESSAGE</button>
        <a class="button button-ghost" href="https://x.com/EXITARC" target="_blank" rel="noopener noreferrer">OPEN @EXITARC ↗</a>
      </div>
      <p class="founding-eligibility-footnote" id="foundingEligibilityPrivacy">This check does not reserve a spot. Founding membership still requires opt-in, identity review, one-person/one-spot review and an open roster position.</p>`;

    grid.after(panel);

    const form = byId('foundingEligibilityForm');
    const input = byId('foundingWalletAddress');
    const button = byId('foundingEligibilityButton');
    const actions = byId('foundingClaimActions');
    const copy = byId('copyFoundingClaim');
    let claimAddress = null;

    copy?.addEventListener('click', async () => {
      if (!claimAddress) return;
      try {
        await navigator.clipboard.writeText(claimMessage(claimAddress));
        const previous = copy.textContent;
        copy.textContent = 'CLAIM MESSAGE COPIED';
        setTimeout(() => { copy.textContent = previous; }, 1800);
      } catch {
        setEligibilityResult('manual', 'COPY FAILED', 'Your balance check is unchanged. Copy the wallet address manually and send it with your preferred public name or X handle to @EXITARC.');
      }
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const address = String(input?.value || '').trim();
      claimAddress = null;
      if (actions) actions.hidden = true;

      if (!validAddress(address)) {
        setEligibilityResult('ineligible', 'INVALID ADDRESS', 'Enter a 42-character 0x Arc address. Nothing has been sent or signed.');
        return;
      }

      const existing = document.querySelector(`.founding-member[data-address="${address.toLowerCase()}"]`);
      if (existing) {
        const label = existing.querySelector('.founding-member-number')?.textContent || 'FOUNDING MEMBER';
        setEligibilityResult('eligible', 'ALREADY ON THE ROSTER', `${label} is already tied to ${shortAddress(address)}.`);
        existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (button) {
        button.disabled = true;
        button.textContent = 'READING ARC…';
      }
      setEligibilityResult('checking', 'READING ARC', `Checking ${shortAddress(address)} directly against the $EXIT contract.`);

      try {
        const chainHex = await rpc('eth_chainId', []);
        const chainId = Number.parseInt(chainHex, 16);
        if (chainId !== ARC_CHAIN_ID) throw new Error(`Unexpected Arc RPC chain ID: ${chainId}`);

        const [balance, code, decimals] = await Promise.all([
          currentBalance(address),
          rpc('eth_getCode', [address, 'latest']),
          tokenDecimals()
        ]);

        if (balance <= 0n) {
          setEligibilityResult('ineligible', 'NO $EXIT BALANCE FOUND', `${shortAddress(address)} currently has a zero $EXIT balance on Arc. No Founding claim was created.`);
          return;
        }

        claimAddress = address;
        if (actions) actions.hidden = false;
        const balanceText = formatTokenBalance(balance, decimals);
        const open = validCount(byId('foundingOpenSpots')?.textContent);
        const spotText = open === 0
          ? ' The public roster currently shows no open spots.'
          : open != null
            ? ` The public roster currently shows ${open} open spot${open === 1 ? '' : 's'}.`
            : ' Roster availability is checked separately.';

        if (code && code !== '0x' && code !== '0x0') {
          setEligibilityResult('manual', 'BALANCE VERIFIED · MANUAL REVIEW', `${shortAddress(address)} holds ${balanceText} $EXIT, but the address contains contract code. Smart wallets can be legitimate, but pools, routers, protocol and project-controlled addresses do not qualify.${spotText}`);
        } else {
          setEligibilityResult('eligible', 'BALANCE VERIFIED', `${shortAddress(address)} holds ${balanceText} $EXIT on Arc and can request Founding 25 review.${spotText}`);
        }
      } catch (error) {
        setEligibilityResult('manual', 'ARC READ UNAVAILABLE', 'The read-only RPC check could not complete. No wallet connection or transaction was attempted. Try again later or contact @EXITARC for manual verification.');
        console.warn('Founding 25 eligibility check failed:', error);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'VERIFY ON ARC';
        }
      }
    });
  }

  const note = document.querySelector('.founding-note');
  if (note) {
    note.textContent = 'The live holder-address count comes from Arc Explorer and can include pools, contracts, project wallets and people who never opted in. Founding 25 entries are separate: each published member must have a recorded positive $EXIT balance verified through direct Arc RPC at the time they are added. The page rechecks current balances live; selling later changes the badge to OG RECORD but does not erase permanent Founding recognition.';
  }

  mountEligibilityChecker();
  loadHolderCount();
  loadRoster();
})();
