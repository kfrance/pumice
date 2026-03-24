# Pumice

A lightweight, vault-free markdown viewer built with Electron.

## Installation

### 1) Clone and install dependencies

```bash
git clone <your-repo-url>
cd pumice
npm install
npm run build
```

### 2) Install the CLI globally with npm link

From the project root:

```bash
npm link
```

This exposes the `pumice` command system-wide (it points to this repo).

You can then run:

```bash
pumice [path-to-folder-or-markdown-file]
```

Examples:

```bash
pumice ~/notes
pumice ~/notes/README.md
```

## Development

- `npm start` — start Electron (`electron .`)
- `npm run build` — build renderer bundle with esbuild
- `npm run dev` — watch mode + Electron
- `npm test` — run test suite

## Unlink

To remove the global link:

```bash
npm unlink -g pumice
```
