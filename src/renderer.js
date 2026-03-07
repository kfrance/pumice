import { createMarkdownRenderer, renderMarkdown } from './lib/markdown.js';
import { TabManager } from './lib/tabs.js';
import { FuzzySearch } from './lib/fuzzySearch.js';
import { DocumentSearch } from './lib/documentSearch.js';
import './styles/main.css';
import 'highlight.js/styles/github.css';
import 'katex/dist/katex.min.css';

// ─── Initialize ──────────────────────────────────────────────────────────────

const md = createMarkdownRenderer();
const tabManager = new TabManager();
const fuzzySearch = new FuzzySearch();
const docSearch = { left: new DocumentSearch(), right: new DocumentSearch() };

let rootDir = null;
let currentTheme = 'light';
let activePaneId = 'left';
let autoSaveTimers = {};
let splitActive = false;

// ─── Navigation History (per pane) ──────────────────────────────────────────

const navHistory = {
  left: { stack: [], index: -1 },
  right: { stack: [], index: -1 },
};

function navPush(paneId, filePath) {
  const h = navHistory[paneId];
  // If we're in the middle of the stack, truncate forward history
  if (h.index < h.stack.length - 1) {
    h.stack = h.stack.slice(0, h.index + 1);
  }
  // Don't push duplicate of current
  if (h.stack[h.index] !== filePath) {
    h.stack.push(filePath);
    h.index = h.stack.length - 1;
  }
  updateNavButtons();
}

function navBack(paneId) {
  const h = navHistory[paneId];
  if (h.index <= 0) return null;
  h.index--;
  updateNavButtons();
  return h.stack[h.index];
}

function navForward(paneId) {
  const h = navHistory[paneId];
  if (h.index >= h.stack.length - 1) return null;
  h.index++;
  updateNavButtons();
  return h.stack[h.index];
}

function canGoBack(paneId) {
  return navHistory[paneId].index > 0;
}

function canGoForward(paneId) {
  const h = navHistory[paneId];
  return h.index < h.stack.length - 1;
}

function updateNavButtons() {
  elements.btnBack.disabled = !canGoBack(activePaneId);
  elements.btnForward.disabled = !canGoForward(activePaneId);
}

// ─── DOM Elements ────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const elements = {
  app: $('#app'),
  emptyState: $('#empty-state'),
  mainContent: $('#main-content'),
  tabLists: { left: $('#tab-list-left'), right: $('#tab-list-right') },
  panes: { left: $('#pane-left'), right: $('#pane-right') },
  markdownViews: { left: $('#markdown-left'), right: $('#markdown-right') },
  editorContainers: { left: $('#editor-left'), right: $('#editor-right') },
  paneDivider: $('#pane-divider'),
  paneTabsRight: $('.pane-tabs[data-pane="right"]'),
  searchBars: { left: $('#search-bar-left'), right: $('#search-bar-right') },
  fuzzyOverlay: $('#fuzzy-overlay'),
  fuzzyInput: $('#fuzzy-input'),
  fuzzyResults: $('#fuzzy-results'),
  newFileOverlay: $('#new-file-overlay'),
  newFileInput: $('#new-file-input'),
  btnTheme: $('#btn-theme'),
  btnSplit: $('#btn-split'),
  btnNewFile: $('#btn-new-file'),
  btnBack: $('#btn-back'),
  btnForward: $('#btn-forward'),
  btnMode: $('#btn-mode'),
  iconRead: $('#icon-read'),
  iconEdit: $('#icon-edit'),
  linkContextMenu: $('#link-context-menu'),
  ctxOpenTab: $('#ctx-open-tab'),
  ctxOpenSplit: $('#ctx-open-split'),
};

// ─── Editors (CodeMirror instances, loaded lazily) ───────────────────────────

const editors = { left: null, right: null };

async function getOrCreateEditor(paneId) {
  if (editors[paneId]) return editors[paneId];

  const { EditorView, basicSetup } = await import('codemirror');
  const { markdown: cmMarkdown } = await import('@codemirror/lang-markdown');
  const { EditorState } = await import('@codemirror/state');

  const container = elements.editorContainers[paneId];
  container.innerHTML = '';

  const view = new EditorView({
    state: EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        cmMarkdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            handleEditorChange(paneId);
          }
        }),
      ],
    }),
    parent: container,
  });

  editors[paneId] = view;
  return view;
}

