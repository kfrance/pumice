import Fuse from 'fuse.js';

/**
 * Fuzzy file search powered by fuse.js.
 * Operates on relative file paths for display.
 */
export class FuzzySearch {
  constructor() {
    this.fuse = null;
    this.items = [];
    this.rootDir = null;
  }

  /**
   * Initialize with file paths and root directory.
   * Paths are stored both as absolute and relative (for display/search).
   */
  setFiles(files, rootDir) {
    this.rootDir = rootDir;
    this.items = files.map(absPath => {
      const relative = rootDir ? absPath.replace(rootDir + '/', '') : absPath;
      const name = absPath.split('/').pop();
      return { absPath, relative, name };
    });

    this.fuse = new Fuse(this.items, {
      keys: [
        { name: 'name', weight: 0.6 },
        { name: 'relative', weight: 0.4 },
      ],
      threshold: 0.4,
      distance: 200,
      includeMatches: true,
      minMatchCharLength: 1,
    });
  }

  /** Add a single file to the index */
  addFile(absPath) {
    const relative = this.rootDir ? absPath.replace(this.rootDir + '/', '') : absPath;
    const name = absPath.split('/').pop();
    const item = { absPath, relative, name };
    this.items.push(item);

    // Rebuild fuse index (it's cheap for 2000 items)
    this.fuse = new Fuse(this.items, {
      keys: [
        { name: 'name', weight: 0.6 },
        { name: 'relative', weight: 0.4 },
      ],
      threshold: 0.4,
      distance: 200,
      includeMatches: true,
      minMatchCharLength: 1,
    });
  }

  /** Remove a file from the index */
  removeFile(absPath) {
    this.items = this.items.filter(item => item.absPath !== absPath);
    if (this.fuse) {
      this.fuse = new Fuse(this.items, {
        keys: [
          { name: 'name', weight: 0.6 },
          { name: 'relative', weight: 0.4 },
        ],
        threshold: 0.4,
        distance: 200,
        includeMatches: true,
        minMatchCharLength: 1,
      });
    }
  }

  /**
   * Search for files matching query.
   * Returns array of { absPath, relative, name, matches }.
   * If query is empty, returns all files (sorted alphabetically).
   */
  search(query, limit = 30) {
    if (!query || !query.trim()) {
      return this.items.slice(0, limit).map(item => ({
        ...item,
        matches: [],
      }));
    }

    if (!this.fuse) return [];

    return this.fuse.search(query, { limit }).map(result => ({
      absPath: result.item.absPath,
      relative: result.item.relative,
      name: result.item.name,
      matches: result.matches || [],
    }));
  }
}
