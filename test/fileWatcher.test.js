import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createWatcher, createFileWatcher } from '../main/fileManager.js';

async function createTempDir(structure) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pumice-watcher-'));
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(tmpDir, name);
    if (typeof content === 'object' && content !== null) {
      await fs.mkdir(fullPath, { recursive: true });
      for (const [subName, subContent] of Object.entries(content)) {
        await fs.writeFile(path.join(fullPath, subName), subContent, 'utf-8');
      }
    } else {
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }
  return tmpDir;
}

describe('File Watcher', () => {
  let tmpDir;
  let watcher;

  afterEach(async () => {
    if (watcher) await watcher.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects when an existing .md file is modified', async () => {
    tmpDir = await createTempDir({ 'test.md': '# Original' });
    watcher = createWatcher(tmpDir);

    const changed = new Promise((resolve) => {
      watcher.on('change', (filePath) => resolve(filePath));
    });

    // Wait for watcher to be ready
    await new Promise((resolve) => watcher.on('ready', resolve));

    // Modify the file
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Modified', 'utf-8');

    const changedPath = await changed;
    expect(changedPath).toContain('test.md');
  });

  it('detects when a new .md file is created', async () => {
    tmpDir = await createTempDir({ 'existing.md': '# Existing' });
    watcher = createWatcher(tmpDir);

    const added = new Promise((resolve) => {
      watcher.on('add', (filePath) => resolve(filePath));
    });

    await new Promise((resolve) => watcher.on('ready', resolve));

    // Create a new file
    await fs.writeFile(path.join(tmpDir, 'new.md'), '# New', 'utf-8');

    const addedPath = await added;
    expect(addedPath).toContain('new.md');
  });

  it('detects when a .md file is deleted', async () => {
    tmpDir = await createTempDir({ 'delete-me.md': '# Delete me' });
    watcher = createWatcher(tmpDir);

    const removed = new Promise((resolve) => {
      watcher.on('unlink', (filePath) => resolve(filePath));
    });

    await new Promise((resolve) => watcher.on('ready', resolve));

    // Delete the file
    await fs.unlink(path.join(tmpDir, 'delete-me.md'));

    const removedPath = await removed;
    expect(removedPath).toContain('delete-me.md');
  });

  it('ignores changes to non-.md files', async () => {
    // No sibling .md files — directory writes can spuriously notify them on macOS.
    tmpDir = await createTempDir({ 'data.json': '{}' });
    watcher = createWatcher(tmpDir);

    await new Promise((resolve) => watcher.on('ready', resolve));

    const changes = [];
    watcher.on('change', (p) => changes.push(p));

    await fs.writeFile(path.join(tmpDir, 'data.json'), '{"changed": true}', 'utf-8');

    await new Promise(r => setTimeout(r, 300));
    expect(changes).toEqual([]);
  });

  it('detects when a single watched file is modified', async () => {
    tmpDir = await createTempDir({ 'solo.md': '# Original' });
    const filePath = path.join(tmpDir, 'solo.md');
    watcher = createFileWatcher(filePath);

    const changed = new Promise((resolve) => {
      watcher.on('change', (changedPath) => resolve(changedPath));
    });

    await new Promise((resolve) => watcher.on('ready', resolve));

    await fs.writeFile(filePath, '# Modified', 'utf-8');

    const changedPath = await changed;
    expect(changedPath).toBe(filePath);
  });

  it('detects when a single watched file is deleted', async () => {
    tmpDir = await createTempDir({ 'solo.md': '# Delete me' });
    const filePath = path.join(tmpDir, 'solo.md');
    watcher = createFileWatcher(filePath);

    const removed = new Promise((resolve) => {
      watcher.on('unlink', (removedPath) => resolve(removedPath));
    });

    await new Promise((resolve) => watcher.on('ready', resolve));

    await fs.unlink(filePath);

    const removedPath = await removed;
    expect(removedPath).toBe(filePath);
  });

  it('ignores files in dot directories', async () => {
    // No sibling .md files at the root — same macOS spurious-change caveat as above.
    tmpDir = await createTempDir({
      '.hidden': { 'secret.md': '# Secret' },
    });
    watcher = createWatcher(tmpDir);

    await new Promise((resolve) => watcher.on('ready', resolve));

    const changes = [];
    watcher.on('change', (p) => changes.push(p));

    await fs.writeFile(path.join(tmpDir, '.hidden', 'secret.md'), '# Modified secret', 'utf-8');

    await new Promise(r => setTimeout(r, 300));
    expect(changes).toEqual([]);
  });
});
