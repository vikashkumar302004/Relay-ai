const PROVIDER_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  perplexity: 'https://www.perplexity.ai/'
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ relayEnabled: true, relayAlerts: true });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'relay-switch') {
    const targetUrl = PROVIDER_URLS[message.target];
    if (!targetUrl) return;
    const handoff = {
      ...message.handoff,
      target: message.target,
      createdAt: Date.now(),
      sourceTabId: sender.tab?.id || null
    };
    chrome.storage.local.set({ relayPendingHandoff: handoff, relayLastHandoff: handoff }, () => {
      chrome.tabs.create({ url: targetUrl });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'relay-limit-alert') {
    chrome.storage.local.get({ relayAlerts: true }, ({ relayAlerts }) => {
      if (!relayAlerts) return;
      chrome.notifications.create(`relay-limit-${message.provider}`, {
        type: 'basic',
        iconUrl: 'assets/icon.png',
        title: `${message.providerName} may have reached a limit`,
        message: 'Relay can carry this conversation into another AI.'
      });
    });
  }
});
