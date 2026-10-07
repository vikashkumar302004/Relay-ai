/**
 * preload.js — Relay
 * Secure IPC bridge between renderer and main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('relay', {
  // Sessions
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  resumeSession: (session) => ipcRenderer.invoke('resume-session', session),
  deleteSession: (filePath) => ipcRenderer.invoke('delete-session', filePath),
  renameSession: (id, name) => ipcRenderer.invoke('rename-session', id, name),
  saveNotes: (id, notes) => ipcRenderer.invoke('save-notes', id, notes),
  saveTags: (id, tags) => ipcRenderer.invoke('save-tags', id, tags),
  savePin: (id, pinned) => ipcRenderer.invoke('save-pin', id, pinned),

  // Context Switch
  getContextPacket: (session) => ipcRenderer.invoke('get-context-packet', session),
  switchContext: (session) => ipcRenderer.invoke('switch-context', session),

  // App
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getSystemStatus: () => ipcRenderer.invoke('get-system-status'),
  getDiagnostics: () => ipcRenderer.invoke('get-diagnostics'),
  exportUserData: () => ipcRenderer.invoke('export-user-data'),
  importUserData: () => ipcRenderer.invoke('import-user-data'),
  copyText: (value) => ipcRenderer.invoke('copy-text', value),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),

  // Listeners
  onUsageUpdate: (cb) => ipcRenderer.on('usage-update', (_e, data) => cb(data)),
  onSessionsChanged: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('sessions-changed', listener);
    return () => ipcRenderer.removeListener('sessions-changed', listener);
  },
});
