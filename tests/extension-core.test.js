const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');
const adapters = require('../extension/provider-adapters.js');

test('detects supported providers by hostname', () => {
  assert.equal(core.providerFromHost('claude.ai'), 'claude');
  assert.equal(core.providerFromHost('chatgpt.com'), 'chatgpt');
  assert.equal(core.providerFromHost('gemini.google.com'), 'gemini');
  assert.equal(core.providerFromHost('example.com'), null);
});

test('recognizes likely provider limit messages', () => {
  assert.equal(core.hasLimitMessage('You have reached your usage limit'), true);
  assert.equal(core.hasLimitMessage('Everything is working normally'), false);
});

test('reads exact usage only when the provider visibly exposes it', () => {
  assert.deepEqual(core.parseVisibleUsage('5% usage remaining Resets at 8:50 PM'), { remainingPercent: 5, usedPercent: 95, resetText: '8:50 PM' });
  assert.equal(core.parseVisibleUsage('Free plan Upgrade'), null);
});

test('normalizes Claude native usage windows', () => {
  const usage = core.parseClaudeUsage({ five_hour: { utilization: 74.6, resets_at: '2026-10-07T18:30:00Z' }, seven_day: { utilization: 20 } });
  assert.equal(Math.round(usage.session.remainingPercent), 25);
  assert.equal(usage.weekly.remainingPercent, 80);
  assert.equal(core.parseClaudeUsage({}), null);
});

test('estimates tokens and reports context savings', () => {
  assert.equal(core.estimateTokens(''), 0);
  const handoff = core.buildHandoff({
    provider: 'chatgpt', contextBudget: 32000,
    messages: [{ role: 'user', text: 'Build the feature. '.repeat(200) }, { role: 'assistant', text: 'Implementation completed. '.repeat(200) }]
  });
  assert.ok(handoff.stats.visibleTokens > 1000);
  assert.ok(handoff.stats.remainingTokens < 32000);
  assert.ok(handoff.stats.capsuleTokens > 0);
});

test('builds a bounded handoff capsule with recent context', () => {
  const capsule = core.buildCapsule({
    provider: 'claude',
    title: 'Test project',
    url: 'https://claude.ai/chat/example',
    maxChars: 180,
    messages: [
      { role: 'user', text: 'Build a Relay extension.' },
      { role: 'assistant', text: 'The manifest is complete.' },
      { role: 'user', text: 'Now add context switching.' }
    ]
  });
  assert.match(capsule, /Relay Context Capsule/);
  assert.match(capsule, /Now add context switching/);
  assert.ok(capsule.length < 2000);
});

test('keeps provider message adapters separate', () => {
  for (const provider of ['claude', 'chatgpt', 'gemini', 'perplexity']) {
    const adapter = adapters.get(provider);
    assert.ok(adapter);
    assert.ok(adapter.selectors.length >= 3);
    assert.equal(typeof adapter.role, 'function');
  }
});

test('organizes handoff context into useful sections', () => {
  const result = core.buildHandoff({
    provider: 'chatgpt',
    title: 'Relay work',
    url: 'https://chatgpt.com/c/example',
    messages: [
      { role: 'user', text: 'Build the provider adapter in content.js. The current bug is not working on ChatGPT.' },
      { role: 'assistant', text: 'Implemented provider-adapters.js and fixed the selector issue.' },
      { role: 'user', text: 'Next, test the extension and update manifest.json.' }
    ]
  });
  for (const heading of ['Current objective', 'Completed work', 'Important decisions', 'Files and code involved', 'Errors and blockers', 'Exact next step']) {
    assert.match(result.capsule, new RegExp(`## ${heading}`));
  }
});
