#!/usr/bin/env node
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HELP_TEXT, shouldPrintHelp, shouldPrintVersion } from '../main/cli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const electronPath = path.join(root, 'node_modules', '.bin', 'electron');

const args = process.argv.slice(2);

if (shouldPrintHelp(args)) {
  process.stdout.write(HELP_TEXT);
  process.exit(0);
}

if (shouldPrintVersion(args)) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const child = spawn(electronPath, [root, ...args], {
  stdio: 'inherit',
  detached: true,
});

child.unref();
process.exit(0);