const CONTRACT = '0x1b556933D64AE9bb32044711C5393B2E5663d185';

const copyButton = document.getElementById('copyContract');
const toast = document.getElementById('toast');

if (copyButton) {
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT);
      copyButton.textContent = 'COPIED';
      toast?.classList.add('show');
      setTimeout(() => {
        copyButton.textContent = 'COPY';
        toast?.classList.remove('show');
      }, 1600);
    } catch {
      const input = document.createElement('textarea');
      input.value = CONTRACT;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      copyButton.textContent = 'COPIED';
      setTimeout(() => (copyButton.textContent = 'COPY'), 1600);
    }
  });
}

function mountFounding25() {
  if (document.getElementById('founding')) return;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'founding.css';
  document.head.appendChild(stylesheet);

  const community = document.getElementById('community');
  if (!community) return;

  const section = document.createElement('section');
  section.className = 'section founding-section';
  section.id = 'founding';
  section.innerHTML = `
    <div class="section-shell">
      <div class="section-kicker reveal">05 // THE FOUNDING 25</div>
      <div class="founding-heading reveal">
        <h2>25 REAL PEOPLE.<br /><span>NO FAKE TRACTION.</span></h2>
        <p class="founding-intro">$EXIT is looking for its first 25 genuine community holders. No wallet splitting, no fake volume, no paid engagement and no promise of profit. The goal is simple: find the first people who actually want to be here while the project is still tiny.</p>
      </div>

      <div class="founding-grid reveal">
        <div class="founding-progress-panel">
          <span class="founding-panel-label">VERIFIED FOUNDING MEMBERS</span>
          <div class="founding-count"><strong id="foundingBigCount">—</strong><span>/ 25</span></div>
          <p class="founding-count-copy">Recognition is opt-in and manually verified. The live holder count below is a separate onchain metric.</p>
          <div class="founding-progress" aria-label="Founding 25 progress"><span id="foundingProgressFill"></span></div>

          <div class="founding-live-grid">
            <div><span>Verified founders</span><strong id="foundingVerifiedCount">—</strong></div>
            <div><span>Open spots</span><strong id="foundingOpenSpots">—</strong></div>
            <div><span>Roster updated</span><strong id="foundingRosterUpdated">—</strong></div>
            <div><span>Onchain holder addresses</span><strong id="foundingHolderCount">—</strong></div>
            <div><span>Holder read</span><strong id="foundingHolderStatus" class="warn">LOADING</strong></div>
            <div><span>Holder source</span><strong id="foundingHolderSource">Arc Explorer</strong></div>
          </div>
        </div>

        <div class="founding-rules-panel">
          <span class="founding-panel-label">HOW IT WORKS</span>
          <ul class="founding-rules">
            <li><strong>Hold a nonzero $EXIT balance</strong> in an external wallet and opt in to recognition.</li>
            <li><strong>One person, one Founding spot.</strong> Wallet splitting does not create extra spots.</li>
            <li><strong>Pool and contract addresses are excluded</strong> from the manually verified Founding 25 roster.</li>
            <li><strong>No minimum purchase is required.</strong> There is no prize, guaranteed value, promised return or paid ranking for joining.</li>
            <li><strong>Public recognition is optional.</strong> Only the wallet or identity you choose to make public is displayed.</li>
          </ul>
          <div class="founding-actions">
            <a class="button button-primary" href="https://arcpad.meme/token/0x1b556933D64AE9bb32044711C5393B2E5663d185" target="_blank" rel="noopener noreferrer">View $EXIT on ArcPad ↗</a>
            <a class="button button-ghost" href="https://x.com/EXITARC" target="_blank" rel="noopener noreferrer">Join @EXITARC ↗</a>
          </div>
        </div>
      </div>

      <div class="founding-roster reveal">
        <div class="founding-roster-head"><span>PUBLIC FOUNDING 25 ROSTER</span><span>OPT-IN ONLY</span></div>
        <div id="foundingRosterList" class="founding-roster-list">
          <div class="founding-roster-empty">Loading verified roster…</div>
        </div>
      </div>

      <p class="founding-note reveal">The Arc Explorer holder count can include contracts, pools and other non-person addresses, so it is not used as the Founding 25 membership count. Founding status is non-financial community recognition only. $EXIT remains a highly volatile memecoin.</p>
    </div>`;

  community.before(section);

  const communityKicker = community.querySelector('.section-kicker');
  if (communityKicker) communityKicker.textContent = '06 // COMMUNITY';

  const nav = document.querySelector('.nav');
  const communityLink = nav?.querySelector('a[href="#community"]');
  if (nav && communityLink && !nav.querySelector('a[href="#founding"]')) {
    const foundingLink = document.createElement('a');
    foundingLink.href = '#founding';
    foundingLink.textContent = 'Founding 25';
    nav.insertBefore(foundingLink, communityLink);
  }

  const foundingScript = document.createElement('script');
  foundingScript.src = 'founding.js';
  foundingScript.dataset.exitFounding25 = 'true';
  document.body.appendChild(foundingScript);
}

mountFounding25();

const observer = new IntersectionObserver(
  entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  }),
  { threshold: 0.12 }
);

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
