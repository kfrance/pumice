import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  discoverFiles,
  readFile,
  writeFile,
  extractMarkdownLinks,
  buildBacklinksIndex,
  updateBacklinksForFile,
  buildMtimeCache,
  hasFileChanged,
  shouldExcludeDir,
} from '../main/fileManager.js';

// Helper: create a temp directory with a file structure
async function createTempDir(structure) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pumice-test-'));
  await createStructure(tmpDir, structure);
  return tmpDir;
}

async function createStructure(base, structure) {
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(base, name);
    if (typeof content === 'object' && content !== null && !Buffer.isBuffer(content)) {
      await fs.mkdir(fullPath, { recursive: true });
      await createStructure(fullPath, content);
    } else {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content || '', 'utf-8');
    }
  }
}

async function removeTempDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

// ─── File Discovery ─────────────────────────────────────────────────────────

describe('File Discovery', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await removeTempDir(tmpDir);
  });

  it('finds all .md files in a flat directory', async () => {
    tmpDir = await createTempDir({
      'readme.md': '# Hello',
      'notes.md': '# Notes',
      'image.png': 'not markdown',
    });

    const { files } = await discoverFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).toContain('readme.md');
    expect(names).toContain('notes.md');
    expect(names).not.toContain('image.png');
  });

  it('finds .md files in nested directories', async () => {
    tmpDir = await createTempDir({
      'top.md': '# Top',
      'sub': {
        'nested.md': '# Nested',
        'deep': {
          'deeper.md': '# Deeper',
        },
      },
    });

    const { files } = await discoverFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).toContain('top.md');
    expect(names).toContain('nested.md');
    expect(names).toContain('deeper.md');
    expect(files).toHaveLength(3);
  });

  it('skips directories starting with a dot', async () => {
    tmpDir = await createTempDir({
      'visible.md': '# Visible',
      '.hidden': {
        'secret.md': '# Secret',
      },
      '.git': {
        'config.md': '# Git config',
      },
    });

    const { files } = await discoverFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).toContain('visible.md');
    expect(names).not.toContain('secret.md');
    expect(names).not.toContain('config.md');
    expect(files).toHaveLength(1);
  });

  it('skips node_modules and __pycache__', async () => {
    tmpDir = await createTempDir({
      'app.md': '# App',
      'node_modules': {
        'pkg': {
          'readme.md': '# Package readme',
        },
      },
      '__pycache__': {
        'cache.md': '# Cache',
      },
    });

    const { files } = await discoverFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).toContain('app.md');
    expect(names).not.toContain('readme.md');
    expect(names).not.toContain('cache.md');
    expect(files).toHaveLength(1);
  });

  it('returns an empty array for a directory with no .md files', async () => {
    tmpDir = await createTempDir({
      'image.png': 'binary',
      'data.json': '{}',
    });

    const { files } = await discoverFiles(tmpDir);
    expect(files).toHaveLength(0);
  });

  it('handles an empty directory', async () => {
    tmpDir = await createTempDir({});
    const { files } = await discoverFiles(tmpDir);
    expect(files).toHaveLength(0);
  });

  it('returns files sorted alphabetically', async () => {
    tmpDir = await createTempDir({
      'zebra.md': '',
      'alpha.md': '',
      'middle.md': '',
    });

    const { files } = await discoverFiles(tmpDir);
    const names = files.map(f => path.basename(f));
    expect(names).toEqual(['alpha.md', 'middle.md', 'zebra.md']);
  });

  it('reports timing information', async () => {
    tmpDir = await createTempDir({ 'test.md': '# Test' });
    const { elapsed } = await discoverFiles(tmpDir);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(typeof elapsed).toBe('number');
  });

  it('skips dot-dirs nested inside regular dirs', async () => {
    tmpDir = await createTempDir({
      'project': {
        'readme.md': '# Readme',
        '.obsidian': {
          'config.md': '# Obsidian config',
        },
      },
    });

    const { files } = await discoverFiles(tmpDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('readme.md');
  });
});

