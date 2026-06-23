import { describe, it, expect } from 'vitest';
import {
  parseTargetPath,
  shouldPrintHelp,
  shouldPrintVersion,
  resolveTargetPath,
  resolveLaunchRequest,
  windowKeyForResolvedPath,
  HELP_TEXT,
} from '../main/cli.js';

describe('CLI helpers', () => {
  it('detects help flags', () => {
    expect(shouldPrintHelp(['--help'])).toBe(true);
    expect(shouldPrintHelp(['-h'])).toBe(true);
    expect(shouldPrintHelp(['/tmp/notes'])).toBe(false);
  });

  it('detects version flags', () => {
    expect(shouldPrintVersion(['--version'])).toBe(true);
    expect(shouldPrintVersion(['-v'])).toBe(true);
  });

  it('parses a target path from dev-style argv', () => {
    const argv = ['electron', '/repo/pumice', '/tmp/notes.md'];
    expect(parseTargetPath(argv, { isPackaged: false })).toBe('/tmp/notes.md');
  });

  it('parses a target path from packaged argv', () => {
    const argv = ['/Applications/Pumice.app/Contents/MacOS/Pumice', '/tmp/notes'];
    expect(parseTargetPath(argv, { isPackaged: true })).toBe('/tmp/notes');
  });

  it('returns null when no path is provided', () => {
    expect(parseTargetPath(['electron', '/repo/pumice'], { isPackaged: false })).toBeNull();
  });

  it('ignores option-like arguments when parsing paths', () => {
    const argv = ['electron', '/repo/pumice', '--foo', '/tmp/notes'];
    expect(parseTargetPath(argv, { isPackaged: false })).toBe('/tmp/notes');
  });

  it('resolves relative paths against a working directory', () => {
    expect(resolveTargetPath('notes.md', '/tmp/work')).toBe('/tmp/work/notes.md');
    expect(resolveTargetPath('/tmp/notes.md', '/other')).toBe('/tmp/notes.md');
  });

  it('builds stable window keys from resolved paths', () => {
    expect(windowKeyForResolvedPath(null)).toBe('__empty__');
    expect(windowKeyForResolvedPath('/tmp/notes')).toBe('/tmp/notes');
  });

  it('prefers additionalData over argv for second-instance launches', () => {
    const request = resolveLaunchRequest(
      { targetPath: '/tmp/notes.md', cwd: '/tmp/work' },
      ['electron', '/repo/pumice', '/wrong/path.md'],
      '/other',
      { isPackaged: false },
    );

    expect(request.targetPath).toBe('/tmp/notes.md');
    expect(request.cwd).toBe('/tmp/work');
  });

  it('documents assistant usage', () => {
    expect(HELP_TEXT).toContain('For AI assistants');
    expect(HELP_TEXT).toContain('Do not retry');
  });
});