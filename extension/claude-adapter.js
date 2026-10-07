(() => {
  if (window.__relayClaudeAdapter) return;
  window.__relayClaudeAdapter = true;
  const channel = 'relay-claude-usage-v1';

  function organizationId() {
    const entry = document.cookie.split('; ').find((row) => row.startsWith('lastActiveOrg='));
    return entry ? decodeURIComponent(entry.slice(entry.indexOf('=') + 1)) : null;
  }

  async function readUsage(requestId) {
    try {
      const orgId = organizationId();
      if (!orgId) throw new Error('No active Claude organization');
      const response = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/usage`, { credentials: 'include' });
      if (!response.ok) throw new Error(`Claude usage unavailable (${response.status})`);
      const usage = await response.json();
      window.postMessage({ channel, type: 'response', requestId, ok: true, usage }, location.origin);
    } catch (error) {
      window.postMessage({ channel, type: 'response', requestId, ok: false, error: error.message }, location.origin);
    }
  }

  addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.channel === channel && event.data.type === 'request') readUsage(event.data.requestId);
  });
})();
