#!/usr/bin/env node
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const electronPath = path.join(root, 'node_modules', '.bin', 'electron');

const args = process.argv.slice(2);

const child = spawn(electronPath, [root, ...args], {
  stdio: 'inherit',
  detached: true,
});

child.unref();
process.exit(0);
