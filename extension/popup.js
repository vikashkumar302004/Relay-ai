const alerts = document.getElementById('alerts');
chrome.storage.local.get({ relayAlerts: true, relayLastHandoff: null }, ({ relayAlerts, relayLastHandoff }) => {
  alerts.checked = relayAlerts;
  if (!relayLastHandoff) return;
  document.getElementById('last').hidden = false;
  document.getElementById('last-title').textContent = `${relayLastHandoff.sourceName} → ${relayLastHandoff.target}`;
  document.getElementById('last-meta').textContent = `${relayLastHandoff.messageCount || 0} messages · ${new Date(relayLastHandoff.createdAt).toLocaleString()}`;
});
alerts.addEventListener('change', () => chrome.storage.local.set({ relayAlerts: alerts.checked }));
