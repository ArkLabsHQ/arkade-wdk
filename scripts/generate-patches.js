#!/usr/bin/env node
/**
 * Regenerate submodule patch files.
 *
 * Each patch captures the diff between `origin/main` (or the ref given via
 * --base) and the current working tree of the submodule, so that local changes
 * can be re-applied after a fresh `git submodule update`.
 *
 * Usage:
 *   node scripts/generate-patches.js              # compare against origin/main
 *   node scripts/generate-patches.js --base origin/main
 */

import { execFileSync, execSync } from 'child_process';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PATCHES_DIR = join(PROJECT_ROOT, 'patches');

// Parse --base flag (default: origin/main)
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE_REF = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : 'origin/main';

const SUBMODULES = [
  { path: 'packages/pear-wrk-wdk', patch: 'pear-wrk-wdk.patch' },
  { path: 'packages/wdk-react-native-provider', patch: 'wdk-react-native-provider.patch' },
  { path: 'examples/wdk-starter-react-native', patch: 'wdk-starter-react-native.patch' },
];

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 }).trimEnd();
}

mkdirSync(PATCHES_DIR, { recursive: true });

let ok = true;

for (const { path: subPath, patch } of SUBMODULES) {
  const absPath = join(PROJECT_ROOT, subPath);
  const name = basename(subPath);
  const patchFile = join(PATCHES_DIR, patch);

  // Ensure the remote ref is available locally
  try {
    run('git fetch origin', absPath);
  } catch {
    console.error(`  [${name}] git fetch failed — is the remote reachable?`);
    ok = false;
    continue;
  }

  // Verify the base ref exists
  try {
    run(`git rev-parse --verify ${BASE_REF}`, absPath);
  } catch {
    console.error(`  [${name}] base ref "${BASE_REF}" not found`);
    ok = false;
    continue;
  }

  // Write diff directly to file via shell redirection to avoid Node buffer limits.
  // `git diff` exits 0 even when there are changes, and 1 only on error.
  try {
    execFileSync('sh', ['-c', `git diff ${BASE_REF} > "${patchFile}"`], {
      cwd: absPath,
      stdio: ['ignore', 'ignore', 'pipe'],
      maxBuffer: 1024 * 1024 * 5,
    });
  } catch (err) {
    console.error(`  [${name}] git diff failed: ${err.stderr?.toString().trim()}`);
    ok = false;
    continue;
  }

  const bytes = statSync(patchFile).size;
  console.log(`  ${patch}  (${bytes} bytes)`);
}

if (!ok) {
  process.exit(1);
}

console.log('\nDone.');
