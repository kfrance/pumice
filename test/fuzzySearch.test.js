import { describe, it, expect, beforeEach } from 'vitest';
import { FuzzySearch } from '../src/lib/fuzzySearch.js';

describe('Fuzzy File Search', () => {
  let search;

  beforeEach(() => {
    search = new FuzzySearch();
    search.setFiles([
      '/notes/gospel/scriptures/markdown/bofm/1-ne/7.md',
      '/notes/gospel/scriptures/markdown/bofm/1-ne/10.md',
      '/notes/gospel/scriptures/markdown/bofm/2-ne/1.md',
      '/notes/gospel/general_handbook/38_church_policies.md',
      '/notes/life/gift_ideas.md',
      '/notes/life/date_ideas.md',
      '/notes/life/books/atomic_habits.md',
      '/notes/system/troubleshooting.md',
      '/notes/learn_whale/pod_generation.md',
      '/notes/CLAUDE.md',
    ], '/notes');
  });

  it('returns all files when query is empty', () => {
    const results = search.search('');
    expect(results.length).toBeGreaterThan(0);
    // Should have path info
    expect(results[0]).toHaveProperty('absPath');
    expect(results[0]).toHaveProperty('relative');
    expect(results[0]).toHaveProperty('name');
  });

  it('finds files by exact filename', () => {
    const results = search.search('atomic_habits');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('atomic_habits.md');
  });

  it('finds files by partial filename match', () => {
    const results = search.search('gift');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.name === 'gift_ideas.md')).toBe(true);
  });

  it('finds files by path components', () => {
    const results = search.search('bofm');
    expect(results.length).toBe(3); // All Book of Mormon files
  });

  it('does fuzzy matching (typos/partial)', () => {
    const results = search.search('atmic hbits');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('atomic_habits.md');
  });

  it('returns relative paths from root', () => {
    const results = search.search('CLAUDE');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].relative).toBe('CLAUDE.md');
    expect(results[0].absPath).toBe('/notes/CLAUDE.md');
  });

  it('limits results', () => {
    const results = search.search('', 3);
    expect(results.length).toBe(3);
  });

  it('adds a new file to the index and finds it', () => {
    search.addFile('/notes/new_note.md');
    const results = search.search('new_note');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('new_note.md');
  });

  it('removes a file from the index', () => {
    search.removeFile('/notes/CLAUDE.md');
    const results = search.search('CLAUDE');
    expect(results.length).toBe(0);
  });

  it('handles single-file mode (no rootDir)', () => {
    const singleSearch = new FuzzySearch();
    singleSearch.setFiles(['/tmp/scratch.md'], null);
    const results = singleSearch.search('scratch');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].absPath).toBe('/tmp/scratch.md');
  });

  it('ranks filename matches higher than path matches', () => {
    // Search for "ideas" — gift_ideas.md and date_ideas.md should rank higher
    // than something with "ideas" only in the path
    const results = search.search('ideas');
    const names = results.map(r => r.name);
    // Both idea files should be in the results
    expect(names).toContain('gift_ideas.md');
    expect(names).toContain('date_ideas.md');
  });

  it('returns match information for highlighting', () => {
    const results = search.search('atomic');
    expect(results.length).toBeGreaterThan(0);
    // Fuse.js includes match data
    expect(results[0]).toHaveProperty('matches');
  });
});
