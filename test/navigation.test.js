import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Navigation history logic — extracted for testability.
 * This mirrors the navHistory implementation in renderer.js.
 */
function createNavHistory() {
  const history = { stack: [], index: -1 };

  return {
    push(filePath) {
      if (history.index < history.stack.length - 1) {
        history.stack = history.stack.slice(0, history.index + 1);
      }
      if (history.stack[history.index] !== filePath) {
        history.stack.push(filePath);
        history.index = history.stack.length - 1;
      }
    },

    back() {
      if (history.index <= 0) return null;
      history.index--;
      return history.stack[history.index];
    },

    forward() {
      if (history.index >= history.stack.length - 1) return null;
      history.index++;
      return history.stack[history.index];
    },

    canGoBack() {
      return history.index > 0;
    },

    canGoForward() {
      return history.index < history.stack.length - 1;
    },

    current() {
      return history.stack[history.index] || null;
    },

    get stack() { return [...history.stack]; },
    get index() { return history.index; },
  };
}

describe('Navigation History', () => {
  let nav;

  beforeEach(() => {
    nav = createNavHistory();
  });

  it('starts with no history', () => {
    expect(nav.canGoBack()).toBe(false);
    expect(nav.canGoForward()).toBe(false);
    expect(nav.current()).toBeNull();
  });

  it('tracks visited files', () => {
    nav.push('/a.md');
    expect(nav.current()).toBe('/a.md');

    nav.push('/b.md');
    expect(nav.current()).toBe('/b.md');

    nav.push('/c.md');
    expect(nav.current()).toBe('/c.md');
    expect(nav.stack).toEqual(['/a.md', '/b.md', '/c.md']);
  });

  it('goes back through history', () => {
    nav.push('/a.md');
    nav.push('/b.md');
    nav.push('/c.md');

    expect(nav.canGoBack()).toBe(true);
    expect(nav.back()).toBe('/b.md');
    expect(nav.current()).toBe('/b.md');

    expect(nav.back()).toBe('/a.md');
    expect(nav.current()).toBe('/a.md');

    // Can't go further back
    expect(nav.canGoBack()).toBe(false);
    expect(nav.back()).toBeNull();
  });

  it('goes forward after going back', () => {
    nav.push('/a.md');
    nav.push('/b.md');
    nav.push('/c.md');

    nav.back(); // → /b.md
    nav.back(); // → /a.md

    expect(nav.canGoForward()).toBe(true);
    expect(nav.forward()).toBe('/b.md');
    expect(nav.forward()).toBe('/c.md');

    // Can't go further forward
    expect(nav.canGoForward()).toBe(false);
    expect(nav.forward()).toBeNull();
  });

  it('truncates forward history when navigating to a new file after going back', () => {
    nav.push('/a.md');
    nav.push('/b.md');
    nav.push('/c.md');

    nav.back(); // → /b.md
    nav.back(); // → /a.md

    // Navigate to a new file — should discard /b.md and /c.md forward history
    nav.push('/d.md');

    expect(nav.stack).toEqual(['/a.md', '/d.md']);
    expect(nav.canGoForward()).toBe(false);
    expect(nav.canGoBack()).toBe(true);
    expect(nav.back()).toBe('/a.md');
  });

  it('does not push duplicate of the current file', () => {
    nav.push('/a.md');
    nav.push('/a.md');
    nav.push('/a.md');

    expect(nav.stack).toEqual(['/a.md']);
    expect(nav.canGoBack()).toBe(false);
  });

  it('handles back and forward with only two entries', () => {
    nav.push('/a.md');
    nav.push('/b.md');

    expect(nav.back()).toBe('/a.md');
    expect(nav.forward()).toBe('/b.md');
    expect(nav.back()).toBe('/a.md');
  });

  it('back returns null with only one entry', () => {
    nav.push('/a.md');
    expect(nav.back()).toBeNull();
  });
});

describe('Link Resolution', () => {
  // Mirror the resolvePath function from renderer.js
  function resolvePath(base, relative) {
    if (relative.startsWith('/')) return relative;
    const parts = base.split('/');
    for (const segment of relative.split('/')) {
      if (segment === '..') parts.pop();
      else if (segment !== '.') parts.push(segment);
    }
    return parts.join('/');
  }

  it('resolves a sibling file', () => {
    expect(resolvePath('/notes/gospel', 'other.md')).toBe('/notes/gospel/other.md');
  });

  it('resolves a relative path with ../', () => {
    expect(resolvePath('/notes/gospel/study', '../overview.md')).toBe('/notes/gospel/overview.md');
  });

  it('resolves a ./relative path', () => {
    expect(resolvePath('/notes', './sub/file.md')).toBe('/notes/sub/file.md');
  });

  it('resolves an absolute path unchanged', () => {
    expect(resolvePath('/notes/gospel', '/tmp/file.md')).toBe('/tmp/file.md');
  });

  it('resolves multiple ../  levels', () => {
    expect(resolvePath('/a/b/c/d', '../../x.md')).toBe('/a/b/x.md');
  });
});
