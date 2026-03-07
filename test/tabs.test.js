import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabManager } from '../src/lib/tabs.js';

describe('Tab Management', () => {
  let tabs;

  beforeEach(() => {
    tabs = new TabManager();
  });

  // ─── Opening Tabs ──────────────────────────────────────────────────────

  it('opens a file as a new tab', () => {
    const tab = tabs.open('/notes/test.md');
    expect(tab.path).toBe('/notes/test.md');
    expect(tab.name).toBe('test.md');
    expect(tabs.getTabs().length).toBe(1);
  });

  it('sets the opened tab as active', () => {
    tabs.open('/notes/a.md');
    tabs.open('/notes/b.md');
    expect(tabs.getActive().path).toBe('/notes/b.md');
  });

  it('reuses an existing tab when opening the same file', () => {
    tabs.open('/notes/test.md');
    tabs.open('/notes/other.md');
    tabs.open('/notes/test.md');
    expect(tabs.getTabs().length).toBe(2); // Not 3
    expect(tabs.getActive().path).toBe('/notes/test.md');
  });

  it('opens multiple different files as separate tabs', () => {
    tabs.open('/a.md');
    tabs.open('/b.md');
    tabs.open('/c.md');
    expect(tabs.getTabs().length).toBe(3);
  });

  // ─── Closing Tabs ─────────────────────────────────────────────────────

  it('closes a tab and activates the next one', () => {
    tabs.open('/a.md');
    tabs.open('/b.md');
    tabs.open('/c.md');
    tabs.activate(1); // activate b.md

    tabs.close('/b.md');
    expect(tabs.getTabs().length).toBe(2);
    // Should activate c.md (was at index 2, now at index 1)
    expect(tabs.getActive().path).toBe('/c.md');
  });

  it('closes the last tab and activates the previous one', () => {
    tabs.open('/a.md');
    tabs.open('/b.md');
    // b.md is active (index 1)

    tabs.close('/b.md');
    expect(tabs.getActive().path).toBe('/a.md');
  });

  it('returns null when all tabs are closed', () => {
    tabs.open('/a.md');
    tabs.close('/a.md');
    expect(tabs.getActive()).toBeNull();
    expect(tabs.getTabs().length).toBe(0);
  });

  it('does nothing when closing a non-existent tab', () => {
    tabs.open('/a.md');
    const result = tabs.close('/nonexistent.md');
    expect(result).toBeNull();
    expect(tabs.getTabs().length).toBe(1);
  });

  // ─── Activating Tabs ──────────────────────────────────────────────────

  it('activates a tab by index', () => {
    tabs.open('/a.md');
    tabs.open('/b.md');
    tabs.open('/c.md');

    tabs.activate(0);
    expect(tabs.getActive().path).toBe('/a.md');

    tabs.activate(2);
    expect(tabs.getActive().path).toBe('/c.md');
  });

  it('returns null for invalid index', () => {
    tabs.open('/a.md');
    expect(tabs.activate(-1)).toBeNull();
    expect(tabs.activate(5)).toBeNull();
  });

  // ─── Scroll Position ─────────────────────────────────────────────────

  it('tracks scroll position per tab', () => {
    tabs.open('/a.md');
    tabs.updateScroll(100);
    tabs.open('/b.md');
    tabs.updateScroll(200);

    tabs.activate(0);
    expect(tabs.getActive().scrollTop).toBe(100);

    tabs.activate(1);
    expect(tabs.getActive().scrollTop).toBe(200);
  });

  // ─── Read/Edit Mode ──────────────────────────────────────────────────

  it('starts in read mode', () => {
    tabs.open('/a.md');
    expect(tabs.getActive().mode).toBe('read');
  });

  it('toggles between read and edit mode', () => {
    tabs.open('/a.md');

    tabs.toggleMode();
    expect(tabs.getActive().mode).toBe('edit');

    tabs.toggleMode();
    expect(tabs.getActive().mode).toBe('read');
  });

  it('mode is per-tab, not global', () => {
    tabs.open('/a.md');
    tabs.toggleMode(); // a is now in edit mode

    tabs.open('/b.md'); // b starts in read mode
    expect(tabs.getActive().mode).toBe('read');

    tabs.activate(0); // back to a
    expect(tabs.getActive().mode).toBe('edit');
  });

  it('sets mode explicitly', () => {
    tabs.open('/a.md');
    tabs.setMode('edit');
    expect(tabs.getActive().mode).toBe('edit');
    tabs.setMode('read');
    expect(tabs.getActive().mode).toBe('read');
  });

  // ─── Event Listeners ─────────────────────────────────────────────────

  it('notifies listeners when a tab is opened', () => {
    const listener = vi.fn();
    tabs.onChange(listener);

    tabs.open('/a.md');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'opened', paneId: 'left' })
    );
  });

  it('notifies listeners when a tab is closed', () => {
    tabs.open('/a.md');
    const listener = vi.fn();
    tabs.onChange(listener);

    tabs.close('/a.md');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'closed', paneId: 'left' })
    );
  });

  it('notifies listeners when a tab is activated', () => {
    tabs.open('/a.md');
    tabs.open('/b.md');
    const listener = vi.fn();
    tabs.onChange(listener);

    tabs.activate(0);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'activated', paneId: 'left' })
    );
  });

  it('allows unsubscribing from events', () => {
    const listener = vi.fn();
    const unsubscribe = tabs.onChange(listener);

    tabs.open('/a.md');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    tabs.open('/b.md');
    expect(listener).toHaveBeenCalledTimes(1); // Not called again
  });

  // ─── Split Panes ─────────────────────────────────────────────────────

  it('starts without split', () => {
    expect(tabs.isSplit()).toBe(false);
  });

  it('enables and disables split pane', () => {
    tabs.enableSplit();
    expect(tabs.isSplit()).toBe(true);

    tabs.disableSplit();
    expect(tabs.isSplit()).toBe(false);
  });

  it('manages tabs independently per pane', () => {
    tabs.enableSplit();

    tabs.open('/a.md', 'left');
    tabs.open('/b.md', 'right');

    expect(tabs.getActive('left').path).toBe('/a.md');
    expect(tabs.getActive('right').path).toBe('/b.md');
    expect(tabs.getTabs('left').length).toBe(1);
    expect(tabs.getTabs('right').length).toBe(1);
  });

  // ─── Serialization ───────────────────────────────────────────────────

  it('serializes tab state for session saving', () => {
    tabs.open('/a.md');
    tabs.updateScroll(150);
    tabs.open('/b.md');

    const state = tabs.serialize();
    expect(state.left.tabs).toHaveLength(2);
    expect(state.left.tabs[0].path).toBe('/a.md');
    expect(state.left.tabs[0].scrollTop).toBe(150);
    expect(state.left.activeIndex).toBe(1);
  });

  it('restores tab state from serialized data', () => {
    const state = {
      left: {
        tabs: [
          { path: '/a.md', scrollTop: 100 },
          { path: '/b.md', scrollTop: 200 },
        ],
        activeIndex: 1,
      },
    };

    tabs.restore(state);

    expect(tabs.getTabs().length).toBe(2);
    expect(tabs.getActive().path).toBe('/b.md');
    expect(tabs.getTabs()[0].scrollTop).toBe(100);
  });
});