// ─── Theme Management ────────────────────────────────────────────────────────

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  pumice.preferences.update('theme', theme);
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ─── Mode Icon Toggle ───────────────────────────────────────────────────────

function updateModeIcon() {
  const tab = tabManager.getActive(activePaneId);
  const isEdit = tab && tab.mode === 'edit';
  elements.iconRead.classList.toggle('hidden', isEdit);
  elements.iconEdit.classList.toggle('hidden', !isEdit);
  elements.btnMode.classList.toggle('editing', isEdit);
  elements.btnMode.title = isEdit ? 'Switch to read mode (Ctrl+E)' : 'Switch to edit mode (Ctrl+E)';
}

// ─── Tab Bar Rendering ──────────────────────────────────────────────────────

function renderTabs(paneId = 'left') {
  const tabList = elements.tabLists[paneId];
  if (!tabList) return;

  const tabs = tabManager.getTabs(paneId);
  const active = tabManager.getActive(paneId);

  tabList.innerHTML = '';

  if (tabs.length === 0) {
    updateEmptyState();
    return;
  }

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const el = document.createElement('div');
    el.className = `tab${tab === active ? ' active' : ''}`;
    el.title = tab.path;
    el.dataset.index = i;

    el.innerHTML = `
      <span class="tab-modified"></span>
      <span class="tab-title">${escapeHtml(tab.name)}</span>
      <span class="tab-close">✕</span>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-close')) {
        tabManager.close(tab.path, paneId);
        return;
      }
      activePaneId = paneId;
      tabManager.activate(i, paneId);
    });

    el.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        tabManager.close(tab.path, paneId);
      }
    });

    tabList.appendChild(el);
  }

  updateEmptyState();
}

function updateEmptyState() {
  const hasAnyTabs = tabManager.getTabs('left').length > 0 ||
    (tabManager.isSplit() && tabManager.getTabs('right').length > 0);

  elements.emptyState.classList.toggle('hidden', hasAnyTabs);
  elements.mainContent.style.display = hasAnyTabs ? 'flex' : 'none';
}

// ─── Markdown View Rendering ────────────────────────────────────────────────

async function renderActiveTab(paneId = 'left') {
  const tab = tabManager.getActive(paneId);
  if (!tab) {
    elements.markdownViews[paneId].innerHTML = '';
    return;
  }

  if (tab.mode === 'edit') {
    showEditor(paneId, tab);
  } else {
    showRendered(paneId, tab);
  }

  updateBacklinks(paneId, tab.path);
  updateModeIcon();
  updateNavButtons();
}

async function showRendered(paneId, tab) {
  const markdownView = elements.markdownViews[paneId];
  const editorContainer = elements.editorContainers[paneId];

  markdownView.classList.remove('hidden');
  editorContainer.classList.add('hidden');

  try {
    const { content } = await pumice.files.read(tab.path);

    const fileDir = tab.path.substring(0, tab.path.lastIndexOf('/'));
    let html = renderMarkdown(content, md, tab.path);

    html = html.replace(
      /src="(?!https?:\/\/|data:|file:\/\/)([^"]+)"/g,
      (match, src) => `src="file://${fileDir}/${src}"`
    );

    markdownView.innerHTML = html;

    const paneContent = markdownView.closest('.pane-content');
    if (paneContent && tab.scrollTop) {
      paneContent.scrollTop = tab.scrollTop;
    }

    initMermaid(markdownView);
    setupInternalLinks(markdownView, paneId);

  } catch (err) {
    markdownView.innerHTML = `
      <div style="padding: 48px; text-align: center; color: var(--text-secondary);">
        <h2 style="color: var(--text-primary); margin-bottom: 12px;">File not found</h2>
        <p style="font-family: monospace; font-size: 13px; margin-bottom: 16px;
                  background: var(--bg-secondary); padding: 8px 16px; border-radius: 6px;
                  display: inline-block;">${escapeHtml(tab.path)}</p>
        <p>${escapeHtml(err.message)}</p>
      </div>`;
  }
}

async function showEditor(paneId, tab) {
  const markdownView = elements.markdownViews[paneId];
  const editorContainer = elements.editorContainers[paneId];

  markdownView.classList.add('hidden');
  editorContainer.classList.remove('hidden');

  const editor = await getOrCreateEditor(paneId);
  const { content } = await pumice.files.read(tab.path);

  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: content },
  });
}

function handleEditorChange(paneId) {
  const tab = tabManager.getActive(paneId);
  if (!tab) return;

  if (autoSaveTimers[paneId]) {
    clearTimeout(autoSaveTimers[paneId]);
  }

  autoSaveTimers[paneId] = setTimeout(async () => {
    const editor = editors[paneId];
    if (!editor) return;

    const content = editor.state.doc.toString();
    await pumice.files.write(tab.path, content);
  }, 300);
}

// ─── Backlinks ──────────────────────────────────────────────────────────────

async function updateBacklinks(paneId, filePath) {
  const panel = elements.panes[paneId]?.querySelector('.backlinks-panel');
  if (!panel) return;

  const backlinks = await pumice.files.getBacklinks(filePath);
  const title = panel.querySelector('.backlinks-title');
  const list = panel.querySelector('.backlinks-list');

  title.textContent = `Backlinks (${backlinks.length})`;
  list.innerHTML = '';

  for (const source of backlinks) {
    const item = document.createElement('a');
    item.className = 'backlink-item';
    item.textContent = rootDir ? source.replace(rootDir + '/', '') : source.split('/').pop();
    item.title = source;
    item.addEventListener('click', () => {
      navigateToFile(source, paneId);
    });
    list.appendChild(item);
  }
}

// ─── Internal Links ─────────────────────────────────────────────────────────

// Context menu state
let contextMenuTarget = null; // { filePath, paneId, anchor }

function setupInternalLinks(container, paneId) {
  // Intercept ALL link clicks in the rendered markdown to prevent
  // Electron from navigating the window to file:// URLs
  container.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href') || '';
    const isInternal = link.hasAttribute('data-internal');
    const isExternal = href.startsWith('http://') || href.startsWith('https://');
    const isMailto = href.startsWith('mailto:');
    const isAnchorOnly = href.startsWith('#');

    link.addEventListener('click', (e) => {
      e.preventDefault();

      if (isInternal) {
        // Internal .md link — navigate in place
        const { resolved, anchor } = resolveLink(link, paneId);
        if (resolved) {
          navigateToFile(resolved, paneId, anchor);
        }
      } else if (isExternal || isMailto) {
        // External link — open in system browser
        openExternal(href);
      } else if (isAnchorOnly) {
        // Anchor link — scroll within current document
        const anchor = href.slice(1);
        scrollToAnchor(paneId, anchor);
      }
      // All other links (relative paths to non-.md files, etc.) — do nothing
      // This prevents Electron from navigating to file:///bad/path
    });

    // Right click context menu — only for internal .md links
    if (isInternal) {
      link.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const { resolved, anchor } = resolveLink(link, paneId);
        if (resolved) {
          contextMenuTarget = { filePath: resolved, paneId, anchor };
          showContextMenu(e.clientX, e.clientY);
        }
      });
    }

    // Make external links visually distinct (open-in-new-window cursor)
    if (isExternal) {
      link.setAttribute('title', href);
    }
  });
}

function openExternal(url) {
  pumice.shell.openExternal(url);
}

function resolveLink(linkElement, paneId) {
  const href = linkElement.getAttribute('href');
  const tab = tabManager.getActive(paneId);
  if (!tab) return {};

  const fileDir = tab.path.substring(0, tab.path.lastIndexOf('/'));
  const [pathPart, anchor] = href.split('#');
  const resolved = resolvePath(fileDir, pathPart);
  return { resolved, anchor };
}

function resolvePath(base, relative) {
  if (relative.startsWith('/')) return relative;
  const parts = base.split('/');
  for (const segment of relative.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

// ─── Context Menu ───────────────────────────────────────────────────────────

function showContextMenu(x, y) {
  const menu = elements.linkContextMenu;
  menu.classList.remove('hidden');
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Ensure menu doesn't go off-screen
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  });
}

function hideContextMenu() {
  elements.linkContextMenu.classList.add('hidden');
  contextMenuTarget = null;
}

elements.ctxOpenTab.addEventListener('click', () => {
  if (contextMenuTarget) {
    const { filePath, paneId, anchor } = contextMenuTarget;
    openFileInNewTab(filePath, paneId, anchor);
  }
  hideContextMenu();
});

elements.ctxOpenSplit.addEventListener('click', () => {
  if (contextMenuTarget) {
    const { filePath, anchor } = contextMenuTarget;
    // Open in the other pane
    if (!splitActive) toggleSplit();
    const targetPane = activePaneId === 'left' ? 'right' : 'left';
    openFileInNewTab(filePath, targetPane, anchor);
  }
  hideContextMenu();
});

// Close context menu on click anywhere else
document.addEventListener('click', (e) => {
  if (!elements.linkContextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

document.addEventListener('contextmenu', (e) => {
  // Close our custom context menu if clicking elsewhere
  if (!elements.linkContextMenu.contains(e.target) && !e.target.closest('a[data-internal]')) {
    hideContextMenu();
  }
});

// ─── Mermaid Init ───────────────────────────────────────────────────────────

let mermaidLoaded = false;
async function initMermaid(container) {
  const mermaidDivs = container.querySelectorAll('.mermaid');
  if (mermaidDivs.length === 0) return;

  if (!mermaidLoaded) {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: currentTheme === 'dark' ? 'dark' : 'default',
    });
    window.mermaid = mermaid.default;
    mermaidLoaded = true;
  }

  try {
    await window.mermaid.run({ nodes: mermaidDivs });
  } catch {
    // Mermaid rendering errors are non-fatal
  }
}

// ─── Fuzzy Search ───────────────────────────────────────────────────────────

let fuzzySelectedIndex = 0;
let fuzzyResults = [];

function showFuzzySearch() {
  elements.fuzzyOverlay.classList.remove('hidden');
  elements.fuzzyInput.value = '';
  elements.fuzzyInput.focus();
  fuzzySelectedIndex = 0;
  updateFuzzyResults('');
}

function hideFuzzySearch() {
  elements.fuzzyOverlay.classList.add('hidden');
  elements.fuzzyInput.value = '';
  elements.fuzzyResults.innerHTML = '';
}

function updateFuzzyResults(query) {
  fuzzyResults = fuzzySearch.search(query, 30);
  elements.fuzzyResults.innerHTML = '';

  for (let i = 0; i < fuzzyResults.length; i++) {
    const result = fuzzyResults[i];
    const el = document.createElement('div');
    el.className = `fuzzy-item${i === fuzzySelectedIndex ? ' selected' : ''}`;

    el.innerHTML = `
      <span class="fuzzy-item-name">${escapeHtml(result.name)}</span>
      <span class="fuzzy-item-path">${escapeHtml(result.relative)}</span>
    `;

    el.addEventListener('click', () => {
      navigateToFile(result.absPath, activePaneId);
      hideFuzzySearch();
    });

    el.addEventListener('mouseenter', () => {
      fuzzySelectedIndex = i;
      updateFuzzySelection();
    });

    elements.fuzzyResults.appendChild(el);
  }
}

function updateFuzzySelection() {
  const items = elements.fuzzyResults.querySelectorAll('.fuzzy-item');
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === fuzzySelectedIndex);
  });

  const selected = items[fuzzySelectedIndex];
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

elements.fuzzyInput.addEventListener('input', (e) => {
  fuzzySelectedIndex = 0;
  updateFuzzyResults(e.target.value);
});

elements.fuzzyInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    fuzzySelectedIndex = Math.min(fuzzySelectedIndex + 1, fuzzyResults.length - 1);
    updateFuzzySelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    fuzzySelectedIndex = Math.max(fuzzySelectedIndex - 1, 0);
    updateFuzzySelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (fuzzyResults[fuzzySelectedIndex]) {
      navigateToFile(fuzzyResults[fuzzySelectedIndex].absPath, activePaneId);
      hideFuzzySearch();
    }
  } else if (e.key === 'Escape') {
    hideFuzzySearch();
  }
});

elements.fuzzyOverlay.addEventListener('click', (e) => {
  if (e.target === elements.fuzzyOverlay) {
    hideFuzzySearch();
  }
});

// ─── New File Dialog ────────────────────────────────────────────────────────

function showNewFileDialog() {
  elements.newFileOverlay.classList.remove('hidden');
  elements.newFileInput.value = '';
  elements.newFileInput.focus();
}

function hideNewFileDialog() {
  elements.newFileOverlay.classList.add('hidden');
}

async function createNewFile() {
  let filePath = elements.newFileInput.value.trim();
  if (!filePath) return;

  if (!filePath.endsWith('.md')) filePath += '.md';

  if (rootDir) {
    filePath = `${rootDir}/${filePath}`;
  }

  await pumice.files.create(filePath);
  hideNewFileDialog();

  setTimeout(() => {
    navigateToFile(filePath, activePaneId);
    tabManager.setMode('edit', activePaneId);
    renderActiveTab(activePaneId);
  }, 200);
}

$('#new-file-create').addEventListener('click', createNewFile);
$('#new-file-cancel').addEventListener('click', hideNewFileDialog);
elements.newFileInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createNewFile();
  if (e.key === 'Escape') hideNewFileDialog();
});
elements.newFileOverlay.addEventListener('click', (e) => {
  if (e.target === elements.newFileOverlay) hideNewFileDialog();
});

// ─── In-Document Search (Ctrl+F) ───────────────────────────────────────────

function setupSearchBar(paneId) {
  const searchBar = elements.searchBars[paneId];
  if (!searchBar) return;

  const input = searchBar.querySelector('.search-input');
  const count = searchBar.querySelector('.search-count');
  const prevBtn = searchBar.querySelector('.search-prev');
  const nextBtn = searchBar.querySelector('.search-next');
  const closeBtn = searchBar.querySelector('.search-close');

  function doSearch() {
    docSearch[paneId].attach(elements.markdownViews[paneId]);
    const total = docSearch[paneId].search(input.value);
    count.textContent = docSearch[paneId].getStatus();
  }

  input.addEventListener('input', doSearch);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) docSearch[paneId].prev();
      else docSearch[paneId].next();
      count.textContent = docSearch[paneId].getStatus();
    }
    if (e.key === 'Escape') {
      hideSearchBar(paneId);
    }
  });

  prevBtn.addEventListener('click', () => {
    docSearch[paneId].prev();
    count.textContent = docSearch[paneId].getStatus();
  });

  nextBtn.addEventListener('click', () => {
    docSearch[paneId].next();
    count.textContent = docSearch[paneId].getStatus();
  });

  closeBtn.addEventListener('click', () => {
    hideSearchBar(paneId);
  });
}

function showSearchBar(paneId) {
  const searchBar = elements.searchBars[paneId];
  searchBar.classList.remove('hidden');
  searchBar.querySelector('.search-input').focus();
}

function hideSearchBar(paneId) {
  const searchBar = elements.searchBars[paneId];
  searchBar.classList.add('hidden');
  docSearch[paneId].clear();
  searchBar.querySelector('.search-count').textContent = '';
  searchBar.querySelector('.search-input').value = '';
}

setupSearchBar('left');
setupSearchBar('right');

// ─── Split Panes ────────────────────────────────────────────────────────────

function toggleSplit() {
  if (splitActive) {
    splitActive = false;
    tabManager.disableSplit();
    elements.panes.right.classList.add('hidden');
    elements.paneDivider.classList.add('hidden');
    elements.paneTabsRight.classList.add('hidden');
  } else {
    splitActive = true;
    tabManager.enableSplit();
    elements.panes.right.classList.remove('hidden');
    elements.paneDivider.classList.remove('hidden');
    elements.paneTabsRight.classList.remove('hidden');
    renderTabs('right');
  }
}

// Pane divider dragging
let isDragging = false;
elements.paneDivider.addEventListener('mousedown', (e) => {
  isDragging = true;
  elements.paneDivider.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const container = elements.mainContent;
  const rect = container.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  const clamped = Math.max(0.2, Math.min(0.8, ratio));
  elements.panes.left.style.flex = `${clamped}`;
  elements.panes.right.style.flex = `${1 - clamped}`;
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    elements.paneDivider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

// ─── File Navigation ────────────────────────────────────────────────────────

/**
 * Navigate to a file in the same tab, pushing to history.
 * This is the primary navigation method for links, backlinks, fuzzy search.
 */
async function navigateToFile(filePath, paneId = 'left', anchor) {
  // Open in the tab manager (reuses tab if same file, or replaces current)
  const currentTab = tabManager.getActive(paneId);

  if (currentTab && currentTab.path === filePath) {
    // Same file — just scroll to anchor if provided
    if (anchor) {
      scrollToAnchor(paneId, anchor);
    }
    return;
  }

  // Navigate: replace current tab's file (or open new tab if none)
  if (currentTab) {
    // Change the current tab's file path in place
    currentTab.path = filePath;
    currentTab.name = filePath.split('/').pop() || filePath;
    currentTab.scrollTop = 0;
    currentTab.mode = 'read';
  } else {
    tabManager.open(filePath, paneId);
  }

  navPush(paneId, filePath);
  renderTabs(paneId);
  await renderActiveTab(paneId);

  if (anchor) {
    setTimeout(() => scrollToAnchor(paneId, anchor), 50);
  }
}

/**
 * Open a file in a new tab (from right-click context menu).
 */
async function openFileInNewTab(filePath, paneId = 'left', anchor) {
  tabManager.open(filePath, paneId);
  navPush(paneId, filePath);
  renderTabs(paneId);
  await renderActiveTab(paneId);

  if (anchor) {
    setTimeout(() => scrollToAnchor(paneId, anchor), 50);
  }
}

function scrollToAnchor(paneId, anchor) {
  const target = elements.markdownViews[paneId].querySelector(`#${anchor}`);
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

async function goBack() {
  const filePath = navBack(activePaneId);
  if (!filePath) return;

  const tab = tabManager.getActive(activePaneId);
  if (tab) {
    tab.path = filePath;
    tab.name = filePath.split('/').pop() || filePath;
    tab.scrollTop = 0;
    tab.mode = 'read';
  }
  renderTabs(activePaneId);
  await renderActiveTab(activePaneId);
}

async function goForward() {
  const filePath = navForward(activePaneId);
  if (!filePath) return;

  const tab = tabManager.getActive(activePaneId);
  if (tab) {
    tab.path = filePath;
    tab.name = filePath.split('/').pop() || filePath;
    tab.scrollTop = 0;
    tab.mode = 'read';
  }
  renderTabs(activePaneId);
  await renderActiveTab(activePaneId);
}

// ─── Event Listeners ────────────────────────────────────────────────────────

// Tab manager events
tabManager.onChange(({ type, paneId }) => {
  if (type === 'opened' || type === 'closed' || type === 'activated') {
    renderTabs(paneId);
    renderActiveTab(paneId);
  }
  if (type === 'modeChanged') {
    renderActiveTab(paneId);
  }
});

// Backlinks panel toggle
document.querySelectorAll('.backlinks-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.backlinks-panel').classList.toggle('collapsed');
  });
});

