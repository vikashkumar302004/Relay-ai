const alerts = document.getElementById('alerts');
const budget = document.getElementById('budget');
chrome.storage.local.get({ relayAlerts: true, relayContextBudget: 128000, relayLastHandoff: null }, ({ relayAlerts, relayContextBudget, relayLastHandoff }) => {
  alerts.checked = relayAlerts;
  budget.value = String(relayContextBudget);
  if (!relayLastHandoff) return;
  document.getElementById('last').hidden = false;
  document.getElementById('last-title').textContent = `${relayLastHandoff.sourceName} → ${relayLastHandoff.target}`;
  const saved = relayLastHandoff.stats ? ` · ${relayLastHandoff.stats.savedPercent}% saved` : '';
  document.getElementById('last-meta').textContent = `${relayLastHandoff.messageCount || 0} messages${saved} · ${new Date(relayLastHandoff.createdAt).toLocaleString()}`;
});
alerts.addEventListener('change', () => chrome.storage.local.set({ relayAlerts: alerts.checked }));
budget.addEventListener('change', () => chrome.storage.local.set({ relayContextBudget: Number(budget.value) }));
