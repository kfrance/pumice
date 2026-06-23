import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import grayMatter from 'gray-matter';

/** Directories to always skip during discovery */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '__pycache__',
]);

/** Returns true if a directory name should be skipped */
function shouldExcludeDir(name) {
  return name.startsWith('.') || EXCLUDED_DIRS.has(name);
}

/**
 * Recursively discover all .md files under a root directory.
 * Skips dot-directories, node_modules, __pycache__.
 * Returns array of absolute paths.
 */
export async function discoverFiles(rootDir) {
  const results = [];
  const startTime = performance.now();

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }

    const promises = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!shouldExcludeDir(entry.name)) {
          promises.push(walk(path.join(dir, entry.name)));
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.join(dir, entry.name));
      }
    }
    await Promise.all(promises);
  }

  await walk(rootDir);
  const elapsed = performance.now() - startTime;
  return { files: results.sort(), elapsed };
}

/**
 * Read a markdown file and return its content and metadata.
 */
export async function readFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const stat = await fs.stat(filePath);
  return { content, mtime: stat.mtimeMs, path: filePath };
}

/**
 * Write content to a file.
 */
export async function writeFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Extract standard markdown links from content.
 * Returns array of link targets (the path portion).
 * Matches [text](path.md) and [text](path.md#anchor) style links.
 */
export function extractMarkdownLinks(content) {
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  const links = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const target = match[2];
    // Skip external URLs, anchors-only, and data URIs
    if (target.startsWith('http://') || target.startsWith('https://') ||
        target.startsWith('#') || target.startsWith('data:') ||
        target.startsWith('mailto:')) {
      continue;
    }
    // Strip anchor portion for backlink resolution
    const pathPart = target.split('#')[0];
    if (pathPart && pathPart.endsWith('.md')) {
      links.push(pathPart);
    }
  }
  return links;
}

/**
 * Build a backlinks index for all files.
 * Returns a Map: targetAbsPath → Set of sourceAbsPaths that link to it.
 * Also logs timing.
 */
export async function buildBacklinksIndex(files, rootDir) {
  const startTime = performance.now();
  // forwardLinks: source → [resolved target paths]
  const backlinks = new Map();

  // Initialize all files with empty sets
  for (const file of files) {
    backlinks.set(file, new Set());
  }

  // Build a set of known files for quick lookup
  const knownFiles = new Set(files);

  await Promise.all(files.map(async (filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const links = extractMarkdownLinks(content);
      const fileDir = path.dirname(filePath);

      for (const link of links) {
        const resolved = path.resolve(fileDir, link);
        if (knownFiles.has(resolved)) {
          backlinks.get(resolved).add(filePath);
        }
      }
    } catch {
      // Skip unreadable files
    }
  }));

  const elapsed = performance.now() - startTime;
  console.log(`[pumice] Backlink scan: ${files.length} files in ${elapsed.toFixed(1)}ms`);
  return { backlinks, elapsed };
}

/**
 * Update the backlinks index for a single changed file.
 * Removes old outgoing links from source, re-scans, adds new ones.
 */
export async function updateBacklinksForFile(filePath, backlinks, knownFiles) {
  const fileDir = path.dirname(filePath);

  // Remove this file as a source from all targets
  for (const [, sources] of backlinks) {
    sources.delete(filePath);
  }

  // Re-scan the file
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const links = extractMarkdownLinks(content);

    for (const link of links) {
      const resolved = path.resolve(fileDir, link);
      if (knownFiles.has(resolved)) {
        if (!backlinks.has(resolved)) {
          backlinks.set(resolved, new Set());
        }
        backlinks.get(resolved).add(filePath);
      }
    }
  } catch {
    // File may have been deleted
  }
}

const WATCHER_OPTIONS = {
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50,
  },
};

export function hashFileContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function snapshotFile(filePath, stat) {
  const content = await fs.readFile(filePath, 'utf-8');
  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    hash: hashFileContent(content),
  };
}

/**
 * Build a map of absolute file paths to last-known file snapshots.
 */
export async function buildMtimeCache(files) {
  const cache = new Map();
  await Promise.all(files.map(async (filePath) => {
    try {
      const stat = await fs.stat(filePath);
      cache.set(filePath, await snapshotFile(filePath, stat));
    } catch {
      // Skip unreadable files
    }
  }));
  return cache;
}

/**
 * Returns true when file metadata or content differs from the cached snapshot.
 * When metadata is unchanged, compares a content hash to ignore spurious events.
 */
export async function hasFileChanged(filePath, mtimeCache) {
  try {
    const stat = await fs.stat(filePath);
    const previous = mtimeCache.get(filePath);
    const current = await snapshotFile(filePath, stat);

    if (
      previous?.mtimeMs === current.mtimeMs
      && previous?.size === current.size
      && previous?.hash === current.hash
    ) {
      return false;
    }

    mtimeCache.set(filePath, current);
    return !previous
      || previous.mtimeMs !== current.mtimeMs
      || previous.size !== current.size
      || previous.hash !== current.hash;
  } catch {
    return false;
  }
}

/**
 * Create a file watcher for a directory tree.
 * Returns a chokidar watcher instance.
 */
export function createWatcher(rootDir) {
  return chokidar.watch(rootDir, {
    ...WATCHER_OPTIONS,
    ignored: (filePath, stats) => {
      const basename = path.basename(filePath);
      // Skip excluded directories
      if (stats?.isDirectory()) {
        return shouldExcludeDir(basename);
      }
      // Only watch .md files
      if (stats?.isFile()) {
        return !basename.endsWith('.md');
      }
      return false;
    },
  });
}

/**
 * Create a file watcher for a single file.
 * Returns a chokidar watcher instance.
 */
export function createFileWatcher(filePath) {
  return chokidar.watch(filePath, WATCHER_OPTIONS);
}

export { shouldExcludeDir, EXCLUDED_DIRS };