// ─── File Read/Write ────────────────────────────────────────────────────────

describe('File Read/Write', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await removeTempDir(tmpDir);
  });

  it('reads a file and returns its content and mtime', async () => {
    tmpDir = await createTempDir({
      'test.md': '# Hello World\n\nSome content here.',
    });

    const result = await readFile(path.join(tmpDir, 'test.md'));
    expect(result.content).toBe('# Hello World\n\nSome content here.');
    expect(result.mtime).toBeGreaterThan(0);
    expect(result.path).toContain('test.md');
  });

  it('writes a file and can read it back', async () => {
    tmpDir = await createTempDir({});
    const filePath = path.join(tmpDir, 'new.md');

    await writeFile(filePath, '# New File\n\nCreated by test.');
    const result = await readFile(filePath);
    expect(result.content).toBe('# New File\n\nCreated by test.');
  });

  it('creates parent directories when writing', async () => {
    tmpDir = await createTempDir({});
    const filePath = path.join(tmpDir, 'sub', 'deep', 'new.md');

    await writeFile(filePath, '# Deep file');
    const result = await readFile(filePath);
    expect(result.content).toBe('# Deep file');
  });
});

// ─── Markdown Link Extraction ───────────────────────────────────────────────

describe('Markdown Link Extraction', () => {
  it('extracts standard markdown links to .md files', () => {
    const content = 'See [other doc](./other.md) for details.';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual(['./other.md']);
  });

  it('extracts multiple links', () => {
    const content = `
      Check [doc1](doc1.md) and [doc2](../doc2.md).
      Also see [doc3](sub/doc3.md).
    `;
    const links = extractMarkdownLinks(content);
    expect(links).toEqual(['doc1.md', '../doc2.md', 'sub/doc3.md']);
  });

  it('strips anchor portions but still returns the file', () => {
    const content = 'See [heading](file.md#section-1) for details.';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual(['file.md']);
  });

  it('ignores external HTTP links', () => {
    const content = 'Visit [Google](https://google.com) and [HTTP](http://example.com).';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual([]);
  });

  it('ignores anchor-only links', () => {
    const content = 'Jump to [section](#my-heading).';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual([]);
  });

  it('ignores links to non-markdown files', () => {
    const content = 'See [image](photo.png) and [data](data.json).';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual([]);
  });

  it('ignores mailto and data URIs', () => {
    const content = '[email](mailto:test@test.com) and [data](data:text/plain;base64,abc)';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual([]);
  });

  it('handles links with spaces in link text', () => {
    const content = '[a long link title](./notes/my file.md)';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual(['./notes/my file.md']);
  });

  it('returns empty array for content with no links', () => {
    const content = '# Just a heading\n\nSome plain text.';
    const links = extractMarkdownLinks(content);
    expect(links).toEqual([]);
  });
});

// ─── Backlinks Index ────────────────────────────────────────────────────────

