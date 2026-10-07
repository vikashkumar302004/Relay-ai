(() => {
  const core = globalThis.RelayCore;
  const provider = core.providerFromHost(location.hostname);
  if (!provider || document.getElementById('relay-extension-root')) return;

  const providerConfig = core.PROVIDERS[provider];
  let claudeUsage = null;
  let claudeUsageRequestedAt = 0;

  if (provider === 'claude') {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('claude-adapter.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data?.channel !== 'relay-claude-usage-v1' || event.data.type !== 'response') return;
      if (event.data.ok) claudeUsage = core.parseClaudeUsage(event.data.usage);
      renderAccountUsage();
    });
  }
  const root = document.createElement('div');
  root.id = 'relay-extension-root';
  root.innerHTML = `
    <button class="relay-fab" type="button" aria-label="Open Relay"><span>ϟ</span></button>
    <section class="relay-panel" aria-hidden="true">
      <header><div><strong>ϟ Relay</strong><small>${providerConfig.name} connected</small></div><button class="relay-close" aria-label="Close">×</button></header>
      <div class="relay-ready" hidden><b>Context is ready</b><p>A handoff from another AI is waiting.</p><button class="relay-primary relay-insert">Insert into this chat</button></div>
      <div class="relay-main">
        <p class="relay-kicker">SWITCH WITHOUT STARTING OVER</p>
        <h2>Continue this chat in another AI.</h2>
        <p class="relay-status">Relay reads only the visible conversation when you choose a destination.</p>
        <div class="relay-account"><div><span>ACCOUNT USAGE</span><b class="relay-account-value">Checking visible provider data…</b></div><small class="relay-account-note">Relay never guesses account quota.</small></div>
        <div class="relay-meter">
          <div class="relay-meter-head"><span>VISIBLE CONTEXT</span><b class="relay-used">Calculating…</b></div>
          <div class="relay-meter-track"><i></i></div>
          <div class="relay-metrics"><span><b class="relay-remaining">—</b> estimated remaining</span><span><b class="relay-saving">—</b> capsule saving</span></div>
          <small>Visible-text estimate—not your provider account quota.</small>
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
      accountValue.textContent = parts.map((item) => `${item.label}: ${Math.round(item.remainingPercent)}% left`).join(' · ');
      accountNote.textContent = parts.map((item) => `${item.label}${formatReset(item.resetsAt)}`).join(' | ');
      root.querySelector('.relay-account').classList.add('is-exact');
      return;
    }
    const visible = core.parseVisibleUsage(pageText);
    if (visible) {
      accountValue.textContent = `${visible.remainingPercent}% remaining`;
      accountNote.textContent = visible.resetText ? `Exact visible value · resets ${visible.resetText}` : 'Exact value visible on this provider page.';
      root.querySelector('.relay-account').classList.add('is-exact');
    } else {
      accountValue.textContent = provider === 'claude' ? 'Syncing Claude usage…' : 'Not visible on this page';
      accountNote.textContent = provider === 'claude' ? 'Reading your signed-in Claude usage locally.' : 'Open the provider usage page for an exact value.';
      root.querySelector('.relay-account').classList.remove('is-exact');
    }
  }

  function elementRole(element, index) {
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
    const providerSelectors = {
      chatgpt: ['main [data-message-author-role]', 'main article[data-testid^="conversation-turn-"]'],
      claude: ['main [data-testid="user-message"]', 'main [data-testid*="assistant"]', 'main .font-claude-response', 'main [class*="font-user-message"]'],
      gemini: ['main user-query', 'main model-response', 'main .query-content', 'main .response-container-content'],
      perplexity: ['main [data-testid*="query"]', 'main [data-testid*="answer"]', 'main .prose']
    };
    const candidates = (providerSelectors[provider] || []).flatMap((selector) => [...document.querySelectorAll(selector)]);
    const generic = candidates.length ? candidates : [...document.querySelectorAll('main [data-message-author-role], main article, main [data-testid*="message"]')];
    const ordered = [...new Set(generic)]
      .filter((element) => !element.closest('#relay-extension-root') && visible(element))
      .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return ordered.slice(-40).map((element, index) => ({ role: elementRole(element, index), text: element.innerText }))
      .filter((message) => core.cleanText(message.text).length > 2);
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
    root.querySelector('.relay-used').textContent = hasConversation ? `~${stats.visibleTokens.toLocaleString()} tokens · ${stats.usedPercent}%` : 'No conversation yet';
    root.querySelector('.relay-remaining').textContent = hasConversation ? `~${stats.remainingTokens.toLocaleString()}` : '—';
    root.querySelector('.relay-saving').textContent = hasConversation ? `${stats.savedPercent}%` : '—';
    root.querySelector('.relay-meter-track i').style.width = hasConversation ? `${Math.max(2, stats.usedPercent)}%` : '0%';
    providerList.querySelectorAll('.relay-provider').forEach((button) => { button.disabled = !hasConversation; button.querySelector('small').textContent = hasConversation ? `~${stats.capsuleTokens.toLocaleString()} tokens to carry →` : 'Start a conversation first'; });
  }

  async function createHandoff(target) {
    const messages = extractMessages();
    if (!messages.some((message) => core.cleanText(message.text).length > 2)) { showToast('Start a conversation before switching AI.'); return; }
    const { relayContextBudget = 128000 } = await chrome.storage.local.get('relayContextBudget');
    const handoff = core.buildHandoff({ provider, title: document.title, url: location.href, messages, contextBudget: relayContextBudget });
    chrome.runtime.sendMessage({
      type: 'relay-switch',
      target,
      handoff: { capsule: handoff.capsule, stats: handoff.stats, source: provider, sourceName: providerConfig.name, messageCount: messages.length }
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
      ready.hidden = false;
      setOpen(true);
      fab.classList.add('has-context');
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
  function scheduleLimitCheck() {
    clearTimeout(limitTimer);
    limitTimer = setTimeout(detectLimit, 650);
  }

  fab.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  close.addEventListener('click', () => setOpen(false));
  root.querySelector('.relay-insert').addEventListener('click', insertPending);
  checkPending();
  refreshMetrics();
  detectLimit();
  new MutationObserver(scheduleLimitCheck).observe(document.body, { childList: true, subtree: true });
})();
