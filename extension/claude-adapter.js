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
      let lastAssistantAt = null;
      const conversationId = location.pathname.match(/\/chat\/([^/?]+)/)?.[1];
      if (conversationId) {
        try {
          const conversationResponse = await fetch(`/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(conversationId)}?tree=true&rendering_mode=messages&render_all_tools=true`, { credentials: 'include' });
          const conversation = conversationResponse.ok ? await conversationResponse.json() : null;
          const seen = new WeakSet();
          const walk = (value) => {
            if (!value || typeof value !== 'object' || seen.has(value)) return;
            seen.add(value);
            if (value.sender === 'assistant' && typeof value.created_at === 'string' && (!lastAssistantAt || Date.parse(value.created_at) > Date.parse(lastAssistantAt))) lastAssistantAt = value.created_at;
            Object.values(value).forEach(walk);
          };
          walk(conversation);
        } catch {}
      }
      window.postMessage({ channel, type: 'response', requestId, ok: true, usage, lastAssistantAt }, location.origin);
    } catch (error) {
      window.postMessage({ channel, type: 'response', requestId, ok: false, error: error.message }, location.origin);
    }
  }

  addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.channel === channel && event.data.type === 'request') readUsage(event.data.requestId);
  });
})();