// Scroll tracking
['left', 'right'].forEach(paneId => {
  const paneContent = elements.panes[paneId]?.querySelector('.pane-content');
  if (paneContent) {
    paneContent.addEventListener('scroll', () => {
      tabManager.updateScroll(paneContent.scrollTop, paneId);
    });
  }
});

// Button handlers
elements.btnTheme.addEventListener('click', toggleTheme);
elements.btnSplit.addEventListener('click', toggleSplit);
elements.btnNewFile.addEventListener('click', showNewFileDialog);
elements.btnBack.addEventListener('click', goBack);
elements.btnForward.addEventListener('click', goForward);
elements.btnMode.addEventListener('click', () => {
  tabManager.toggleMode(activePaneId);
});

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Ctrl+P: Fuzzy search
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    showFuzzySearch();
  }

  // Ctrl+N: New file
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    showNewFileDialog();
  }

  // Ctrl+W: Close current tab
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
    e.preventDefault();
    const tab = tabManager.getActive(activePaneId);
    if (tab) tabManager.close(tab.path, activePaneId);
  }

  // Ctrl+F: In-document search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    const tab = tabManager.getActive(activePaneId);
    if (tab && tab.mode === 'read') {
      showSearchBar(activePaneId);
    }
  }

  // Ctrl+E: Toggle edit mode
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    tabManager.toggleMode(activePaneId);
  }

  // Alt+Left: Back
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    goBack();
  }

  // Alt+Right: Forward
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    goForward();
  }

  // Escape: Close overlays
  if (e.key === 'Escape') {
    if (!elements.fuzzyOverlay.classList.contains('hidden')) {
      hideFuzzySearch();
    }
    hideContextMenu();
  }
});

