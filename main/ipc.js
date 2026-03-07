import { ipcMain, BrowserWindow, shell } from 'electron';
import { readFile, writeFile } from './fileManager.js';
import { loadPreferences, savePreferences, updatePreference, saveSession } from './configManager.js';

// Track if global handlers have been registered
let globalHandlersRegistered = false;

/**
 * Register IPC handlers.
 * Global handlers are registered once; per-window data is retrieved from the sender's window.
 */
export function registerIpcHandlers(win) {
  if (globalHandlersRegistered) return;
  globalHandlersRegistered = true;

  // Helper to get the pumice state from the sending window
  function getPumice(event) {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    return senderWin?.pumice || null;
  }

  // ─── File operations ──────────────────────────────────────────────────

  ipcMain.handle('files:list', (event) => {
    const pumice = getPumice(event);
    return pumice?.files || [];
  });

  ipcMain.handle('files:read', async (event, filePath) => {
    const result = await readFile(filePath);
    return { content: result.content, mtime: result.mtime };
  });

  ipcMain.handle('files:write', async (event, filePath, content) => {
    await writeFile(filePath, content);
  });

  ipcMain.handle('files:create', async (event, filePath) => {
    await writeFile(filePath, '');
  });

  ipcMain.handle('files:getBacklinks', (event, filePath) => {
    const pumice = getPumice(event);
    if (!pumice) return [];
    const sources = pumice.backlinks.get(filePath);
    return sources ? [...sources] : [];
  });

  ipcMain.handle('files:getScanTime', (event) => {
    const pumice = getPumice(event);
    return pumice?.backlinkScanTime || 0;
  });

  // ─── App info ─────────────────────────────────────────────────────────

  ipcMain.handle('app:getRoot', (event) => {
    const pumice = getPumice(event);
    return pumice?.rootDir || null;
  });

  ipcMain.handle('app:getInitialFile', (event) => {
    const pumice = getPumice(event);
    return pumice?.initialFile || null;
  });

  ipcMain.handle('app:getMode', (event) => {
    const pumice = getPumice(event);
    return pumice?.mode || 'empty';
  });

  ipcMain.handle('app:getSession', (event) => {
    const pumice = getPumice(event);
    return pumice?.session || null;
  });

  // ─── Session management ───────────────────────────────────────────────

  ipcMain.handle('session:save', async (event, sessionData) => {
    await saveSession(sessionData);
  });

  // ─── Preferences ─────────────────────────────────────────────────────

  ipcMain.handle('preferences:load', async () => {
    return loadPreferences();
  });

  ipcMain.handle('preferences:update', async (event, key, value) => {
    return updatePreference(key, value);
  });

  // ─── Shell ────────────────────────────────────────────────────────────

  ipcMain.handle('shell:openExternal', async (event, url) => {
    // Only allow http/https/mailto URLs for security
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      await shell.openExternal(url);
    }
  });
}
