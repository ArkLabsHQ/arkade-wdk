#!/usr/bin/env node
/**
 * Save current submodule changes as patches
 * Run this after making changes to submodules that need to be preserved
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PATCHES_DIR = join(PROJECT_ROOT, 'patches');

// Ensure patches directory exists
if (!existsSync(PATCHES_DIR)) {
  mkdirSync(PATCHES_DIR, { recursive: true });
}

function savePatch(submodulePath, patchName, files) {
  const fullPath = join(PROJECT_ROOT, submodulePath);
  const patchPath = join(PATCHES_DIR, patchName);

  console.log(`\nGenerating ${patchName}...`);

  try {
    // Try unstaged changes first, then staged
    let diff = '';
    try {
      diff = execSync(`git diff --no-color -- ${files.join(' ')}`, {
        cwd: fullPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (e) {}

    if (!diff || diff.trim() === '') {
      // Try staged changes
      try {
        diff = execSync(`git diff --cached --no-color -- ${files.join(' ')}`, {
          cwd: fullPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (e) {}
    }

    if (diff && diff.trim() !== '') {
      writeFileSync(patchPath, diff);
      console.log(`  ✓ Saved to ${patchName}`);
      return true;
    } else {
      console.log(`  No changes to save for ${submodulePath}`);
      return false;
    }
  } catch (error) {
    console.error(`  Error generating patch: ${error.message}`);
    return false;
  }
}

console.log('=== Saving Arkade Patches ===');

// pear-wrk-wdk patch
savePatch(
  'packages/pear-wrk-wdk',
  'pear-wrk-wdk.patch',
  ['pack.imports.json', 'package.json', 'src/wdk-core/wdk-manager.js']
);

// wdk-react-native-provider patch
savePatch(
  'packages/wdk-react-native-provider',
  'wdk-react-native-provider.patch',
  ['package.json', 'src/services/wdk-service/index.ts', 'src/services/wdk-service/types.ts']
);

console.log('\n=== Done ===');
console.log('Patches saved to patches/ directory');
console.log('These will be automatically applied by npm run setup:dev');
