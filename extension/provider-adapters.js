(function exposeRelayProviderAdapters(root) {
  const ADAPTERS = {
    claude: {
      selectors: [
        '[data-testid="user-message"]',
        '[data-testid*="assistant-message"]',
        '[data-testid^="chat-message"]',
        '.font-claude-response',
        '[class*="font-user-message"]',
        '[data-is-streaming="true"]'
      ],
      role(element, index) {
        const marker = `${element.getAttribute('data-testid') || ''} ${element.className || ''}`;
        if (/user|human/i.test(marker)) return 'user';
        if (/assistant|claude|response/i.test(marker)) return 'assistant';
        return index % 2 ? 'assistant' : 'user';
      }
    },
    chatgpt: {
      selectors: [
        '[data-message-author-role]',
        '[data-testid^="conversation-turn-"]',
        'article[data-testid*="conversation"]',
        '[data-turn-id]',
        '[data-message-id]',
        '[data-message-model-slug]',
        '[class*="conversation-turn"]',
        '[role="main"] article'
      ],
      role(element, index) {
        const explicit = element.getAttribute('data-message-author-role')
          || element.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
        if (explicit) return explicit;
        const marker = `${element.getAttribute('data-testid') || ''} ${element.getAttribute('data-message-model-slug') || ''} ${element.className || ''}`;
        if (/user|human/i.test(marker)) return 'user';
        if (/assistant|model|response/i.test(marker)) return 'assistant';
        const turn = Number(marker.match(/(\d+)$/)?.[1]);
        return Number.isFinite(turn) ? (turn % 2 ? 'assistant' : 'user') : (index % 2 ? 'assistant' : 'user');
      }
    },
    gemini: {
      selectors: [
        'user-query',
        'model-response',
        '.query-content',
        '.response-container-content',
        '[data-test-id*="query"]',
        '[data-test-id*="response"]'
      ],
      role(element, index) {
        const marker = `${element.tagName || ''} ${element.className || ''} ${element.getAttribute('data-test-id') || ''}`;
        if (/user|query/i.test(marker)) return 'user';
        if (/model|response|answer/i.test(marker)) return 'assistant';
        return index % 2 ? 'assistant' : 'user';
      }
    },
    perplexity: {
      selectors: [
        '[data-testid*="query"]',
        '[data-testid*="answer"]',
        '[data-testid*="thread"] .prose',
        'main .prose'
      ],
      role(element, index) {
        const marker = `${element.getAttribute('data-testid') || ''} ${element.className || ''}`;
        if (/query|user/i.test(marker)) return 'user';
        if (/answer|assistant|prose/i.test(marker)) return 'assistant';
        return index % 2 ? 'assistant' : 'user';
      }
    }
  };

  function get(provider) {
    return ADAPTERS[provider] || null;
  }

  const api = { ADAPTERS, get };
  root.RelayProviderAdapters = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