describe('Backlinks Index', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await removeTempDir(tmpDir);
  });

  it('builds a backlinks index showing which files link to which', async () => {
    tmpDir = await createTempDir({
      'a.md': 'See [b](b.md) for details.',
      'b.md': '# B\n\nSome content.',
      'c.md': 'Links to [b](b.md) and [a](a.md).',
    });

    const files = [
      path.join(tmpDir, 'a.md'),
      path.join(tmpDir, 'b.md'),
      path.join(tmpDir, 'c.md'),
    ];
    const { backlinks } = await buildBacklinksIndex(files, tmpDir);

    // b.md is linked to by a.md and c.md
    const bBacklinks = [...backlinks.get(path.join(tmpDir, 'b.md'))];
    expect(bBacklinks).toContain(path.join(tmpDir, 'a.md'));
    expect(bBacklinks).toContain(path.join(tmpDir, 'c.md'));
    expect(bBacklinks).toHaveLength(2);

    // a.md is linked to by c.md
    const aBacklinks = [...backlinks.get(path.join(tmpDir, 'a.md'))];
    expect(aBacklinks).toContain(path.join(tmpDir, 'c.md'));
    expect(aBacklinks).toHaveLength(1);

    // c.md has no backlinks
    const cBacklinks = [...backlinks.get(path.join(tmpDir, 'c.md'))];
    expect(cBacklinks).toHaveLength(0);
  });

  it('resolves relative links correctly across directories', async () => {
    tmpDir = await createTempDir({
      'docs': {
        'index.md': 'See [guide](../guides/setup.md).',
      },
      'guides': {
        'setup.md': '# Setup Guide',
      },
    });

    const files = [
      path.join(tmpDir, 'docs', 'index.md'),
      path.join(tmpDir, 'guides', 'setup.md'),
    ];
    const { backlinks } = await buildBacklinksIndex(files, tmpDir);

    const setupBacklinks = [...backlinks.get(path.join(tmpDir, 'guides', 'setup.md'))];
    expect(setupBacklinks).toContain(path.join(tmpDir, 'docs', 'index.md'));
  });

  it('reports timing information', async () => {
    tmpDir = await createTempDir({
      'test.md': '# Test',
    });

    const files = [path.join(tmpDir, 'test.md')];
    const { elapsed } = await buildBacklinksIndex(files, tmpDir);
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(typeof elapsed).toBe('number');
  });

  it('handles files with no links', async () => {
    tmpDir = await createTempDir({
      'a.md': '# Just a heading',
      'b.md': '# Another heading',
    });

    const files = [
      path.join(tmpDir, 'a.md'),
      path.join(tmpDir, 'b.md'),
    ];
    const { backlinks } = await buildBacklinksIndex(files, tmpDir);

    expect([...backlinks.get(path.join(tmpDir, 'a.md'))]).toHaveLength(0);
    expect([...backlinks.get(path.join(tmpDir, 'b.md'))]).toHaveLength(0);
  });

  it('ignores links to files not in the known file set', async () => {
    tmpDir = await createTempDir({
      'a.md': 'See [nonexistent](nonexistent.md).',
    });

    const files = [path.join(tmpDir, 'a.md')];
    const { backlinks } = await buildBacklinksIndex(files, tmpDir);
    // a.md links to nonexistent.md, but that file doesn't exist, so no backlinks
    expect([...backlinks.get(path.join(tmpDir, 'a.md'))]).toHaveLength(0);
  });
});

// ─── Incremental Backlink Updates ───────────────────────────────────────────

describe('Incremental Backlink Updates', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await removeTempDir(tmpDir);
  });

  it('updates backlinks when a file changes to add a new link', async () => {
    tmpDir = await createTempDir({
      'a.md': '# A',
      'b.md': '# B',
    });

    const files = [
      path.join(tmpDir, 'a.md'),
      path.join(tmpDir, 'b.md'),
    ];
    const { backlinks } = await buildBacklinksIndex(files, tmpDir);

    // Initially no backlinks
    expect([...backlinks.get(path.join(tmpDir, 'b.md'))]).toHaveLength(0);

    // Now a.md gets a link to b.md
    await fs.writeFile(path.join(tmpDir, 'a.md'), 'See [b](b.md).', 'utf-8');
    await updateBacklinksForFile(path.join(tmpDir, 'a.md'), backlinks, new Set(files));

    // Now b.md should have a backlink from a.md
    expect([...backlinks.get(path.join(tmpDir, 'b.md'))]).toContain(path.join(tmpDir, 'a.md'));
  });

  it('removes old backlinks when a file changes to remove a link', async () => {
    tmpDir = await createTempDir({
      'a.md': 'See [b](b.md).',
      'b.md': '# B',
    });

    const files = [
      path.join(tmpDir, 'a.md'),
      path.join(tmpDir, 'b.md'),
    ];
    const { backlinks } = await buildBacklinksIndex(files, tmpDir);

    // Initially b has backlink from a
    expect([...backlinks.get(path.join(tmpDir, 'b.md'))]).toHaveLength(1);

    // a.md removes the link
    await fs.writeFile(path.join(tmpDir, 'a.md'), '# A - no more links', 'utf-8');
    await updateBacklinksForFile(path.join(tmpDir, 'a.md'), backlinks, new Set(files));

    // Now b.md should have no backlinks
    expect([...backlinks.get(path.join(tmpDir, 'b.md'))]).toHaveLength(0);
  });
});

