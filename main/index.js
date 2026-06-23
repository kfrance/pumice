import { app, BrowserWindow, dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc.js';
import {
  parseTargetPath,
  resolveLaunchRequest,
  resolveTargetPath,
  windowKeyForResolvedPath,
} from './cli.js';
import {
  discoverFiles,
  buildBacklinksIndex,
  buildMtimeCache,
  hasFileChanged,
  createWatcher,
  createFileWatcher,
  hashFileContent,
  updateBacklinksForFile,
} from './fileManager.js';
import { loadPreferences, findSession } from './configManager.js';
import { createWindowRegistry } from './windowRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const windowRegistry = createWindowRegistry();

function parseArgs(argv = process.argv) {
  return parseTargetPath(argv, { isPackaged: app.isPackaged });
}

async function validateTargetPath(targetPath, cwd = process.cwd()) {
  if (!targetPath) return { ok: true, resolvedPath: null };
  const resolvedPath = resolveTargetPath(targetPath, cwd);
  const stat = await fs.stat(resolvedPath).catch(() => null);
  if (!stat) return { ok: false, resolvedPath };
  if (!stat.isFile() && !stat.isDirectory()) {
    return { ok: false, resolvedPath, reason: 'unsupported' };
  }
  return { ok: true, resolvedPath };
}

async function createWindow(targetPath) {
  await loadPreferences();

  let mode, rootDir, initialFile, files, backlinksData, watcher;

  if (targetPath) {
    const resolvedPath = path.resolve(targetPath);
    const stat = await fs.stat(resolvedPath).catch(() => null);

    if (!stat) {
      console.error(`[pumice] Path not found: ${resolvedPath}`);
      return null;
    }

    if (stat.isDirectory()) {
      mode = 'folder';
      rootDir = resolvedPath;
      initialFile = null;

      const discovery = await discoverFiles(rootDir);
      files = discovery.files;
      console.log(`[pumice] Discovered ${files.length} files in ${discovery.elapsed.toFixed(1)}ms`);

      backlinksData = await buildBacklinksIndex(files, rootDir);
      watcher = createWatcher(rootDir);
    } else if (stat.isFile()) {
      mode = 'file';
      rootDir = null;
      initialFile = resolvedPath;
      files = [resolvedPath];
      backlinksData = { backlinks: new Map(), elapsed: 0 };
      watcher = createFileWatcher(resolvedPath);
    }
  } else {
    mode = 'empty';
    rootDir = null;
    initialFile = null;
    files = [];
    backlinksData = { backlinks: new Map(), elapsed: 0 };
  }

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

  let session = null;
  if (rootDir) {
    session = await findSession(rootDir);
  } else if (initialFile) {
    session = await findSession(initialFile);
  }

  const fileMtimes = await buildMtimeCache(files);

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
    fileMtimes,
  };

  registerIpcHandlers(win);

  if (watcher) {
    const fileUpdateChains = new Map();

    function enqueueFileUpdate(filePath, task) {
      const previous = fileUpdateChains.get(filePath) || Promise.resolve();
      const next = previous
        .catch(() => {})
        .then(task)
        .finally(() => {
          if (fileUpdateChains.get(filePath) === next) {
            fileUpdateChains.delete(filePath);
          }
        });
      fileUpdateChains.set(filePath, next);
      return next;
    }

    watcher.on('change', (filePath) => {
      enqueueFileUpdate(filePath, async () => {
        if (win.isDestroyed()) return;
        if (!await hasFileChanged(filePath, win.pumice.fileMtimes)) return;
        await updateBacklinksForFile(filePath, win.pumice.backlinks, win.pumice.knownFiles);
        if (win.isDestroyed() || !win.pumice.knownFiles.has(filePath)) return;
        win.webContents.send('file:changed', filePath);
      });
    });

    watcher.on('add', (filePath) => {
      enqueueFileUpdate(filePath, async () => {
        if (win.isDestroyed()) return;
        win.pumice.files.push(filePath);
        win.pumice.files.sort();
        win.pumice.knownFiles.add(filePath);
        if (!win.pumice.backlinks.has(filePath)) {
          win.pumice.backlinks.set(filePath, new Set());
        }
        try {
          const stat = await fs.stat(filePath);
          if (win.isDestroyed() || !win.pumice.knownFiles.has(filePath)) return;
          const content = await fs.readFile(filePath, 'utf-8');
          win.pumice.fileMtimes.set(filePath, {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            hash: hashFileContent(content),
          });
        } catch {
          return;
        }
        await updateBacklinksForFile(filePath, win.pumice.backlinks, win.pumice.knownFiles);
        if (win.isDestroyed() || !win.pumice.knownFiles.has(filePath)) return;
        win.webContents.send('file:added', filePath);
      });
    });

    watcher.on('unlink', (filePath) => {
      if (win.isDestroyed()) return;
      win.pumice.files = win.pumice.files.filter(f => f !== filePath);
      win.pumice.knownFiles.delete(filePath);
      win.pumice.fileMtimes.delete(filePath);
      win.pumice.backlinks.delete(filePath);
      for (const [, sources] of win.pumice.backlinks) {
        sources.delete(filePath);
      }
      win.webContents.send('file:removed', filePath);
    });
  }

  if (rootDir) {
    win.setTitle(`Pumice — ${path.basename(rootDir)}`);
  } else if (initialFile) {
    win.setTitle(`Pumice — ${path.basename(initialFile)}`);
  }

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') || !url.includes('dist/index.html')) {
      event.preventDefault();
      console.log(`[pumice] Blocked navigation to: ${url}`);
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  win.on('closed', () => {
    if (watcher) watcher.close();
  });

  return win;
}

async function openOrFocusWindow(targetPath, cwd = process.cwd()) {
  const validation = await validateTargetPath(targetPath, cwd);
  if (!validation.ok) {
    console.error(`[pumice] Cannot open: ${validation.resolvedPath}`);
    const message = validation.reason === 'unsupported'
      ? `Not a file or folder:\n${validation.resolvedPath}`
      : `Path not found:\n${validation.resolvedPath}`;
    dialog.showErrorBox('Pumice', message);
    return null;
  }

  const key = windowKeyForResolvedPath(validation.resolvedPath);
  return windowRegistry.openOrFocus(key, () => createWindow(validation.resolvedPath));
}

const launchRequest = {
  targetPath: parseArgs(),
  cwd: process.cwd(),
};

const gotLock = app.requestSingleInstanceLock(launchRequest);

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory, additionalData) => {
    const { targetPath, cwd } = resolveLaunchRequest(
      additionalData,
      argv,
      workingDirectory,
      { isPackaged: app.isPackaged },
    );
    void openOrFocusWindow(targetPath, cwd);
  });

  app.on('ready', async () => {
    const win = await openOrFocusWindow(launchRequest.targetPath, launchRequest.cwd);
    if (!win && BrowserWindow.getAllWindows().length === 0) {
      app.quit();
    }
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await openOrFocusWindow(null);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}