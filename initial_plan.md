# Pumice — Lightweight Markdown Viewer

> *Pumice is lighter than obsidian* 🪨

## Overview

A lightweight, vault-free Obsidian alternative built with Electron. Opens any folder or single markdown file instantly with no setup. Focused on reading, light editing, and navigating markdown files — especially ones being actively edited by AI tools in other applications.

## Usage

```bash
# Open a folder — recursively discovers all .md files
pumice ~/notes

# Open a single file — no folder context, just that file
pumice ~/notes/gospel/scriptures/markdown/bofm/1-ne/7.md

# Multiple instances work independently
pumice ~/notes &
pumice /tmp/scratch.md &
```

## Architecture

### Tech Stack

| Component | Library | Why |
|---|---|---|
| Shell | Electron | Desktop app, file system access, multiple windows |
| Markdown | markdown-it + plugins | Extensible, good plugin ecosystem |
| Code highlighting | highlight.js | Standard, wide language support |
| Math | KaTeX | Fast LaTeX rendering |
| Diagrams | mermaid | Markdown diagram standard |
| Frontmatter | gray-matter | Parse YAML frontmatter |
| File watching | chokidar | Reliable cross-platform fs watching |
| Fuzzy search | fuse.js | Lightweight, fast fuzzy matching |
| Editor | CodeMirror 6 | Syntax-highlighted plain text editing |
| Bundler | esbuild | Fast, zero-config bundling for renderer |

### Project Structure

```
pumice/
├── package.json
├── main/
│   ├── index.js            # Electron main process, window creation
│   ├── fileManager.js      # File discovery, watching, backlink scanning
│   └── ipc.js              # IPC handler registration
├── preload.js              # Context bridge (renderer ↔ main)
├── src/                    # Renderer source (bundled by esbuild)
│   ├── index.html
│   ├── renderer.js         # Entry point
│   ├── components/
│   │   ├── tabs.js         # Tab bar management
│   │   ├── panes.js        # Split pane container
│   │   ├── markdownView.js # Rendered markdown + scroll preservation
│   │   ├── editor.js       # CodeMirror edit mode
│   │   ├── fuzzySearch.js  # Ctrl+P file finder overlay
│   │   ├── backlinks.js    # Backlinks panel
│   │   └── frontmatter.js  # YAML properties table renderer
│   └── styles/
│       ├── main.css        # Layout, tabs, panes
│       ├── markdown.css    # Rendered markdown typography
│       └── theme.css       # Light/dark mode variables
├── scripts/
│   └── build.js            # esbuild bundler script
└── initial_plan.md
```

### Process Architecture

```
┌─────────────────────────────────────┐
│          Main Process               │
│  • Window management                │
│  • File I/O (read/write)           │
│  • chokidar file watching           │
│  • File discovery (recursive)       │
│  • Backlink index (scan on startup) │
└──────────┬──────────────────────────┘
           │ IPC (contextBridge)
┌──────────▼──────────────────────────┐
│        Renderer Process             │
│  • Markdown rendering               │
│  • Tab management                   │
│  • Split panes                      │
│  • Fuzzy search UI                  │
│  • Edit mode (CodeMirror)           │
│  • Ctrl+F in-document search        │
│  • Theme toggle                     │
└─────────────────────────────────────┘
```

## Features

### 1. File Discovery & Opening

- **Folder mode**: Recursively find all `.md` files under the given directory
- **File mode**: Open a single file, root = just that file
- **Exclusions**: Skip directories starting with `.`, plus `node_modules`, `__pycache__`
- **Performance target**: ~/notes has ~2,000 files / 14MB — discovery should be < 100ms

### 2. Markdown Rendering

- Full CommonMark + GFM support (tables, strikethrough, task lists, autolinks)
- **Frontmatter**: Parse YAML between `---` fences, render as a styled properties table (like Obsidian — showing title, date, sources, tags as labeled fields)
- **Code blocks**: Syntax highlighting via highlight.js
- **Math**: Inline `$...$` and block `$$...$$` via KaTeX
- **Mermaid**: Fenced `mermaid` code blocks rendered as diagrams
- **Images**: Resolve relative paths against the file's directory
- **Checklists**: GFM task list rendering `- [ ]` / `- [x]`

### 3. Tabs

- Open multiple files in tabs
- Tab bar shows filename (hover for full path)
- Close tabs individually (×), middle-click to close
- Click tab to switch
- Unsaved indicator (dot) when in edit mode with changes
- Ctrl+W to close current tab

### 4. Split Panes

- Split the view vertically (left/right) — each pane has its own tab bar
- Keyboard shortcut or menu to split/unsplit
- Drag a tab to the other pane
- Each pane independently navigates, scrolls, toggles read/edit

