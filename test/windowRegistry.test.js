import { describe, it, expect, vi } from 'vitest';
import { createWindowRegistry } from '../main/windowRegistry.js';

function mockWindow(id) {
  let destroyed = false;
  return {
    id,
    isDestroyed: () => destroyed,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    on: vi.fn((event, cb) => {
      if (event === 'closed') mockWindow._close = cb;
    }),
    destroy: () => { destroyed = true; mockWindow._close?.(); },
  };
}

describe('window registry', () => {
  it('coalesces concurrent opens for the same key', async () => {
    const registry = createWindowRegistry();
    let opens = 0;

    const openFn = async () => {
      opens++;
      await new Promise((r) => setTimeout(r, 50));
      return mockWindow(1);
    };

    const [a, b] = await Promise.all([
      registry.openOrFocus('notes', openFn),
      registry.openOrFocus('notes', openFn),
    ]);

    expect(opens).toBe(1);
    expect(a).toBe(b);
  });

  it('focuses an existing window instead of opening again', async () => {
    const registry = createWindowRegistry();
    const win = mockWindow(1);

    await registry.openOrFocus('notes', async () => win);
    const openFn = vi.fn(async () => mockWindow(2));

    const result = await registry.openOrFocus('notes', openFn);

    expect(openFn).not.toHaveBeenCalled();
    expect(result).toBe(win);
    expect(win.focus).toHaveBeenCalled();
  });

  it('opens separate windows for different keys', async () => {
    const registry = createWindowRegistry();
    const first = mockWindow(1);
    const second = mockWindow(2);

    const a = await registry.openOrFocus('a', async () => first);
    const b = await registry.openOrFocus('b', async () => second);

    expect(a).toBe(first);
    expect(b).toBe(second);
  });
});