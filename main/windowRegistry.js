/**
 * Show a window on the workspace the user is using.
 *
 * A long-lived process otherwise keeps new and focused windows on the
 * workspace where its first window was placed. On Linux, pinning to every
 * workspace for the show/focus call makes the compositor retarget the
 * window, then the pin is removed so it stays on that one workspace.
 */
export function presentOnCurrentWorkspace(win, platform = process.platform) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  const retarget = platform === 'linux' && typeof win.setVisibleOnAllWorkspaces === 'function';
  if (retarget) win.setVisibleOnAllWorkspaces(true);
  win.show();
  win.focus();
  if (retarget) win.setVisibleOnAllWorkspaces(false);
}

/**
 * Tracks open windows and coalesces concurrent open requests for the same key.
 */
export function createWindowRegistry() {
  /** @type {Map<string, import('electron').BrowserWindow>} */
  const windowsByKey = new Map();
  /** @type {Map<string, Promise<import('electron').BrowserWindow|null>>} */
  const pendingOpens = new Map();

  function focusWindow(win) {
    presentOnCurrentWorkspace(win);
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