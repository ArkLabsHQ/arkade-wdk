#!/usr/bin/env node
/**
 * Regenerate submodule patch files.
 *
 * Each patch captures the diff between the SHA the parent repo has pinned for
 * the submodule (or the ref given via --base) and the current working tree of
 * the submodule, so that local changes can be re-applied after a fresh
 * `git submodule update`.
 *
 * Defaulting to the pinned SHA — rather than `origin/main` — keeps the patch
 * stable when upstream moves: with `origin/main` as the base, any commits
 * landed upstream after the pinned SHA appear in the diff as deletions, which
 * inflates the patch and breaks `git apply` against a fresh submodule
 * checkout.
 *
 * Usage:
 *   node scripts/generate-patches.js              # base = parent's pinned SHA per submodule
 *   node scripts/generate-patches.js --base origin/main
 */

import { execFileSync, execSync } from 'child_process';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PATCHES_DIR = join(PROJECT_ROOT, 'patches');

// Parse --base flag. When unset, each submodule uses the SHA pinned by the
// parent repo (resolved per-submodule below).
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE_REF_OVERRIDE = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : null;

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

  // Resolve the base ref. When the caller didn't pass --base, use the SHA the
  // parent repo has pinned for this submodule — `ls-tree` on the gitlink
  // returns it without needing the submodule to be fetched/checked out.
  let baseRef;
  if (BASE_REF_OVERRIDE) {
    baseRef = BASE_REF_OVERRIDE;
  } else {
    try {
      const entry = run(`git ls-tree HEAD ${subPath}`, PROJECT_ROOT);
      // Format: "<mode> commit <sha>\t<path>"
      const match = /^\S+\s+commit\s+([0-9a-f]{40})\s/.exec(entry);
      if (!match) throw new Error(`unexpected ls-tree output: ${entry}`);
      baseRef = match[1];
    } catch (err) {
      console.error(`  [${name}] could not resolve pinned SHA: ${err.message}`);
      ok = false;
      continue;
    }
  }

  // Only fetch when the caller passed an explicit ref — otherwise we're
  // diffing against a SHA that's already present locally (it's checked out)
  // and `git fetch` would just slow things down and risk advancing refs the
  // user didn't want moved.
  if (BASE_REF_OVERRIDE) {
    try {
      run('git fetch origin', absPath);
    } catch {
      console.error(`  [${name}] git fetch failed — is the remote reachable?`);
      ok = false;
      continue;
    }
  }

  // Verify the base ref exists in the submodule
  try {
    run(`git rev-parse --verify ${baseRef}`, absPath);
  } catch {
    console.error(`  [${name}] base ref "${baseRef}" not found in submodule`);
    ok = false;
    continue;
  }

  // Write diff directly to file via shell redirection to avoid Node buffer limits.
  // `git diff` exits 0 even when there are changes, and 1 only on error.
  try {
    execFileSync('sh', ['-c', `git diff ${baseRef} > "${patchFile}"`], {
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
  const shortBase = baseRef.length === 40 ? baseRef.slice(0, 7) : baseRef;
  console.log(`  ${patch}  (${bytes} bytes, base ${shortBase})`);
}

if (!ok) {
  process.exit(1);
}

console.log('\nDone.');
