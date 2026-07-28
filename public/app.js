let lastScanUrl = '';
const WALLET = 'TR16mMP3eknhrhH9WRC76EzAr29asLvay7';
const PRICES = { report: 29, priority: 99 };

async function runScan() {
  const input = document.getElementById('urlInput');
  const btn = document.getElementById('scanBtn');
  const url = input.value.trim();
  if (!url) { showToast('Enter a URL to scan'); return; }

  btn.disabled = true;
  btn.querySelector('.btn-text').hidden = true;
  btn.querySelector('.btn-loading').hidden = false;

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Scan failed');

    lastScanUrl = url;
    renderResults(data.preview);
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    showToast(e.message);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').hidden = false;
    btn.querySelector('.btn-loading').hidden = true;
  }
}

function renderResults(p) {
  const pct = p.percentage;
  document.getElementById('scoreNum').textContent = pct;
  const ring = document.getElementById('ringFill');
  ring.style.strokeDashoffset = 327 - (327 * pct / 100);
  ring.style.stroke = pct >= 70 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';

  const grade = document.getElementById('gradeBadge');
  grade.textContent = 'Grade ' + p.grade;
  grade.className = 'grade grade-' + p.grade;

  const titles = {
    A: 'Looking solid!', B: 'Good, minor fixes needed', C: 'Trust gaps detected',
    D: 'Major red flags', F: 'Critical — fix before launch',
  };
  document.getElementById('resultTitle').textContent = titles[p.grade] || 'Results';
  document.getElementById('resultSummary').textContent =
    `${p.passed}/${p.total} trust checks passed for ${p.url}`;

  const issues = document.getElementById('issuesList');
  issues.innerHTML = p.topIssues.map(i =>
    `<div class="issue-item"><span class="icon">✕</span><div><strong>${escapeHtml(i.label)}</strong><br>${escapeHtml(i.detail)}</div></div>`
  ).join('') || '<p style="color:var(--green)">No critical issues found!</p>';
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function selectPlan(plan) {
  if (!lastScanUrl) { showToast('Run a scan first'); return; }
  document.getElementById('orderPlan').value = plan;
  document.getElementById('orderUrl').value = lastScanUrl;
  document.getElementById('payAmount').textContent = PRICES[plan] + ' USDT';
  document.getElementById('payWallet').textContent = WALLET;
  const names = { report: 'Full Trust Report', priority: 'Priority Human Review' };
  document.getElementById('orderSummary').innerHTML =
    `<strong>${names[plan]}</strong> — ${PRICES[plan]} USDT<br>Site: ${escapeHtml(lastScanUrl)}`;
  document.getElementById('checkoutModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('checkoutModal').classList.add('hidden');
}

async function submitOrder(e) {
  e.preventDefault();
  const plan = document.getElementById('orderPlan').value;
  const url = document.getElementById('orderUrl').value;
  const contact = document.getElementById('orderContact').value.trim();
  const txHash = document.getElementById('orderTx').value.trim();

  if (!txHash) {
    showToast('Submit your TX hash after sending USDT');
    return;
  }

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, url, contact, txHash }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order failed');

    if (data.reportUrl) {
      showToast('Payment verified! Opening report...');
      window.open(data.reportUrl, '_blank');
    } else {
      showToast(`Order ${data.order.id} received — ${data.message}`);
    }
    closeModal();
  } catch (e) {
    showToast(e.message);
  }
}

function copyWallet() {
  navigator.clipboard.writeText(WALLET);
  showToast('Wallet copied!');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 4000);
}

function scrollToScan() {
  document.getElementById('scan').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('urlInput').focus();
}

document.getElementById('urlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runScan();
});

document.getElementById('checkoutModal').addEventListener('click', (e) => {
  if (e.target.id === 'checkoutModal') closeModal();
});
