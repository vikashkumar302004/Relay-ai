(function exposeRelayCore(root) {
  const PROVIDERS = {
    claude: { name: 'Claude', url: 'https://claude.ai/new' },
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
    perplexity: { name: 'Perplexity', url: 'https://www.perplexity.ai/' }
  };

  const LIMIT_PATTERNS = [
    /usage limit/i,
    /rate limit/i,
    /message limit/i,
    /limit.*reset/i,
    /try again later/i,
    /you('ve| have) reached.*limit/i,
    /too many requests/i
  ];

  function providerFromHost(hostname = '') {
    if (hostname.includes('claude.ai')) return 'claude';
    if (hostname.includes('chatgpt.com')) return 'chatgpt';
    if (hostname.includes('gemini.google.com')) return 'gemini';
    if (hostname.includes('perplexity.ai')) return 'perplexity';
    return null;
  }

  function hasLimitMessage(text = '') {
    return LIMIT_PATTERNS.some((pattern) => pattern.test(text));
  }

  function parseVisibleUsage(text = '') {
    const normalized = text.replace(/\s+/g, ' ');
    const remaining = normalized.match(/(?:usage\s+)?(\d{1,3})%\s+(?:usage\s+)?remaining/i)
      || normalized.match(/remaining\s+(\d{1,3})%/i);
    if (!remaining) return null;
    const reset = normalized.match(/resets?(?:\s+at|\s+in)?\s+(\d{1,2}:\d{2}\s*[ap]m|\d+\s*(?:minutes?|hours?|days?))/i);
    return { remainingPercent: Math.min(100, Number(remaining[1])), usedPercent: Math.max(0, 100 - Number(remaining[1])), resetText: reset ? cleanText(reset[1]) : null };
  }

  function parseClaudeUsage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const normalize = (value, label) => {
      if (!value || !Number.isFinite(value.utilization)) return null;
      const usedPercent = Math.max(0, Math.min(100, value.utilization));
      return { label, usedPercent, remainingPercent: Math.max(0, 100 - usedPercent), resetsAt: typeof value.resets_at === 'string' ? value.resets_at : null };
    };
    const session = normalize(raw.five_hour, '5-hour');
    const weekly = normalize(raw.seven_day, 'Weekly');
    return session || weekly ? { session, weekly } : null;
  }

  function cleanText(value = '') {
    return value.replace(/\s+/g, ' ').trim();
  }

  function estimateTokens(value = '') {
    const text = cleanText(value);
    if (!text) return 0;
    const codeWeight = (text.match(/[{}()[\];=<>]/g) || []).length;
    return Math.max(1, Math.ceil(text.length / (codeWeight > text.length * 0.04 ? 3.35 : 4)));
  }

  function uniqueMessages(messages) {
    const seen = new Set();
    return messages.filter((message) => {
      const text = cleanText(message.text || message);
      if (text.length < 3 || seen.has(text)) return false;
      seen.add(text);
      message.text = text;
      return true;
    });
  }

  function collectSignals(messages, pattern, limit = 6) {
    return messages
      .flatMap((message) => cleanText(message.text).split(/(?<=[.!?])\s+/).map((text) => ({ role: message.role, text })))
      .filter((item) => item.text.length > 8 && pattern.test(item.text))
      .slice(-limit);
  }

  function bulletSection(title, items, fallback) {
    const lines = items.map((item) => `- ${item.text || item}`);
    return [`## ${title}`, ...(lines.length ? lines : [`- ${fallback}`]), ''];
  }

  function buildHandoff({ provider, title, url, messages, maxChars = 14000, contextBudget = 128000 }) {
    const clean = uniqueMessages(messages.map((message, index) => ({
      role: message.role || (index % 2 ? 'assistant' : 'user'),
      text: message.text || String(message)
    })));
    const selected = [];
    let size = 0;
    for (let index = clean.length - 1; index >= 0; index -= 1) {
      const line = `[${clean[index].role.toUpperCase()}]\n${clean[index].text}`;
      if (selected.length && size + line.length > maxChars) break;
      selected.unshift(line);
      size += line.length;
    }
    const userMessages = clean.filter((message) => message.role === 'user');
    const latestUser = userMessages.at(-1)?.text || clean.at(-1)?.text || 'Continue from the latest unfinished task.';
    const completed = collectSignals(clean, /\b(done|completed|finished|fixed|created|built|implemented|added|updated|resolved|working)\b/i);
    const decisions = collectSignals(clean, /\b(decided|choose|chosen|using|must|should|keep|avoid|require|constraint)\b/i);
    const blockers = collectSignals(clean, /\b(error|failed|failing|blocked|issue|problem|bug|cannot|can't|not working)\b/i);
    const nextSteps = collectSignals(clean, /\b(next|todo|remaining|then|after that|need to|should now)\b/i);
    const files = [...new Set(clean.flatMap((message) => message.text.match(/(?:[\w.-]+[\\/])*[\w.-]+\.(?:js|jsx|ts|tsx|json|css|html|md|py|java|cpp|c|h|yml|yaml|toml|docx|pdf)/gi) || []))].slice(-8);
    const capsule = [
      '# Relay Context Capsule',
      `Source: ${PROVIDERS[provider]?.name || provider || 'AI'} · ${title || 'Untitled conversation'}`,
      url ? `Original conversation: ${url}` : '',
      '',
      'Continue this work from the context below. Preserve existing decisions, do not repeat completed work, and begin with the next practical step.',
      '',
      '## Current objective',
      latestUser,
      '',
      ...bulletSection('Completed work', completed, 'No completed work was clearly detected.'),
      ...bulletSection('Important decisions', decisions, 'No explicit decisions were detected.'),
      ...bulletSection('Files and code involved', files, 'No file names were detected in the readable chat.'),
      ...bulletSection('Errors and blockers', blockers, 'No active blocker was clearly detected.'),
      ...bulletSection('Exact next step', nextSteps, latestUser),
      '## Recent conversation',
      selected.join('\n\n') || 'No readable conversation messages were found. Ask the user for the missing context.'
    ].filter(Boolean).join('\n');
    const originalText = clean.map((message) => message.text).join('\n');
    const visibleTokens = estimateTokens(originalText);
    const capsuleTokens = estimateTokens(capsule);
    return {
      capsule,
      stats: {
        visibleTokens,
        capsuleTokens,
        savedTokens: Math.max(0, visibleTokens - capsuleTokens),
        savedPercent: visibleTokens ? Math.max(0, Math.round((1 - capsuleTokens / visibleTokens) * 100)) : 0,
        contextBudget,
        remainingTokens: Math.max(0, contextBudget - visibleTokens),
        usedPercent: Math.min(100, Math.round((visibleTokens / contextBudget) * 100))
      }
    };
  }

  function buildCapsule(options) { return buildHandoff(options).capsule; }

  const api = { PROVIDERS, providerFromHost, hasLimitMessage, parseVisibleUsage, parseClaudeUsage, cleanText, estimateTokens, uniqueMessages, buildHandoff, buildCapsule };
  root.RelayCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
