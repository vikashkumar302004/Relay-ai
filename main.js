/**
 * main.js — Relay
 * Electron main process: Tray, Window, IPC, Session Resume, Global Hotkey
 */

const {
  app, BrowserWindow, Tray, Menu, nativeImage, dialog, clipboard,
  ipcMain, shell, globalShortcut, screen, Notification
} = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const {
  readSessions, getContextPacket,
  renameSession, saveNotes, saveTags, savePin, isSessionFile, getSessionRoots,
  exportUserData, importUserData
} = require('./sessions');

// ─── App globals ─────────────────────────────────────────────────────────────
let tray = null;
let mainWindow = null;
let sessionWatchers = [];
let sessionChangeTimer = null;
const isDev = process.argv.includes('--dev');

// ─── Single instance lock ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) showWindow();
});

// ─── App ready ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.setAppUserModelId('com.relay.ai');

  createTray();
  createWindow();
  registerHotkey();
  watchSessionFolders();

  // Auto-launch setup
  setupAutoLaunch();
});

// Keep app alive when all windows are closed (tray app)
app.on('window-all-closed', (e) => e.preventDefault());

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  sessionWatchers.forEach(watcher => watcher.close());
  sessionWatchers = [];
});

function watchSessionFolders() {
  for (const root of getSessionRoots()) {
    if (!fs.existsSync(root)) continue;
    try {
      const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
        if (!filename || !String(filename).endsWith('.jsonl')) return;
        clearTimeout(sessionChangeTimer);
        sessionChangeTimer = setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('sessions-changed');
        }, 500);
      });
      watcher.on('error', error => console.warn('Session watcher stopped:', error.message));
      sessionWatchers.push(watcher);
    } catch (error) {
      console.warn('Could not watch session folder:', root, error.message);
    }
  }
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let icon;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  } else {
    // Fallback: create a small colored square icon
    icon = nativeImage.createFromDataURL(makeFallbackIcon());
  }

  tray = new Tray(icon);
  tray.setToolTip('Relay — AI Session Manager\nCtrl+Shift+Space to open');

  tray.on('click', () => toggleWindow());
  tray.on('double-click', () => showWindow());

  tray.on('right-click', () => {
    const menu = Menu.buildFromTemplate([
      { label: '⚡ Open Relay', click: showWindow },
      { type: 'separator' },
      { label: '🤖 Claude Web', click: () => shell.openExternal('https://claude.ai') },
      { label: '💬 ChatGPT', click: () => shell.openExternal('https://chatgpt.com') },
      { label: '🔍 Perplexity', click: () => shell.openExternal('https://perplexity.ai') },
      { label: '💎 Gemini', click: () => shell.openExternal('https://gemini.google.com') },
      { type: 'separator' },
      { label: 'Quit Relay', click: () => app.exit(0) },
    ]);
    tray.popUpContextMenu(menu);
  });
}

// ─── Main Window ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const expected = isDev ? 'http://localhost:5173/' : `file://${path.join(__dirname, 'dist', 'index.html').replace(/\\/g, '/')}`;
    if (!url.startsWith(expected)) event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Hide on blur (unless dev mode)
  mainWindow.on('blur', () => {
    if (!isDev) mainWindow.hide();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ─── Window position & show/hide ─────────────────────────────────────────────
function showWindow() {
  if (!mainWindow) return;

  const trayBounds = tray.getBounds();
  const winBounds = mainWindow.getBounds();
  const workArea = screen.getPrimaryDisplay().workArea;

  // Center window above tray icon
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
  let y = Math.round(trayBounds.y - winBounds.height - 8);

  // If taskbar is at bottom, y is already negative from top — flip if needed
  if (trayBounds.y < workArea.height / 2) {
    // Taskbar at top — open below
    y = Math.round(trayBounds.y + trayBounds.height + 8);
  }

  // Clamp within screen
  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - winBounds.width - 8));
  y = Math.max(workArea.y + 8, Math.min(y, workArea.y + workArea.height - winBounds.height - 8));

  mainWindow.setPosition(x, y, false);
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

// ─── Global Hotkey ───────────────────────────────────────────────────────────
function registerHotkey() {
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', toggleWindow);
  } catch (e) {
    console.warn('Could not register global hotkey:', e.message);
  }
}

