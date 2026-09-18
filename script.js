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

function mountFoundingCampaignLink() {
  const actions = document.querySelector('.founding-actions');
  if (!actions || actions.querySelector('[data-founding-campaign-link]')) return;

  const link = document.createElement('a');
  link.className = 'button button-ghost';
  link.href = 'founding/';
  link.dataset.foundingCampaignLink = 'true';
  link.textContent = 'SHARE FOUNDING 25 ↗';
  actions.appendChild(link);
}

mountFoundingCampaignLink();

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