// ─── File Watching Events ───────────────────────────────────────────────────

pumice.files.onChanged(async (filePath) => {
  for (const paneId of ['left', 'right']) {
    const tab = tabManager.getActive(paneId);
    if (tab && tab.path === filePath && tab.mode === 'read') {
      const paneContent = elements.panes[paneId]?.querySelector('.pane-content');
      const scrollTop = paneContent?.scrollTop || 0;

      await showRendered(paneId, tab);

      if (paneContent) {
        requestAnimationFrame(() => {
          paneContent.scrollTop = scrollTop;
        });
      }
    }
  }
});

pumice.files.onAdded((filePath) => {
  fuzzySearch.addFile(filePath);
});

pumice.files.onRemoved((filePath) => {
  fuzzySearch.removeFile(filePath);
  for (const paneId of ['left', 'right']) {
    const tabs = tabManager.getTabs(paneId);
    if (tabs.some(t => t.path === filePath)) {
      tabManager.close(filePath, paneId);
    }
  }
});

// ─── Session Save on Unload ─────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  const sessionData = {
    root: rootDir,
    mode: rootDir ? 'folder' : 'file',
    panes: tabManager.serialize(),
  };
  pumice.session.save(sessionData);
});

// ─── Initialization ─────────────────────────────────────────────────────────