// ─── Auto-launch ─────────────────────────────────────────────────────────────
let AutoLaunch;
let autoLauncher;

function setupAutoLaunch() {
  try {
    AutoLaunch = require('auto-launch');
    autoLauncher = new AutoLaunch({ name: 'Relay', isHidden: true });
  } catch (e) {}
}

// ─── Session Resume ───────────────────────────────────────────────────────────
async function resumeSession(session) {
  const { id, projectPath } = session;
  if (!isValidSessionId(id)) return { ok: false, error: 'Invalid session identifier.' };
  const workDir = resolveWorkDir(projectPath);
  const tool = session.tool === 'codex' ? 'codex' : 'claude';
  if (!(await commandExists(tool))) return { ok: false, error: `${tool === 'codex' ? 'Codex' : 'Claude'} CLI is not installed or not available in PATH.` };
  const args = tool === 'codex' ? ['resume', id] : ['--resume', id];
  launchTerminal(workDir, tool, args);
  return { ok: true };
}

// ─── Context Switch (New Claude session with context injected) ───────────────
async function switchContext(session) {
  const packet = getContextPacket(session);
  const workDir = resolveWorkDir(session.projectPath);

  // Save packet to temp file
  const tmpFile = path.join(os.tmpdir(), `relay-context-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, packet, 'utf8');

  const tool = session.tool === 'codex' ? 'codex' : 'claude';
  if (!(await commandExists(tool))) {
    fs.unlink(tmpFile, () => {});
    return { ok: false, error: `${tool === 'codex' ? 'Codex' : 'Claude'} CLI is not installed or not available in PATH.` };
  }
  launchTerminal(workDir, tool, [packet]);
  setTimeout(() => fs.unlink(tmpFile, () => {}), 300000);

  // Notify user
  new Notification({
    title: 'Relay — Context Switched',
    body: 'New Claude session started with your full context. Pick up where you left off!',
  }).show();
  return { ok: true };
}

async function commandExists(command) {
  try { await execFileAsync('where.exe', [command], { windowsHide: true, timeout: 3000 }); return true; }
  catch (error) { return false; }
}

async function getSystemStatus() {
  const [terminal, claude, codex] = await Promise.all([
    commandExists('wt.exe'), commandExists('claude'), commandExists('codex'),
  ]);
  return { terminal, claude, codex, sessionRoots: getSessionRoots().map(root => ({ root, exists: fs.existsSync(root) })) };
}

function isValidSessionId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{6,160}$/.test(value);
}

function launchTerminal(workDir, executable, args) {
  const terminalArgs = ['new-tab', '-d', workDir, executable, ...args];
  const child = spawn('wt.exe', terminalArgs, { detached: true, stdio: 'ignore', windowsHide: false });
  child.once('error', () => {
    const quote = value => `'${String(value).replace(/'/g, "''")}'`;
    const script = `Set-Location -LiteralPath ${quote(workDir)}; & ${quote(executable)} ${args.map(quote).join(' ')}`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const fallback = spawn('powershell.exe', ['-NoExit', '-EncodedCommand', encoded], { detached: true, stdio: 'ignore', windowsHide: false });
    fallback.unref();
  });
  child.unref();
}