// ─── Directory Exclusion Rules ──────────────────────────────────────────────

describe('Directory Exclusion Rules', () => {
  it('excludes directories starting with a dot', () => {
    expect(shouldExcludeDir('.git')).toBe(true);
    expect(shouldExcludeDir('.obsidian')).toBe(true);
    expect(shouldExcludeDir('.venv')).toBe(true);
    expect(shouldExcludeDir('.hidden')).toBe(true);
  });

  it('excludes node_modules', () => {
    expect(shouldExcludeDir('node_modules')).toBe(true);
  });

  it('excludes __pycache__', () => {
    expect(shouldExcludeDir('__pycache__')).toBe(true);
  });

  it('allows normal directories', () => {
    expect(shouldExcludeDir('src')).toBe(false);
    expect(shouldExcludeDir('docs')).toBe(false);
    expect(shouldExcludeDir('gospel')).toBe(false);
    expect(shouldExcludeDir('life')).toBe(false);
  });
});

// ─── Mtime change detection ─────────────────────────────────────────────────

describe('Mtime change detection', () => {
  let tmpDir;

  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('builds a cache of mtimes for known files', async () => {
    tmpDir = await createTempDir({ 'a.md': '# A', 'b.md': '# B' });
    const files = [path.join(tmpDir, 'a.md'), path.join(tmpDir, 'b.md')];

    const cache = await buildMtimeCache(files);

    expect(cache.size).toBe(2);
    expect(cache.has(path.join(tmpDir, 'a.md'))).toBe(true);
    expect(cache.has(path.join(tmpDir, 'b.md'))).toBe(true);
  });

  it('returns false when mtime and size are unchanged', async () => {
    tmpDir = await createTempDir({ 'a.md': '# A' });
    const filePath = path.join(tmpDir, 'a.md');
    const cache = await buildMtimeCache([filePath]);

    expect(await hasFileChanged(filePath, cache)).toBe(false);
    expect(await hasFileChanged(filePath, cache)).toBe(false);
  });

  it('returns true and updates cache when mtime changes', async () => {
    tmpDir = await createTempDir({ 'a.md': '# A' });
    const filePath = path.join(tmpDir, 'a.md');
    const cache = await buildMtimeCache([filePath]);

    await fs.writeFile(filePath, '# Updated', 'utf-8');

    expect(await hasFileChanged(filePath, cache)).toBe(true);
    expect(await hasFileChanged(filePath, cache)).toBe(false);
  });

  it('detects content changes when mtime and size stay the same', async () => {
    tmpDir = await createTempDir({ 'a.md': '# A' });
    const filePath = path.join(tmpDir, 'a.md');
    const cache = await buildMtimeCache([filePath]);
    const stat = await fs.stat(filePath);

    await fs.writeFile(filePath, '# B', 'utf-8');
    await fs.utimes(filePath, stat.atime, stat.mtime);

    expect(await hasFileChanged(filePath, cache)).toBe(true);
  });

  it('suppresses spurious change events when mtime and size are unchanged', async () => {
    tmpDir = await createTempDir({ 'note.md': '# Note', 'data.json': '{}' });
    const mdPath = path.join(tmpDir, 'note.md');
    const cache = await buildMtimeCache([mdPath]);

    // Chokidar can emit change for note.md when data.json is edited; mtime stays put.
    await fs.writeFile(path.join(tmpDir, 'data.json'), '{"changed": true}', 'utf-8');

    expect(await hasFileChanged(mdPath, cache)).toBe(false);
  });
});
