import { app, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';
import { discoverFiles, buildBacklinksIndex, createWatcher, updateBacklinksForFile } from './fileManager.js';
import { loadPreferences, findSession } from './configManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI arguments (skip electron args)
function parseArgs() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  // Filter out electron flags
  const paths = args.filter(a => !a.startsWith('-') && !a.startsWith('--'));
  return paths[0] || null;
}

async function createWindow(targetPath) {
  const prefs = await loadPreferences();

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Pumice',
  });

  // Determine mode and root
  let mode, rootDir, initialFile, files, backlinksData, watcher;

  if (targetPath) {
    const resolvedPath = path.resolve(targetPath);
    const stat = await fs.stat(resolvedPath).catch(() => null);

    if (!stat) {
      console.error(`[pumice] Path not found: ${resolvedPath}`);
      app.quit();
      return;
    }

    if (stat.isDirectory()) {
      mode = 'folder';
      rootDir = resolvedPath;
      initialFile = null;

      // Discover files
      const discovery = await discoverFiles(rootDir);
      files = discovery.files;
      console.log(`[pumice] Discovered ${files.length} files in ${discovery.elapsed.toFixed(1)}ms`);

      // Build backlinks
      backlinksData = await buildBacklinksIndex(files, rootDir);

      // Set up watcher
      watcher = createWatcher(rootDir);
    } else if (stat.isFile()) {
      mode = 'file';
      rootDir = null;
      initialFile = resolvedPath;
      files = [resolvedPath];
      backlinksData = { backlinks: new Map(), elapsed: 0 };
    }
  } else {
    // No path — open empty window
    mode = 'empty';
    rootDir = null;
    initialFile = null;
    files = [];
    backlinksData = { backlinks: new Map(), elapsed: 0 };
  }

  // Try to restore session
  let session = null;
  if (rootDir) {
    session = await findSession(rootDir);
  } else if (initialFile) {
    session = await findSession(initialFile);
  }

  // Store state on the window for IPC handlers
  win.pumice = {
    mode,
    rootDir,
    initialFile,
    files,
    backlinks: backlinksData.backlinks,
    backlinkScanTime: backlinksData.elapsed,
    watcher,
    session,
    knownFiles: new Set(files),
  };

  // Register IPC handlers for this window
  registerIpcHandlers(win);

  // Set up file watcher events
  if (watcher) {
    watcher.on('change', (filePath) => {
      if (win.isDestroyed()) return;
      win.webContents.send('file:changed', filePath);
      // Update backlinks for changed file
      updateBacklinksForFile(filePath, win.pumice.backlinks, win.pumice.knownFiles);
    });

    watcher.on('add', (filePath) => {
      if (win.isDestroyed()) return;
      win.pumice.files.push(filePath);
      win.pumice.files.sort();
      win.pumice.knownFiles.add(filePath);
      if (!win.pumice.backlinks.has(filePath)) {
        win.pumice.backlinks.set(filePath, new Set());
      }
      win.webContents.send('file:added', filePath);
      // Scan the new file for outgoing links
      updateBacklinksForFile(filePath, win.pumice.backlinks, win.pumice.knownFiles);
    });

    watcher.on('unlink', (filePath) => {
      if (win.isDestroyed()) return;
      win.pumice.files = win.pumice.files.filter(f => f !== filePath);
      win.pumice.knownFiles.delete(filePath);
      win.pumice.backlinks.delete(filePath);
      // Remove this file as a source from all backlinks
      for (const [, sources] of win.pumice.backlinks) {
        sources.delete(filePath);
      }
      win.webContents.send('file:removed', filePath);
    });
  }

  // Set window title
  if (rootDir) {
    win.setTitle(`Pumice — ${path.basename(rootDir)}`);
  } else if (initialFile) {
    win.setTitle(`Pumice — ${path.basename(initialFile)}`);
  }

  // Prevent the window from navigating away from the app
  win.webContents.on('will-navigate', (event, url) => {
    // Only allow loading our own index.html
    if (!url.startsWith('file://') || !url.includes('dist/index.html')) {
      event.preventDefault();
      console.log(`[pumice] Blocked navigation to: ${url}`);
    }
  });

  // Prevent new windows from being opened
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Load the renderer
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.on('closed', () => {
    if (watcher) watcher.close();
  });

  return win;
}

// Allow multiple instances
app.on('ready', async () => {
  const targetPath = parseArgs();
  await createWindow(targetPath);
});

// macOS: re-create window when dock icon is clicked
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const targetPath = parseArgs();
    await createWindow(targetPath);
  }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
