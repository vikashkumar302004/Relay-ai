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
    const signal = clean.flatMap((message) => message.text.split(/(?<=[.!?])\s+/).map((text) => ({ role: message.role, text })))
      .filter((item) => /decid|must|should|need|next|error|fail|fix|complete|done|implement|build|require/i.test(item.text))
      .slice(-8);
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
      ...(signal.length ? ['## Important decisions, progress, and blockers', ...signal.map((item) => `- (${item.role}) ${item.text}`), ''] : []),
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

  const api = { PROVIDERS, providerFromHost, hasLimitMessage, cleanText, estimateTokens, uniqueMessages, buildHandoff, buildCapsule };
  root.RelayCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
