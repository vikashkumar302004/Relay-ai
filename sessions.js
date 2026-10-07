/**
 * sessions.js — Relay
 * Reads and parses Claude Code & Codex session files.
 * Generates context packets for seamless AI switching.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude', 'projects');
const CODEX_DIR = path.join(HOME, '.codex', 'sessions');
const NAMES_FILE = path.join(HOME, '.relay', 'names.json');
const NOTES_FILE = path.join(HOME, '.relay', 'notes.json');
const TAGS_FILE = path.join(HOME, '.relay', 'tags.json');
const PINS_FILE = path.join(HOME, '.relay', 'pins.json');

function findJsonlFiles(root) {
  const found = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(fullPath);
    }
  };
  walk(root);
  return found;
}

// ─── Ensure Relay data dir exists ───────────────────────────────────────────
function ensureRelayDir() {
  const dir = path.join(HOME, '.relay');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Load user data (names, notes, tags) ────────────────────────────────────
function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {}
  return {};
}

function saveJSON(filePath, data) {
  ensureRelayDir();
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  }
}

function isInside(root, candidate) {
  if (typeof candidate !== 'string') return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isSessionFile(filePath) {
  return typeof filePath === 'string' && filePath.endsWith('.jsonl') &&
    (isInside(CLAUDE_DIR, filePath) || isInside(CODEX_DIR, filePath)) && fs.existsSync(filePath);
}

// ─── Main: Read all sessions ─────────────────────────────────────────────────
function readSessions() {
  const names = loadJSON(NAMES_FILE);
  const notes = loadJSON(NOTES_FILE);
  const tags = loadJSON(TAGS_FILE);
  const pins = loadJSON(PINS_FILE);
  const sessions = [];

  // Claude Code sessions
  if (fs.existsSync(CLAUDE_DIR)) {
    try {
      const projectDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const projectDir of projectDirs) {
        const projectPath = path.join(CLAUDE_DIR, projectDir.name);
        let jsonlFiles;
        try {
          jsonlFiles = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
        } catch (e) { continue; }

        for (const file of jsonlFiles) {
          const filePath = path.join(projectPath, file);
          const session = parseSession(filePath, projectDir.name, 'claude');
          if (!session) continue;

          const id = session.id;
          session.customName = names[id] || null;
          session.displayName = session.customName || session.title;
          session.notes = notes[id] || '';
          session.tags = tags[id] || [];
          session.pinned = Boolean(pins[id]);

          sessions.push(session);
        }
      }
    } catch (e) {}
  }

  // Codex stores sessions in date folders: sessions/YYYY/MM/DD/*.jsonl
  if (fs.existsSync(CODEX_DIR)) {
    try {
      const jsonlFiles = findJsonlFiles(CODEX_DIR);
      for (const filePath of jsonlFiles) {
        const session = parseSession(filePath, 'codex-sessions', 'codex');
        if (!session) continue;

        const id = session.id;
        session.customName = names[id] || null;
        session.displayName = session.customName || session.title;
        session.notes = notes[id] || '';
        session.tags = tags[id] || [];
        session.pinned = Boolean(pins[id]);

        sessions.push(session);
      }
    } catch (e) {}
  }

  // Sort by most recently modified
  return sessions.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// ─── Parse a single .jsonl session file ──────────────────────────────────────
function parseSession(filePath, projectDirName, tool = 'claude') {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    if (fileSize === 0) return null;

    // Codex prepends richer runtime metadata, so allow enough room to reach the
    // first real user prompt while keeping large histories cheap to scan.
    const readSize = Math.min(tool === 'codex' ? 524288 : 65536, fileSize);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, 0);
    fs.closeSync(fd);

    const content = buffer.toString('utf8');
    const lines = content.split('\n').filter(l => l.trim().startsWith('{'));

    // Extract title from first usable user message
    let title = null;
    let messageCount = 0;
    let lastUserMessage = null;
    let filesModified = [];
    let codexMeta = null;

    for (const line of lines) {
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }

      if (msg.type === 'session_meta' && msg.payload) codexMeta = msg.payload;

      messageCount++;

      const role = getRole(msg);

      if (role === 'user' || role === 'human') {
        const text = extractText(msg);
        if (text) {
          lastUserMessage = text;
          if (!title && isUsableTitle(text)) {
            title = text.slice(0, 100).trim();
          }
        }
      }

      // Extract file paths from tool calls
      if (msg.type === 'tool_use' || (msg.message && msg.message.type === 'tool_use')) {
        const toolInput = msg.input || (msg.message && msg.message.input);
        if (toolInput && toolInput.path) {
          const p = toolInput.path;
          if (!filesModified.includes(p)) filesModified.push(p);
        }
      }
    }

    const sessionId = codexMeta?.id || codexMeta?.session_id || path.basename(filePath, '.jsonl');
    const projectPath = codexMeta?.cwd || decodeProjectPath(projectDirName);

    return {
      id: sessionId,
      tool,
      title: title || `Session ${sessionId.slice(0, 8)}`,
      projectDirName,
      projectPath,
      filePath,
      modifiedAt: stats.mtime.getTime(),
      createdAt: stats.birthtime ? stats.birthtime.getTime() : stats.mtime.getTime(),
      fileSize,
      messageCount,
      lastUserMessage: lastUserMessage ? lastUserMessage.slice(0, 200) : null,
      filesModified: filesModified.slice(0, 10),
    };
  } catch (e) {
    return null;
  }
}

// ─── Extract text from various message formats ───────────────────────────────
function extractText(msg) {
  // Handle nested message object
  const m = msg.payload || msg.message || msg;
  const content = m.content;

  if (!content) return null;
  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    // Find first text block
    for (const block of content) {
      if ((block.type === 'text' || block.type === 'input_text' || block.type === 'output_text') && block.text) return block.text.trim();
      if (typeof block === 'string') return block.trim();
    }
  }

  return null;
}

function getRole(msg) {
  if (msg.type === 'response_item' && msg.payload) return msg.payload.role || msg.payload.type;
  return msg.role || msg.type;
}

// ─── Title usability check ───────────────────────────────────────────────────
function isUsableTitle(text) {
  if (!text || text.length < 5) return false;
  if (text.length > 600) return false;
  if (text.startsWith('/')) return false; // slash command
  if ((text.match(/\n/g) || []).length > 8) return false; // large paste
  if (text.match(/^[<{(\[]/)) return false; // code/xml/json
  const normalized = text.toLowerCase();
  if (normalized.startsWith('the following is the codex agent history')) return false;
  if (normalized.startsWith('you are assessing whether an ai agent')) return false;
  if (normalized.includes('<environment_context>') || normalized.includes('<external_codex_apps_')) return false;
  return true;
}

// ─── Decode project directory name to readable path ─────────────────────────
function decodeProjectPath(dirName) {
  if (!dirName || dirName === 'codex-sessions') return HOME;

  // Claude Code encodes paths:
  // Windows: C:\Users\name\proj → -C--Users-name-proj (approx)
  // Unix:    /home/user/proj    → -home-user-proj
  // We try to recover a best-effort path.

  let decoded = dirName;

  // Replace leading dash and then dashes with separators
  if (decoded.startsWith('-')) {
    decoded = decoded.slice(1); // remove leading -
    // Try Windows drive letter pattern (e.g. C--Users...)
    const winDriveMatch = decoded.match(/^([A-Za-z])--(.+)$/);
    if (winDriveMatch) {
      decoded = `${winDriveMatch[1]}:\\${winDriveMatch[2].replace(/-/g, '\\')}`;
    } else {
      decoded = '/' + decoded.replace(/-/g, '/');
    }
  }

  return decoded;
}

// ─── Generate context packet for switching ──────────────────────────────────
function getContextPacket(session) {
  const { filePath, projectPath, title, modifiedAt } = session;

  let messages = [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().startsWith('{'));

    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        const role = getRole(msg);
        const text = extractText(msg);
        if ((role === 'user' || role === 'human' || role === 'assistant') && text) {
          messages.push({ role: role === 'human' ? 'user' : role, text });
        }
      } catch (e) {}
    }
  } catch (e) {}

  const lastModified = new Date(modifiedAt);
  const now = new Date();
  const gapMs = now - lastModified;
  const gapHours = Math.round(gapMs / 3600000);
  const gapDays = Math.round(gapMs / 86400000);

  let gapStr = '';
  if (gapDays >= 1) {
    gapStr = `${gapDays} day${gapDays > 1 ? 's' : ''} ago (${lastModified.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })})`;
  } else if (gapHours >= 1) {
    gapStr = `${gapHours} hour${gapHours > 1 ? 's' : ''} ago`;
  } else {
    gapStr = 'just now';
  }

  const lastMsgs = messages.slice(-20); // last 20 exchanges
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');

  const packet = `# 🔄 Relay Context Handoff

## Session Info
- **Last active:** ${lastModified.toLocaleString('en-IN')} (${gapStr})
- **Resumed at:** ${now.toLocaleString('en-IN')}
- **Project:** ${projectPath}
- **What we were doing:** ${title}

## Last thing I said:
${lastUserMsg ? lastUserMsg.text.slice(0, 500) : '(not found)'}

## Last thing you (AI) said:
${lastAssistantMsg ? lastAssistantMsg.text.slice(0, 800) : '(not found)'}

## Recent Conversation (last ${Math.min(lastMsgs.length, 20)} messages):
${lastMsgs.map(m => `**${m.role === 'user' ? '👤 Me' : '🤖 AI'}:** ${m.text.slice(0, 300)}`).join('\n\n')}

## Files touched in this session:
${session.filesModified && session.filesModified.length > 0 ? session.filesModified.map(f => `- \`${f}\``).join('\n') : '- (none detected)'}

---
**Continue from where we left off. You now have full context. Do not ask me to re-explain anything — just pick up the task.**`;

  return packet;
}

// ─── Rename a session ────────────────────────────────────────────────────────
function renameSession(id, newName) {
  const names = loadJSON(NAMES_FILE);
  if (newName) names[id] = newName;
  else delete names[id];
  saveJSON(NAMES_FILE, names);
}

// ─── Save session notes ──────────────────────────────────────────────────────
function saveNotes(id, text) {
  const notes = loadJSON(NOTES_FILE);
  notes[id] = text;
  saveJSON(NOTES_FILE, notes);
}

// ─── Save session tags ───────────────────────────────────────────────────────
function saveTags(id, tagsArray) {
  const tags = loadJSON(TAGS_FILE);
  tags[id] = tagsArray;
  saveJSON(TAGS_FILE, tags);
}

function savePin(id, pinned) {
  const pins = loadJSON(PINS_FILE);
  if (pinned) pins[id] = true;
  else delete pins[id];
  saveJSON(PINS_FILE, pins);
}

function exportUserData() {
  return {
    format: 'relay-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      names: loadJSON(NAMES_FILE), notes: loadJSON(NOTES_FILE),
      tags: loadJSON(TAGS_FILE), pins: loadJSON(PINS_FILE),
    },
  };
}

function cleanRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 10000));
}

function importUserData(backup) {
  if (!backup || backup.format !== 'relay-backup' || backup.version !== 1 || !backup.data) throw new Error('Invalid backup');
  const names = cleanRecord(backup.data.names);
  const notes = cleanRecord(backup.data.notes);
  const pins = cleanRecord(backup.data.pins);
  const rawTags = cleanRecord(backup.data.tags);
  const tags = Object.fromEntries(Object.entries(rawTags).map(([id, values]) => [id, Array.isArray(values) ? values.slice(0, 20).filter(v => typeof v === 'string').map(v => v.slice(0, 32)) : []]));
  saveJSON(NAMES_FILE, names); saveJSON(NOTES_FILE, notes); saveJSON(TAGS_FILE, tags); saveJSON(PINS_FILE, pins);
}

// ─── Delete (move to Recycle Bin via PowerShell) ─────────────────────────────
function deleteSession(filePath) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const ps = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${filePath}',[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)`;
    exec(`powershell -Command "${ps}"`, (err) => {
      resolve(!err);
    });
  });
}

module.exports = {
  readSessions,
  getContextPacket,
  renameSession,
  saveNotes,
  saveTags,
  savePin,
  isSessionFile,
  getSessionRoots: () => [CLAUDE_DIR, CODEX_DIR],
  exportUserData,
  importUserData,
};