async function init() {
  const prefs = await pumice.preferences.load();
  if (prefs.theme === 'system') {
    setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    setTheme(prefs.theme);
  }

  const mode = await pumice.app.getMode();
  rootDir = await pumice.app.getRoot();
  const initialFile = await pumice.app.getInitialFile();
  const files = await pumice.files.list();
  const scanTime = await pumice.files.getScanTime();

  console.log(`[pumice] Backlink scan time: ${scanTime.toFixed(1)}ms`);

  fuzzySearch.setFiles(files, rootDir);

  const session = await pumice.app.getSession();
  if (session && session.panes) {
    tabManager.restore(session.panes);
    if (session.panes.right && session.panes.right.tabs.length > 0) {
      splitActive = true;
      elements.panes.right.classList.remove('hidden');
      elements.paneDivider.classList.remove('hidden');
      elements.paneTabsRight.classList.remove('hidden');
    }
    renderTabs('left');
    if (splitActive) renderTabs('right');
    await renderActiveTab('left');
    if (splitActive) await renderActiveTab('right');

    // Initialize history with current active files
    const leftTab = tabManager.getActive('left');
    if (leftTab) navPush('left', leftTab.path);
    if (splitActive) {
      const rightTab = tabManager.getActive('right');
      if (rightTab) navPush('right', rightTab.path);
    }
  } else if (initialFile) {
    await navigateToFile(initialFile, 'left');
  } else if (mode === 'folder' && files.length > 0) {
    updateEmptyState();
  }

  updateEmptyState();
  updateNavButtons();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Start ──────────────────────────────────────────────────────────────────

init().catch(err => {
  console.error('[pumice] Initialization failed:', err);
});
