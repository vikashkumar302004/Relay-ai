(() => {
  const core = globalThis.RelayCore;
  const adapter = globalThis.RelayProviderAdapters?.get(core.providerFromHost(location.hostname));
  const provider = core.providerFromHost(location.hostname);
  if (!provider || document.getElementById('relay-extension-root')) return;

  const providerConfig = core.PROVIDERS[provider];
  let claudeUsage = null;
  let claudeCacheUntil = null;
  let claudeUsageRequestedAt = 0;
  let usageAlertLevel = null;

  if (provider === 'claude') {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('claude-adapter.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.channel !== 'relay-claude-usage-v1' || event.data.type !== 'response') return;
      if (event.data.ok) {
        claudeUsage = core.parseClaudeUsage(event.data.usage);
        claudeCacheUntil = event.data.lastAssistantAt ? Date.parse(event.data.lastAssistantAt) + 5 * 60 * 1000 : null;
      }
      renderAccountUsage();
    });
  }
  const root = document.createElement('div');
  root.id = 'relay-extension-root';
  root.innerHTML = `
    <button class="relay-fab" type="button" aria-label="Open Relay"><span>ϟ</span></button>
    <section class="relay-panel" aria-hidden="true">
      <header><div><strong>ϟ Relay</strong><small>${providerConfig.name} connected</small></div><button class="relay-close" aria-label="Close">×</button></header>
      <div class="relay-ready" hidden><b>Newest context is ready</b><p class="relay-ready-source">A handoff from another AI is waiting.</p><button class="relay-primary relay-insert">Insert newest context</button></div>
      <div class="relay-main">
        <p class="relay-kicker">SWITCH WITHOUT STARTING OVER</p>
        <h2>Continue this chat in another AI.</h2>
        <p class="relay-status">Relay reads only the visible conversation when you choose a destination.</p>
        <div class="relay-account"><div><span>${provider === 'claude' ? 'CLAUDE ACCOUNT LIMIT' : 'ACCOUNT LIMIT'}</span><b class="relay-account-value">Checking provider data…</b><button class="relay-refresh-usage" title="Refresh usage">↻</button></div><div class="relay-usage-windows" hidden></div><small class="relay-account-note">Provider limit and chat size are separate.</small></div>
        <div class="relay-meter">
          <div class="relay-meter-head"><span>THIS CHAT · ESTIMATE</span><b class="relay-used">Calculating…</b></div>
          <div class="relay-meter-track"><i></i></div>
          <div class="relay-metrics"><span><b class="relay-remaining">—</b> context room</span><span><b class="relay-saving">—</b> handoff capsule</span></div>
          <small>Estimated from messages Relay can read in this chat—not your Claude account quota.</small>
          <button class="relay-retry-chat" type="button">Retry chat detection</button>
        </div>
        <div class="relay-providers"></div>
        <footer>Local-first · No passwords · Never auto-sends</footer>
      </div>
    </section>
    <div class="relay-toast" role="status"></div>`;
  document.documentElement.appendChild(root);

  const fab = root.querySelector('.relay-fab');
  const panel = root.querySelector('.relay-panel');
  const close = root.querySelector('.relay-close');
  const toast = root.querySelector('.relay-toast');
  const providerList = root.querySelector('.relay-providers');
  const ready = root.querySelector('.relay-ready');
  let limitAlerted = false;
  let latestHandoff = null;
  let pendingHandoffId = null;

  function setOpen(open) {
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    if (open) refreshMetrics();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function formatReset(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : ` · resets ${date.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
  }

  function countdown(value) {
    const milliseconds = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'now';
    const minutes = Math.ceil(milliseconds / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function compactNumber(value) {
    if (!Number.isFinite(value)) return '—';
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
    return value.toLocaleString();
  }

  function requestClaudeUsage() {
    if (provider !== 'claude' || Date.now() - claudeUsageRequestedAt < 30000) return;
    claudeUsageRequestedAt = Date.now();
    window.postMessage({ channel: 'relay-claude-usage-v1', type: 'request', requestId: crypto.randomUUID() }, location.origin);
  }

  function renderAccountUsage(pageText = document.body.innerText) {
    const accountValue = root.querySelector('.relay-account-value');
    const accountNote = root.querySelector('.relay-account-note');
    if (provider === 'claude' && claudeUsage) {
      const parts = [claudeUsage.session, claudeUsage.weekly].filter(Boolean);
      accountValue.textContent = 'Live from Claude';
      const windows = root.querySelector('.relay-usage-windows');
      windows.hidden = false;
      windows.innerHTML = parts.map((item) => `<div class="relay-usage-row"><div><b>${item.label}</b><span>${Math.round(item.remainingPercent)}% left · ${countdown(item.resetsAt)}</span></div><i><em style="width:${item.usedPercent}%"></em></i></div>`).join('');
      const cacheText = claudeCacheUntil && claudeCacheUntil > Date.now() ? ` · cache ${countdown(claudeCacheUntil)}` : '';
      accountNote.textContent = `Claude's signed-in account usage${cacheText}`;
      root.querySelector('.relay-account').classList.add('is-exact');
      const remaining = claudeUsage.session?.remainingPercent;
      const level = remaining <= 0 ? 'limit' : remaining <= 10 ? '10' : remaining <= 25 ? '25' : null;
      if (level && level !== usageAlertLevel) {
        usageAlertLevel = level;
        const message = level === 'limit'
          ? 'Claude limit reached. Choose another AI to continue.'
          : `Claude has ${Math.round(remaining)}% left. Your chat is ready to carry.`;
        root.querySelector('.relay-status').textContent = message;
        fab.classList.add('has-alert');
        showToast(message);
      } else if (!level) {
        usageAlertLevel = null;
      }
      return;
    }
    const visible = core.parseVisibleUsage(pageText);
    if (visible) {
      accountValue.textContent = `${visible.remainingPercent}% remaining`;
      accountNote.textContent = visible.resetText ? `Exact visible value · resets ${visible.resetText}` : 'Exact value visible on this provider page.';
      root.querySelector('.relay-account').classList.add('is-exact');
    } else {
      root.querySelector('.relay-usage-windows').hidden = true;
      accountValue.textContent = provider === 'claude' ? 'Waiting for Claude…' : 'Not available on this page';
      accountNote.textContent = provider === 'claude' ? 'This may take a few seconds. It is unrelated to the current chat.' : 'Relay will not guess a provider limit.';
      root.querySelector('.relay-account').classList.remove('is-exact');
    }
  }

  function elementRole(element, index) {
    if (adapter?.role) return adapter.role(element, index);
    const explicit = element.getAttribute('data-message-author-role');
    if (explicit) return explicit;
    const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-testid') || ''} ${element.tagName || ''} ${element.className || ''}`;
    if (/user|human|query|prompt/i.test(label)) return 'user';
    if (/assistant|claude|answer|response|model/i.test(label)) return 'assistant';
    return index % 2 ? 'assistant' : 'user';
  }

  function visible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function extractMessages() {
    const candidates = (adapter?.selectors || []).flatMap((selector) => [...document.querySelectorAll(selector)]);
    const fallbackSelectors = provider === 'chatgpt'
      ? '[data-message-author-role], [data-turn-id], [data-message-id], [data-message-model-slug], [role="main"] article, main article'
      : '[data-message-author-role], [data-testid^="conversation-turn-"], main article, main [data-testid*="message"]';
    const generic = candidates.length ? candidates : [...document.querySelectorAll(fallbackSelectors)];
    const ordered = [...new Set(generic)]
      .filter((element) => !element.closest('#relay-extension-root') && visible(element))
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const messages = ordered.slice(-80).map((element, index) => ({ role: elementRole(element, index), text: element.innerText }))
      .filter((message) => core.cleanText(message.text).length > 2);
    return core.uniqueMessages(messages);
  }

  async function refreshMetrics() {
    const messages = extractMessages();
    const pageText = document.body.innerText;
    requestClaudeUsage();
    renderAccountUsage(pageText);
    const { relayContextBudget = 128000 } = await chrome.storage.local.get('relayContextBudget');
    latestHandoff = core.buildHandoff({ provider, title: document.title, url: location.href, messages, contextBudget: relayContextBudget });
    const { stats } = latestHandoff;
    const hasConversation = messages.some((message) => core.cleanText(message.text).length > 2);
    root.querySelector('.relay-used').textContent = hasConversation ? `~${stats.visibleTokens.toLocaleString()} tokens · ${stats.usedPercent}% of room` : 'Messages not detected';
    root.querySelector('.relay-remaining').textContent = hasConversation ? `~${compactNumber(stats.remainingTokens)}` : '—';
    root.querySelector('.relay-saving').textContent = hasConversation ? `~${compactNumber(stats.capsuleTokens)} tokens` : '—';
    root.querySelector('.relay-meter-track i').style.width = hasConversation ? `${Math.max(2, stats.usedPercent)}%` : '0%';
    providerList.querySelectorAll('.relay-provider').forEach((button) => { button.disabled = !hasConversation; button.querySelector('small').textContent = hasConversation ? `~${stats.capsuleTokens.toLocaleString()} estimated tokens to carry →` : 'Messages not detected—retry'; });
    root.querySelector('.relay-meter>small').textContent = hasConversation
      ? 'Estimated locally from readable messages—not your provider account quota.'
      : `Messages detect nahi hue—chat load hone do, then tap retry. Adapter: ${providerConfig.name}.`;
  }

  async function createHandoff(target) {
    const messages = extractMessages();
    if (!messages.some((message) => core.cleanText(message.text).length > 2)) { showToast('Start a conversation before switching AI.'); return; }
    const { relayContextBudget = 128000 } = await chrome.storage.local.get('relayContextBudget');
    const handoff = core.buildHandoff({ provider, title: document.title, url: location.href, messages, contextBudget: relayContextBudget });
    chrome.runtime.sendMessage({
      type: 'relay-switch',
      target,
      handoff: { capsule: handoff.capsule, stats: handoff.stats, source: provider, sourceName: providerConfig.name, sourceTitle: document.title, sourceUrl: location.href, messageCount: messages.length }
    });
    showToast(`Opening ${core.PROVIDERS[target].name}…`);
  }

  Object.entries(core.PROVIDERS).filter(([key]) => key !== provider).forEach(([key, item]) => {
    const button = document.createElement('button');
    button.className = 'relay-provider';
    button.innerHTML = `<span>${item.name.slice(0, 2).toUpperCase()}</span><div><b>${item.name}</b><small>Carry current context →</small></div>`;
    button.addEventListener('click', () => createHandoff(key));
    providerList.appendChild(button);
  });

  function findComposer() {
    const byProvider = {
      chatgpt: ['#prompt-textarea', '[contenteditable="true"][data-virtualkeyboard="true"]'],
      claude: ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]'],
      gemini: ['rich-textarea [contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
      perplexity: ['textarea[placeholder]', '[contenteditable="true"][role="textbox"]']
    };
    const candidates = [...(byProvider[provider] || []), 'textarea', '[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'];
    return candidates.map((selector) => [...document.querySelectorAll(selector)]).flat().find(visible);
  }

  async function insertPending() {
    const { relayPendingHandoff } = await chrome.storage.local.get('relayPendingHandoff');
    if (!relayPendingHandoff || relayPendingHandoff.target !== provider) return;
    await navigator.clipboard.writeText(relayPendingHandoff.capsule).catch(() => {});
    const composer = findComposer();
    if (!composer) {
      showToast('Composer not found. Context copied—press Ctrl+V.');
      await chrome.storage.local.remove('relayPendingHandoff');
      return;
    }
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), 'value')?.set;
      setter?.call(composer, relayPendingHandoff.capsule);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const inserted = document.execCommand('insertText', false, relayPendingHandoff.capsule);
      if (!inserted) composer.textContent = relayPendingHandoff.capsule;
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: relayPendingHandoff.capsule }));
    }
    const insertedText = composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement ? composer.value : composer.innerText;
    await chrome.storage.local.remove('relayPendingHandoff');
    ready.hidden = true;
    showToast(insertedText.includes('Relay Context Capsule') ? 'Context inserted. Review it, then send.' : 'Context copied—press Ctrl+V in the message box.');
  }

  async function checkPending() {
    const { relayPendingHandoff } = await chrome.storage.local.get('relayPendingHandoff');
    if (relayPendingHandoff?.target === provider && Date.now() - relayPendingHandoff.createdAt < 30 * 60 * 1000) {
      pendingHandoffId = relayPendingHandoff.id;
      ready.hidden = false;
      ready.querySelector('.relay-ready-source').textContent = `${relayPendingHandoff.sourceName}: ${relayPendingHandoff.sourceTitle || 'latest chat'} · ${relayPendingHandoff.messageCount || 0} messages`;
      setOpen(true);
      fab.classList.add('has-context');
    } else {
      pendingHandoffId = null;
      ready.hidden = true;
      fab.classList.remove('has-context');
    }
  }

  function detectLimit() {
    if (limitAlerted) return;
    const text = document.body.innerText.slice(-12000);
    if (!core.hasLimitMessage(text)) return;
    limitAlerted = true;
    fab.classList.add('has-alert');
    setOpen(true);
    root.querySelector('.relay-status').textContent = `${providerConfig.name} may have reached a limit. Choose another AI to continue.`;
    chrome.runtime.sendMessage({ type: 'relay-limit-alert', provider, providerName: providerConfig.name });
  }

  let limitTimer;
  let metricsTimer;
  let currentUrl = location.href;

  function scheduleMetrics(delay = 450) {
    clearTimeout(metricsTimer);
    metricsTimer = setTimeout(() => {
      if (panel.classList.contains('is-open')) refreshMetrics();
    }, delay);
  }

  function handleRouteChange() {
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    limitAlerted = false;
    latestHandoff = null;
    refreshMetrics();
    [350, 1000, 2400].forEach((delay) => setTimeout(refreshMetrics, delay));
  }

  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function relayHistoryChange(...args) {
      const result = original.apply(this, args);
      queueMicrotask(handleRouteChange);
      return result;
    };
  });
  addEventListener('popstate', () => setTimeout(handleRouteChange));
  function scheduleLimitCheck() {
    clearTimeout(limitTimer);
    limitTimer = setTimeout(detectLimit, 650);
  }

  fab.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  close.addEventListener('click', () => setOpen(false));
  root.querySelector('.relay-insert').addEventListener('click', insertPending);
  root.querySelector('.relay-refresh-usage').addEventListener('click', () => { claudeUsageRequestedAt = 0; requestClaudeUsage(); showToast('Refreshing usage…'); });
  root.querySelector('.relay-retry-chat').addEventListener('click', () => {
    refreshMetrics();
    [500, 1400].forEach((delay) => setTimeout(refreshMetrics, delay));
    showToast('Checking this chat again…');
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.relayPendingHandoff) return;
    const next = changes.relayPendingHandoff.newValue;
    if (!next || next.id !== pendingHandoffId) checkPending();
  });
  checkPending();
  refreshMetrics();
  setInterval(() => {
    handleRouteChange();
    if (panel.classList.contains('is-open')) { renderAccountUsage(); requestClaudeUsage(); refreshMetrics(); }
  }, 30000);
  setInterval(handleRouteChange, 750);
  detectLimit();
  new MutationObserver((mutations) => {
    if (mutations.every((mutation) => mutation.target === root || mutation.target.closest?.('#relay-extension-root'))) return;
    handleRouteChange();
    scheduleLimitCheck();
    scheduleMetrics();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
