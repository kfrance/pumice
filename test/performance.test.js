import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { discoverFiles, buildBacklinksIndex } from '../main/fileManager.js';

const NOTES_DIR = path.join(os.homedir(), 'notes');

describe('Performance on real ~/notes directory', async () => {
  // Check if ~/notes exists before running
  let notesExist = false;
  try {
    await fs.access(NOTES_DIR);
    notesExist = true;
  } catch { /* skip */ }

  it.skipIf(!notesExist)('discovers ~2000 files in under 200ms', async () => {
    const { files, elapsed } = await discoverFiles(NOTES_DIR);
    console.log(`File discovery: ${files.length} files in ${elapsed.toFixed(1)}ms`);
    expect(files.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(200);
  });

  it.skipIf(!notesExist)('builds backlink index in under 2000ms', async () => {
    const { files } = await discoverFiles(NOTES_DIR);
    const { backlinks, elapsed } = await buildBacklinksIndex(files, NOTES_DIR);
    console.log(`Backlink scan: ${files.length} files in ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(2000);

    // Check that some backlinks were found
    let totalBacklinks = 0;
    for (const [, sources] of backlinks) {
      totalBacklinks += sources.size;
    }
    console.log(`Total backlinks found: ${totalBacklinks}`);
  });

  it.skipIf(!notesExist)('excludes dot-directories from results', async () => {
    const { files } = await discoverFiles(NOTES_DIR);
    const dotPaths = files.filter(f => {
      // Check if any path component starts with a dot
      const relative = f.replace(NOTES_DIR + '/', '');
      return relative.split('/').some(part => part.startsWith('.'));
    });
    expect(dotPaths).toHaveLength(0);
  });

  it.skipIf(!notesExist)('excludes node_modules from results', async () => {
    const { files } = await discoverFiles(NOTES_DIR);
    const nodeModulePaths = files.filter(f => f.includes('node_modules'));
    expect(nodeModulePaths).toHaveLength(0);
  });
});
