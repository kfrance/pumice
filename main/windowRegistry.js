/**
 * Tracks open windows and coalesces concurrent open requests for the same key.
 */
export function createWindowRegistry() {
  /** @type {Map<string, import('electron').BrowserWindow>} */
  const windowsByKey = new Map();
  /** @type {Map<string, Promise<import('electron').BrowserWindow|null>>} */
  const pendingOpens = new Map();

  function focusWindow(win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function trackWindow(key, win) {
    windowsByKey.set(key, win);
    win.on('closed', () => {
      if (windowsByKey.get(key) === win) {
        windowsByKey.delete(key);
      }
    });
  }

  async function openOrFocus(key, openFn) {
    const existing = windowsByKey.get(key);
    if (existing && !existing.isDestroyed()) {
      focusWindow(existing);
      return existing;
    }

    const pending = pendingOpens.get(key);
    if (pending) return pending;

    const openPromise = (async () => {
      try {
        const current = windowsByKey.get(key);
        if (current && !current.isDestroyed()) {
          focusWindow(current);
          return current;
        }

        const win = await openFn();
        if (!win) return null;

        trackWindow(key, win);
        return win;
      } finally {
        pendingOpens.delete(key);
      }
    })();

    pendingOpens.set(key, openPromise);
    return openPromise;
  }

  return { openOrFocus, focusWindow, trackWindow, windowsByKey, pendingOpens };
}