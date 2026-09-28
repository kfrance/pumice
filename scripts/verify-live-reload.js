import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pumice-live-reload-'));
const filePath = path.join(tempDir, 'note.md');
const configDir = path.join(tempDir, 'config');
const outsideWatch = process.argv.includes('--outside-watch');
const folderPath = path.join(tempDir, 'folder');
const indexPath = path.join(folderPath, 'index.md');
let child;
let socket;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(predicate, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await predicate().catch(() => null);
    if (result) return result;
    if (child.exitCode !== null) throw new Error(`Electron exited while waiting for ${description}`);
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function command(method, params) {
  const id = Math.floor(Math.random() * 1e9);
  const reply = new Promise((resolve, reject) => {
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result?.result?.value || '');
    };
    socket.addEventListener('message', listener);
  });
  socket.send(JSON.stringify({ id, method, params }));
  return reply;
}

const evaluate = (expression) => command('Runtime.evaluate', { expression, returnByValue: true });

const visibleText = () => evaluate("document.querySelector('#markdown-left')?.innerText || ''");

try {
  await fs.mkdir(configDir);
  await fs.writeFile(filePath, '# Initial note\n');
  if (outsideWatch) {
    await fs.mkdir(folderPath);
    await fs.writeFile(indexPath, '# Index\n\n[Open note](../note.md)\n');
    await fs.mkdir(path.join(configDir, 'pumice'));
    await fs.writeFile(path.join(configDir, 'pumice', 'sessions.json'), JSON.stringify({
      recent: [{
        root: folderPath,
        mode: 'folder',
        panes: { left: { tabs: [{ path: indexPath, scrollTop: 0 }], activeIndex: 0 } },
      }],
      maxRecent: 20,
    }));
  }
  const port = await freePort();
  child = spawn('xvfb-run', [
    '-a', path.join(appDir, 'node_modules/.bin/electron'),
    appDir, outsideWatch ? folderPath : filePath,
    `--remote-debugging-port=${port}`, '--no-sandbox', '--disable-gpu',
  ], {
    env: { ...process.env, XDG_CONFIG_HOME: configDir },
    stdio: 'ignore',
  });

  const page = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const pages = await response.json();
    return pages.find((item) => item.type === 'page' && item.url.endsWith('/dist/index.html'));
  }, 'Pumice page');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  if (outsideWatch) {
    await waitFor(async () => (await visibleText()).includes('Open note'), 'folder index');
    await evaluate("document.querySelector('#markdown-left a[data-internal]').click()");
  }
  try {
    await waitFor(async () => (await visibleText()).includes('Initial note'), 'initial render');
  } catch (err) {
    const body = await evaluate('document.body.innerText.slice(0, 500)');
    const state = await evaluate('({ready: document.readyState, preload: !!window.pumice, path: location.href})');
    throw new Error(`${err.message}; state=${JSON.stringify(state)}; body=${JSON.stringify(body)}`);
  }

  await fs.writeFile(filePath, '# Direct edit\n');
  await waitFor(async () => (await visibleText()).includes('Direct edit'), 'direct edit');

  const replacement = path.join(tempDir, '.note.md.tmp');
  await fs.writeFile(replacement, '# Atomic replacement\n');
  await fs.rename(replacement, filePath);
  await waitFor(async () => (await visibleText()).includes('Atomic replacement'), 'atomic replacement');

  await fs.unlink(filePath);
  await pause(200);
  await fs.writeFile(filePath, '# Delayed replacement\n');
  await waitFor(async () => (await visibleText()).includes('Delayed replacement'), 'delayed replacement');

  await evaluate("document.querySelector('#btn-mode').click()");
  await waitFor(async () => (await evaluate("document.querySelector('#editor-left .cm-content')?.innerText || ''")).includes('Delayed replacement'), 'edit mode');
  await fs.writeFile(filePath, '# External editor update\n');
  await waitFor(async () => (await evaluate("document.querySelector('#editor-left .cm-content')?.innerText || ''")).includes('External editor update'), 'clean editor update');
  await pause(500);
  if (await fs.readFile(filePath, 'utf8') !== '# External editor update\n') {
    throw new Error('Pumice overwrote the external edit');
  }

  await evaluate("document.querySelector('#editor-left .cm-content').focus()");
  await command('Input.insertText', { text: 'Local draft ' });
  await waitFor(async () => (await evaluate("document.querySelector('#editor-left .cm-content')?.innerText || ''")).includes('Local draft'), 'local draft');
  await fs.writeFile(filePath, '# Conflicting external update\n');
  await waitFor(async () => (await evaluate("document.querySelector('#editor-left .external-change-notice')?.innerText || ''")).includes('changed on disk'), 'conflict notice');
  if (await fs.readFile(filePath, 'utf8') !== '# Conflicting external update\n') {
    throw new Error('Pumice overwrote a conflicting external edit');
  }
  await evaluate("document.querySelector('#editor-left .external-change-notice button').click()");
  await waitFor(async () => (await evaluate("document.querySelector('#editor-left .cm-content')?.innerText || ''")).includes('Conflicting external update'), 'conflict reload');
  if (await evaluate("!!document.querySelector('#editor-left .external-change-notice')")) {
    throw new Error('Conflict notice remained after loading the disk version');
  }

  console.log(`Live Pumice ${outsideWatch ? 'outside-watch' : 'file-mode'} window updated after direct, atomic, delayed replacement, and clean-editor edits; conflicting edits were preserved.`);
} finally {
  socket?.close();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), pause(3000)]);
  }
  await fs.rm(tempDir, { recursive: true, force: true });
}
