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
