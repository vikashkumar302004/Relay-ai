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

  function buildCapsule({ provider, title, url, messages, maxChars = 14000 }) {
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
    return [
      '# Relay Context Capsule',
      `Source: ${PROVIDERS[provider]?.name || provider || 'AI'} · ${title || 'Untitled conversation'}`,
      url ? `Original conversation: ${url}` : '',
      '',
      'Continue this work from the context below. Preserve existing decisions, do not repeat completed work, and begin with the next practical step.',
      '',
      selected.join('\n\n') || 'No readable conversation messages were found. Ask the user for the missing context.'
    ].filter(Boolean).join('\n');
  }

  const api = { PROVIDERS, providerFromHost, hasLimitMessage, cleanText, uniqueMessages, buildCapsule };
  root.RelayCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
