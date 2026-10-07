const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { readSessions, getContextPacket, isSessionFile, exportUserData } = require('../sessions');

test('rejects files outside supported session roots', () => {
  assert.equal(isSessionFile(path.join(os.tmpdir(), 'untrusted.jsonl')), false);
  assert.equal(isSessionFile(path.join(os.homedir(), '.codex', 'sessions', '..', 'settings.json')), false);
  assert.equal(isSessionFile(null), false);
});

test('session discovery returns normalized, newest-first records', () => {
  const sessions = readSessions();
  assert.ok(Array.isArray(sessions));
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index];
    assert.ok(session.id);
    assert.ok(['claude', 'codex'].includes(session.tool));
    assert.equal(isSessionFile(session.filePath), true);
    if (index > 0) assert.ok(sessions[index - 1].modifiedAt >= session.modifiedAt);
  }
});

test('context packet is bounded and contains handoff metadata', () => {
  const session = readSessions()[0];
  if (!session) return;
  const packet = getContextPacket(session);
  assert.match(packet, /Relay Context Handoff/);
  assert.match(packet, /Session Info/);
  assert.ok(packet.length < 25000);
});

test('backup export uses a versioned, portable format', () => {
  const backup = exportUserData();
  assert.equal(backup.format, 'relay-backup');
  assert.equal(backup.version, 1);
  assert.ok(backup.exportedAt);
  assert.deepEqual(Object.keys(backup.data).sort(), ['names', 'notes', 'pins', 'tags']);
});
