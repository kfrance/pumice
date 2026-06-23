import path from 'path';

export const HELP_TEXT = `pumice — lightweight markdown viewer

Usage:
  pumice [path]              Open a folder or .md file (absolute paths recommended)
  pumice                     Open an empty window

Options:
  -h, --help                 Show this help
  -v, --version              Show version

Behavior:
  One shared app process. Opening the same path again focuses the existing
  window instead of spawning a duplicate. Different paths open new windows.

  The CLI exits immediately after launching Electron. Exit code 0 means the
  launcher ran — not that a window is visible. Do not retry on success.

  Folder mode discovers all .md files, supports fuzzy search (Ctrl+P), and
  backlinks. File mode opens one file and watches it for external edits.

Examples:
  pumice ~/notes
  pumice ~/notes/README.md

For AI assistants:
  Run once with an absolute path. Do not retry when the command exits 0.
  Prefer folder paths when the user needs navigation across linked notes.
`;

export function shouldPrintHelp(argv) {
  return argv.some((arg) => arg === '--help' || arg === '-h');
}

export function shouldPrintVersion(argv) {
  return argv.some((arg) => arg === '--version' || arg === '-v');
}

/**
 * Parse the target path from a process argv list.
 * Returns null when no path is given (empty window).
 */
export function parseTargetPath(argv, { isPackaged = false } = {}) {
  const args = argv.slice(isPackaged ? 1 : 2);
  const paths = args.filter((arg) => !arg.startsWith('-'));
  return paths[0] || null;
}

/**
 * Resolve a user-supplied path against an optional working directory.
 */
export function resolveTargetPath(targetPath, cwd = process.cwd()) {
  if (!targetPath) return null;
  return path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(cwd, targetPath);
}

/**
 * Stable key for tracking windows by resolved open target.
 * Empty-window launches share the "__empty__" key.
 */
export function windowKeyForResolvedPath(resolvedPath) {
  if (!resolvedPath) return '__empty__';
  return resolvedPath;
}

/**
 * Resolve launch target data from Electron second-instance additionalData,
 * falling back to argv parsing when needed.
 */
export function resolveLaunchRequest(additionalData, argv, workingDirectory, { isPackaged = false } = {}) {
  const targetPath = additionalData?.targetPath ?? parseTargetPath(argv, { isPackaged });
  const cwd = additionalData?.cwd ?? workingDirectory ?? process.cwd();
  return { targetPath, cwd };
}