### 5. Read Mode & Edit Mode

- **Read mode** (default): Rendered markdown, scroll position preserved on external changes
- **Edit mode**: CodeMirror 6 with markdown syntax highlighting, monospace font
- Toggle with a button or keyboard shortcut
- **Auto-save**: Changes are written to disk automatically (debounced ~300ms)
- When switching back to read mode, re-render from the saved content

### 6. File Watching (Critical Feature)

- **Content changes**: When an external tool modifies an open file:
  - Re-read the file
  - Re-render the markdown
  - **Preserve scroll position** (do not jump to top)
  - If in edit mode with unsaved changes, show a conflict notification
- **New files**: When new `.md` files appear in the watched directory tree:
  - Add them to the file index
  - They appear immediately in fuzzy search
- **Deleted files**: Remove from index, show notification if file was open
- Uses chokidar with appropriate debouncing

### 7. Fuzzy File Search (Ctrl+P)

- Floating overlay, appears on Ctrl+P
- Type to fuzzy-match against file paths (relative to root)
- Show matched file path with highlighted matching characters
- Arrow keys to navigate, Enter to open, Escape to dismiss
- For deep nesting, show enough path context to disambiguate
- Powered by fuse.js

### 8. Link Navigation

- Standard markdown links `[text](path.md)` and `[text](./relative/path.md)` are clickable
- Resolve relative paths against the current file's directory
- Open linked file in a new tab (or switch to existing tab if already open)
- Support anchor links `[text](file.md#heading)` — scroll to heading

### 9. Backlinks

- On startup, scan all files to build a link index (which files link to which)
- **Log timing** of the scan so we know it's fast
- Collapsible panel at the bottom of the rendered view showing "N files link to this"
- Click a backlink to open that file
- Re-scan individual files when they change (incremental update)

### 10. In-Document Search (Ctrl+F)

- Search bar appears at top of the rendered markdown view
- Highlights all matches in the rendered output
- Navigate between matches (Enter / Shift+Enter or arrows)
- Match count indicator ("3 of 17")
- Escape to dismiss

### 11. Theme

- Light mode and Dark mode
- Toggle button in the title bar area
- CSS custom properties for easy switching
- Remember preference in localStorage
- Follow system preference on first launch

### 12. File Creation

- Ctrl+N to create a new file
- Prompt for filename/path (relative to root)
- Opens in edit mode immediately

### 13. Multiple Instances

- Each `pumice <path>` invocation opens a new independent window
- No shared state between instances
- Each watches its own directory tree independently

## IPC API (preload bridge)

```
pumice.files.list()               → string[]          # All discovered .md file paths
pumice.files.read(path)           → {content, mtime}  # Read file content
pumice.files.write(path, content) → void               # Write file
pumice.files.create(path)         → void               # Create new file
pumice.files.getBacklinks(path)   → string[]           # Files that link to this path
pumice.files.onChanged(callback)  → void               # File content changed externally
pumice.files.onAdded(callback)    → void               # New file discovered
pumice.files.onRemoved(callback)  → void               # File deleted
pumice.files.getScanTime()        → number             # ms taken for backlink scan
pumice.app.getRoot()              → string|null        # Root directory (null if single file)
pumice.app.getInitialFile()       → string|null        # File to open on launch
pumice.app.getMode()              → 'folder'|'file'    # Opening mode
```

## UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Tab1.md] [Tab2.md] [Tab3.md ●]          [☀/🌙] [+]  │
├────────────────────────────┬─────────────────────────────┤
│                            │                             │
│   ┌─ Frontmatter ───────┐ │                             │
│   │ title: 1 Nephi 7     │ │    (split pane - optional) │
│   │ date:  2025-01-01    │ │                             │
│   └──────────────────────┘ │                             │
│                            │                             │
│   # Heading                │                             │
│                            │                             │
│   Rendered markdown body   │                             │
│   with [clickable links]   │                             │
│                            │                             │
│   ```python                │                             │
│   highlighted code         │                             │
│   ```                      │                             │
│                            │                             │
│   $$LaTeX math$$           │                             │
│                            │                             │
├────────────────────────────┴─────────────────────────────┤
│  ▸ Backlinks (3)                                         │
│    • gospel/study/atonement_overview.md                   │
│    • gospel/study/word_studies/salvation.md               │
│    • gospel/lessons/2025-01-05.md                        │
└──────────────────────────────────────────────────────────┘
```

## Persistent Config (`~/.config/pumice/`)

```
~/.config/pumice/
├── preferences.json      # Theme, editor settings
└── sessions.json         # Recent sessions for restoring state
```

### preferences.json
```json
{
  "theme": "dark",
  "editorFontSize": 14
}
```

### sessions.json
```json
{
  "recent": [
    {
      "root": "/home/kfrance/notes",
      "mode": "folder",
      "openTabs": [
        { "path": "/home/kfrance/notes/gospel/scriptures/markdown/bofm/1-ne/7.md", "scrollTop": 342 }
      ],
      "activeTab": 0,
      "splitPanes": null,
      "lastOpened": "2026-03-07T14:00:00Z"
    }
  ],
  "maxRecent": 20
}
```

- On launch with a path, restore tab state for that path if found in sessions
- On quit, save current tab/scroll state
- Auto-save editor writes immediately on change (debounced ~300ms)

## Non-Goals (Explicitly Skipped)

- No vault / config directory created in the user's folder
- No wiki-style `[[links]]`
- No graph view
- No plugins / plugin API
- No community themes
- No command palette
- No global cross-file search (yet — future feature)
- No sync / cloud features
- No Git integration
- No extensive keyboard shortcut customization

## Performance Targets

| Operation | Target | Notes |
|---|---|---|
| File discovery (2,000 files) | < 100ms | Recursive readdir with exclusions |
| Backlink scan (2,000 files, 14MB) | < 1s | Read all files, regex for markdown links |
| Fuzzy search keystroke | < 16ms | fuse.js on ~2,000 entries |
| File change re-render | < 100ms | Re-read + markdown-it render |
| App startup to first render | < 500ms | Electron window + initial file |

## Testing Strategy

### Philosophy
- **Behavioral tests over implementation tests** — test what the system does, not how
- Tests describe user-visible behavior: "when I open a folder, it finds all .md files but skips .git"
- Run tests continuously during development (`npm test`)

### Test Framework
- **Vitest** — fast, modern, native ESM support
- Tests live alongside source in `__tests__/` directories or `*.test.js` files

### Test Categories

| Category | What it tests | Examples |
|---|---|---|
| File Discovery | Finding .md files, exclusions | Skips .git, finds nested files, handles empty dirs |
| File Watching | Change detection, new files | Content change emits event, new .md detected |
| Backlinks | Link extraction, index building | Finds markdown links, builds reverse index, incremental update |
| Config/Session | Persistence, restore | Saves theme, restores tabs, handles missing config |
| Markdown Rendering | Frontmatter, links, content | Frontmatter becomes table, relative images resolved |
| Fuzzy Search | Matching, ranking | Fuzzy matches paths, ranks by relevance |
| Tabs | Open, close, switch | Opening same file reuses tab, close removes tab |
| Editor | Auto-save, conflict detection | Debounced write, external change during edit |

### Running Tests
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode during development
npm run test:coverage # Coverage report
```

## Progress Tracker

- [x] Phase 1: Project setup, file discovery + tests (32 tests)
- [x] Phase 2: Config/session manager + tests (11 tests)
- [x] Phase 3: Electron main process, preload, IPC
- [x] Phase 4: Renderer shell (HTML/CSS), markdown rendering + tests (30 tests)
- [x] Phase 5: Tabs + tests (24 tests)
- [x] Phase 6: File watching + tests (5 tests)
- [x] Phase 7: Fuzzy search + tests (12 tests)
- [x] Phase 8: Edit mode with auto-save (CodeMirror integration)
- [x] Phase 9: Backlinks (panel + incremental updates)
- [x] Phase 10: Split panes (divider drag, independent tabs)
- [x] Phase 11: In-document search (Ctrl+F)
- [x] Phase 12: Theme toggle + config persistence
- [x] Phase 13: File creation (Ctrl+N dialog)
- [x] Phase 14: Link navigation (data-internal, resolve relative paths)
- [x] Phase 15: Performance tests (4 tests on ~/notes)
- [x] Phase 16: Navigation history (back/forward, Alt+Left/Right) + tests (13 tests)
- [x] Phase 17: Mode toggle moved to top bar (book/pencil icons)
- [x] Phase 18: In-place link navigation + right-click "Open in new tab"
- [ ] Phase 19: Integration testing & polish (current)

**Test totals: 131 passing**

### Performance Results (real ~/notes — 1,935 files, 14MB)
| Metric | Result | Target |
|---|---|---|
| File discovery | 5.4ms (cached), 65ms (cold) | < 200ms |
| Backlink scan | 186-223ms | < 2000ms |
| Backlinks found | 135 | n/a |

## Build & Run

```bash
# Development
npm install
npm run build       # esbuild bundles renderer
npm start           # electron .

# Or with watch mode
npm run dev         # esbuild watch + electron with auto-reload
```
