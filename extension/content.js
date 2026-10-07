(() => {
  const core = globalThis.RelayCore;
  const provider = core.providerFromHost(location.hostname);
  if (!provider || document.getElementById('relay-extension-root')) return;

  const providerConfig = core.PROVIDERS[provider];
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

  function elementRole(element, index) {
    const explicit = element.getAttribute('data-message-author-role');
    if (explicit) return explicit;
    const label = `${element.getAttribute('aria-label') || ''} ${element.className || ''}`;
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
    const selectors = [
      '[data-message-author-role]',
      'main article',
      'main [data-testid*="message"]',
      'main [class*="conversation-turn"]',
      'main [class*="message"]'
    ];
    let nodes = [];
    for (const selector of selectors) {
      const found = [...document.querySelectorAll(selector)].filter(visible);
      if (found.length >= 2) { nodes = found; break; }
    }
    if (!nodes.length) {
      const main = document.querySelector('main');
      if (main) nodes = [...main.querySelectorAll('p')].filter(visible);
    }
    return nodes.slice(-30).map((element, index) => ({ role: elementRole(element, index), text: element.innerText }));
  }

  async function refreshMetrics() {
    const messages = extractMessages();
    const pageText = document.body.innerText;
    const accountUsage = core.parseVisibleUsage(pageText);
    const accountValue = root.querySelector('.relay-account-value');
    const accountNote = root.querySelector('.relay-account-note');
    if (accountUsage) {
      accountValue.textContent = `${accountUsage.remainingPercent}% remaining`;
      accountNote.textContent = accountUsage.resetText ? `Exact visible value · resets ${accountUsage.resetText}` : 'Exact value visible on this provider page.';
      root.querySelector('.relay-account').classList.add('is-exact');
    } else {
      accountValue.textContent = pageText.match(/free plan/i) ? 'Unavailable on this Free-plan page' : 'Not visible on this page';
      accountNote.textContent = 'Open the provider usage page for an exact value.';
      root.querySelector('.relay-account').classList.remove('is-exact');
    }
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
    const candidates = [
      'textarea',
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]'
    ];
    return candidates.map((selector) => [...document.querySelectorAll(selector)]).flat().find(visible);
  }

  async function insertPending() {
    const { relayPendingHandoff } = await chrome.storage.local.get('relayPendingHandoff');
    if (!relayPendingHandoff || relayPendingHandoff.target !== provider) return;
    const composer = findComposer();
    if (!composer) {
      await navigator.clipboard.writeText(relayPendingHandoff.capsule);
      showToast('Composer not found. Context copied—press Ctrl+V.');
      return;
    }
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), 'value')?.set;
      setter?.call(composer, relayPendingHandoff.capsule);
      composer.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, relayPendingHandoff.capsule);
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: relayPendingHandoff.capsule }));
    }
    await chrome.storage.local.remove('relayPendingHandoff');
    ready.hidden = true;
    showToast('Context inserted. Review it, then send.');
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