// ─── Resolve actual working directory ────────────────────────────────────────
function resolveWorkDir(projectPath) {
  if (!projectPath) return os.homedir();

  // If path exists, use it directly
  if (fs.existsSync(projectPath)) return projectPath;

  // Try common Windows patterns
  const candidates = [
    projectPath,
    projectPath.replace(/\//g, '\\'),
    path.join(os.homedir(), projectPath),
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }

  return os.homedir();
}

// ─── Fallback icon (neon blue square) ────────────────────────────────────────
function makeFallbackIcon() {
  // 20x20 PNG as base64 — a simple colored square
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABUSURBVDiN7ZSxCQAgDASzuIuDOIijuIuDuIiTWIiNhSAWgvv/ggiBkMtdHiQJAADga2bWJklm1iTJIIQQQgj/MLNKkqSqKgAAAAAAAAAAAIBbA1MABQBM2S5RAAAAAElFTkSuQmCC';
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('get-sessions', () => readSessions());

ipcMain.handle('resume-session', async (_e, session) => {
  if (!session || !isSessionFile(session.filePath)) return false;
  const started = await resumeSession(session);
  if (started.ok && mainWindow) mainWindow.hide();
  return started;
});

ipcMain.handle('switch-context', async (_e, session) => {
  if (!session || !isSessionFile(session.filePath)) return false;
  const started = await switchContext(session);
  if (started.ok && mainWindow) mainWindow.hide();
  return started;
});

ipcMain.handle('get-context-packet', (_e, session) => {
  if (!session || !isSessionFile(session.filePath)) return '';
  return getContextPacket(session);
});

ipcMain.handle('delete-session', async (_e, filePath) => {
  if (!isSessionFile(filePath)) return false;
  try { await shell.trashItem(filePath); return true; } catch (e) { return false; }
});

ipcMain.handle('rename-session', (_e, id, name) => {
  if (!isValidSessionId(id) || typeof name !== 'string') return false;
  renameSession(id, name.trim().slice(0, 120));
  return true;
});

ipcMain.handle('save-notes', (_e, id, notes) => {
  if (!isValidSessionId(id) || typeof notes !== 'string') return false;
  saveNotes(id, notes.slice(0, 10000));
  return true;
});

ipcMain.handle('save-tags', (_e, id, tags) => {
  if (!isValidSessionId(id) || !Array.isArray(tags)) return false;
  const clean = tags.slice(0, 20).filter(t => typeof t === 'string').map(t => t.trim().slice(0, 32)).filter(Boolean);
  saveTags(id, [...new Set(clean)]);
  return true;
});

ipcMain.handle('save-pin', (_e, id, pinned) => {
  if (!isValidSessionId(id) || typeof pinned !== 'boolean') return false;
  savePin(id, pinned);
  return true;
});

ipcMain.handle('open-url', (_e, url) => {
  const allowed = new Set(['claude.ai', 'chatgpt.com', 'perplexity.ai', 'gemini.google.com']);
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && allowed.has(parsed.hostname)) return shell.openExternal(parsed.toString());
  } catch (e) {}
  return false;
});

ipcMain.handle('hide-window', () => { if (mainWindow) mainWindow.hide(); });

ipcMain.handle('quit-app', () => app.exit(0));

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  packaged: app.isPackaged,
  updateChannel: 'manual',
}));

ipcMain.handle('get-system-status', () => getSystemStatus());
ipcMain.handle('copy-text', (_event, value) => {
  if (typeof value !== 'string' || value.length > 50000) return false;
  clipboard.writeText(value);
  return true;
});

ipcMain.handle('export-user-data', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Back up Relay data',
    defaultPath: `relay-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Relay backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(exportUserData(), null, 2), { encoding: 'utf8', flag: 'wx' });
    return { ok: true, filePath: result.filePath };
  } catch (error) {
    if (error.code === 'EEXIST') {
      fs.writeFileSync(result.filePath, JSON.stringify(exportUserData(), null, 2), 'utf8');
      return { ok: true, filePath: result.filePath };
    }
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('import-user-data', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore Relay data',
    properties: ['openFile'],
    filters: [{ name: 'Relay backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
  try {
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 5 * 1024 * 1024) return { ok: false, error: 'Backup is larger than 5 MB.' };
    importUserData(JSON.parse(raw));
    return { ok: true };
  } catch (error) { return { ok: false, error: 'This is not a valid Relay backup.' }; }
});

ipcMain.handle('get-diagnostics', async () => {
  const status = await getSystemStatus();
  return {
    app: { version: app.getVersion(), packaged: app.isPackaged, platform: process.platform, arch: process.arch },
    integrations: status,
    sessionCount: readSessions().length,
    dataDirectory: path.join(os.homedir(), '.relay'),
  };
});

ipcMain.handle('get-auto-launch', async () => {
  if (!autoLauncher) return false;
  try { return await autoLauncher.isEnabled(); } catch (e) { return false; }
});

ipcMain.handle('set-auto-launch', async (_e, enabled) => {
  if (!autoLauncher) return;
  try {
    if (enabled) await autoLauncher.enable();
    else await autoLauncher.disable();
  } catch (e) {}
});
