const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../extension/core.js');

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
  assert.ok(capsule.length < 700);
});
