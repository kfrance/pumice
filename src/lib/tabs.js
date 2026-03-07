/**
 * Tab state manager.
 * Each pane (left/right) has its own tab list.
 */
export class TabManager {
  constructor() {
    // paneId -> { tabs: Tab[], activeIndex: number }
    this.panes = {
      left: { tabs: [], activeIndex: -1 },
    };
    this.listeners = [];
  }

  /** Subscribe to tab changes */
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  _notify(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** Ensure a pane exists */
  _ensurePane(paneId) {
    if (!this.panes[paneId]) {
      this.panes[paneId] = { tabs: [], activeIndex: -1 };
    }
  }

  /** Get the active tab for a pane */
  getActive(paneId = 'left') {
    const pane = this.panes[paneId];
    if (!pane || pane.activeIndex < 0) return null;
    return pane.tabs[pane.activeIndex] || null;
  }

  /** Get all tabs for a pane */
  getTabs(paneId = 'left') {
    return this.panes[paneId]?.tabs || [];
  }

  /**
   * Open a file in a tab.
   * If already open in this pane, switch to it.
   * Otherwise, create a new tab.
   */
  open(filePath, paneId = 'left') {
    this._ensurePane(paneId);
    const pane = this.panes[paneId];

    // Check if already open
    const existingIndex = pane.tabs.findIndex(t => t.path === filePath);
    if (existingIndex >= 0) {
      pane.activeIndex = existingIndex;
      this._notify({ type: 'activated', paneId, tab: pane.tabs[existingIndex] });
      return pane.tabs[existingIndex];
    }

    // Create new tab
    const tab = {
      path: filePath,
      name: filePath.split('/').pop() || filePath,
      scrollTop: 0,
      mode: 'read', // 'read' or 'edit'
    };

    pane.tabs.push(tab);
    pane.activeIndex = pane.tabs.length - 1;
    this._notify({ type: 'opened', paneId, tab });
    return tab;
  }

  /**
   * Close a tab by path.
   * Returns the new active tab or null.
   */
  close(filePath, paneId = 'left') {
    const pane = this.panes[paneId];
    if (!pane) return null;

    const index = pane.tabs.findIndex(t => t.path === filePath);
    if (index < 0) return null;

    const closedTab = pane.tabs.splice(index, 1)[0];

    // Adjust active index
    if (pane.tabs.length === 0) {
      pane.activeIndex = -1;
    } else if (pane.activeIndex >= pane.tabs.length) {
      pane.activeIndex = pane.tabs.length - 1;
    } else if (pane.activeIndex > index) {
      pane.activeIndex--;
    } else if (pane.activeIndex === index) {
      // Stay at same index (now points to next tab) or go back
      pane.activeIndex = Math.min(index, pane.tabs.length - 1);
    }

    this._notify({ type: 'closed', paneId, tab: closedTab });
    if (pane.activeIndex >= 0) {
      this._notify({ type: 'activated', paneId, tab: pane.tabs[pane.activeIndex] });
    }

    return this.getActive(paneId);
  }

  /** Switch to a specific tab by index */
  activate(index, paneId = 'left') {
    const pane = this.panes[paneId];
    if (!pane || index < 0 || index >= pane.tabs.length) return null;

    pane.activeIndex = index;
    this._notify({ type: 'activated', paneId, tab: pane.tabs[index] });
    return pane.tabs[index];
  }

  /** Update scroll position for the active tab */
  updateScroll(scrollTop, paneId = 'left') {
    const tab = this.getActive(paneId);
    if (tab) tab.scrollTop = scrollTop;
  }

  /** Toggle read/edit mode for the active tab */
  toggleMode(paneId = 'left') {
    const tab = this.getActive(paneId);
    if (!tab) return null;
    tab.mode = tab.mode === 'read' ? 'edit' : 'read';
    this._notify({ type: 'modeChanged', paneId, tab });
    return tab;
  }

  /** Set mode explicitly */
  setMode(mode, paneId = 'left') {
    const tab = this.getActive(paneId);
    if (!tab) return null;
    tab.mode = mode;
    this._notify({ type: 'modeChanged', paneId, tab });
    return tab;
  }

  /** Enable split pane */
  enableSplit() {
    this._ensurePane('right');
    this._notify({ type: 'splitChanged', split: true });
  }

  /** Disable split pane */
  disableSplit() {
    // Move right pane tabs to left
    if (this.panes.right) {
      // Close all right pane tabs (they can re-open in left)
      delete this.panes.right;
    }
    this._notify({ type: 'splitChanged', split: false });
  }

  /** Check if split is active */
  isSplit() {
    return !!this.panes.right;
  }

  /** Serialize state for session saving */
  serialize() {
    const result = {};
    for (const [paneId, pane] of Object.entries(this.panes)) {
      result[paneId] = {
        tabs: pane.tabs.map(t => ({ path: t.path, scrollTop: t.scrollTop })),
        activeIndex: pane.activeIndex,
      };
    }
    return result;
  }

  /** Restore from serialized state */
  restore(state) {
    for (const [paneId, paneState] of Object.entries(state)) {
      this._ensurePane(paneId);
      this.panes[paneId].tabs = paneState.tabs.map(t => ({
        path: t.path,
        name: t.path.split('/').pop() || t.path,
        scrollTop: t.scrollTop || 0,
        mode: 'read',
      }));
      this.panes[paneId].activeIndex = paneState.activeIndex ?? -1;
    }
    this._notify({ type: 'restored' });
  }
}
