#!/usr/bin/env node
/**
 * Cross-platform setup script for arkade-wdk development environment
 * This script initializes submodules and sets up npm links for local development
 */

import { execSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

function run(cmd, cwd = PROJECT_ROOT) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
  } catch (error) {
    // Some commands may fail but we want to continue
    console.log(`  (command completed with warnings)`);
  }
}

// Symlink a local package into another package's node_modules directly,
// bypassing `npm link <path>`. We can't use `npm link` here because it
// re-runs the linked package's `prepare` script even with --ignore-scripts
// (prepare is part of the publish lifecycle and isn't gated by that flag
// in npm 10.x). For our dev-link use case the linked packages are already
// built — all we actually need is a symlink at node_modules/<pkg-name>.
function linkPackage(sourceDir, hostDir) {
  const pkg = JSON.parse(readFileSync(join(sourceDir, 'package.json'), 'utf8'));
  const targetPath = join(hostDir, 'node_modules', pkg.name);
  console.log(`> ln -sfn ${sourceDir} ${targetPath}`);
  mkdirSync(dirname(targetPath), { recursive: true });
  // rmSync removes symlinks themselves (without following) and directories
  // recursively, so this handles all three cases: symlink, real install, missing.
  rmSync(targetPath, { recursive: true, force: true });
  symlinkSync(sourceDir, targetPath);
}

// Apply a patch idempotently: skip if it's already applied (so reruns are safe).
// `git apply --reverse --check` succeeds only when the patch's changes are
// already present in the working tree.
function applyPatch(patchPath, cwd) {
  console.log(`> git apply ${patchPath}`);
  try {
    execSync(`git apply --reverse --check "${patchPath}"`, { cwd, stdio: 'pipe' });
    console.log('  (already applied, skipping)');
    return;
  } catch {
    // Not already applied — fall through and apply.
  }
  try {
    execSync(`git apply "${patchPath}"`, { cwd, stdio: 'inherit', shell: true });
  } catch {
    console.log('  (command completed with warnings)');
  }
}

console.log('=== Arkade WDK Development Setup ===\n');

// Initialize and update submodules
console.log('1. Initializing git submodules...');
run('git submodule update --init --recursive');

// Apply patches to submodules
console.log('\n2. Applying patches to submodules...');
const patchDir = join(PROJECT_ROOT, 'patches');
applyPatch(join(patchDir, 'pear-wrk-wdk.patch'), join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk'));
applyPatch(join(patchDir, 'wdk-react-native-provider.patch'), join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider'));
applyPatch(join(patchDir, 'wdk-starter-react-native.patch'), join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native'));

// Install dependencies for main package
console.log('\n3. Installing arkade-wdk dependencies...');
run('npm install');

// Patch bare-url@2.3.0 with the isURLSearchParams export that bare-fetch@2.8.2
// expects from bare-url@^2.4.0. Our npm override pins bare-url to 2.3.0 (the
// newest version react-native-bare-kit ships), but that version lacks this
// export. Adding it here avoids a runtime TypeError inside the worklet.
const bareUrlIndex = join(PROJECT_ROOT, 'node_modules', 'bare-url', 'index.js');
try {
  const src = readFileSync(bareUrlIndex, 'utf8');
  if (!src.includes('isURLSearchParams')) {
    const patch = `\nexports.isURLSearchParams = function isURLSearchParams(value) { return value instanceof URLSearchParams }\n`;
    writeFileSync(bareUrlIndex, src + patch);
    console.log('  patched bare-url with isURLSearchParams');
  }
} catch (err) {
  console.warn('  (bare-url patch skipped — file not found or unwritable:', err.message, ')');
}

// Setup pear-wrk-wdk submodule
console.log('\n4. Setting up pear-wrk-wdk...');
const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
// Install own deps without running postinstall — postinstall is
// gen:mobile-bundle, and bare-pack can't resolve @arkade-os/wdk until
// we link it in the next step (the worklet's wdk-manager.js does
// `await import('@arkade-os/wdk')` for the arkade branch).
run('npm install --ignore-scripts', pearWrkDir);
// Link @arkade-os/wdk via direct fs symlink rather than `npm link`,
// because npm link's internal install can prune other deps and replace
// the symlink with a snapshot if any later command runs npm install.
linkPackage(PROJECT_ROOT, pearWrkDir);
// Link shim packages into pear-wrk-wdk's node_modules.
// pack.imports.json maps `bare-type` → `bare-type-jsshim` and
// `bare-performance` → `bare-performance-jsshim`. Without these shims,
// the worklet bundle includes native binding.js files that try to load
// .so libraries react-native-bare-kit doesn't ship at matching versions.
linkPackage(join(pearWrkDir, 'shims', 'bare-abort-jsshim'), pearWrkDir);
linkPackage(join(pearWrkDir, 'shims', 'bare-performance-jsshim'), pearWrkDir);
linkPackage(join(pearWrkDir, 'shims', 'bare-stdio-jsshim'), pearWrkDir);
linkPackage(join(pearWrkDir, 'shims', 'bare-type-jsshim'), pearWrkDir);
// Now generate the mobile bundle — the @arkade-os/wdk symlink is in place.
run('npm run gen:mobile-bundle', pearWrkDir);

// Setup wdk-react-native-provider submodule
console.log('\n5. Setting up wdk-react-native-provider...');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');
// Install own deps without running scripts (prepare would fail without
// @arkade-os/wdk and @tetherto/pear-wrk-wdk linked).
run('npm install --ignore-scripts', providerDir);
// Link both packages via direct fs symlinks. Same reason as step 4:
// the previous version of this script used `npm link` here AND a
// follow-up `npm install --ignore-scripts` "to reinstall deps that
// npm link may have removed", which silently overwrote the symlink
// with a snapshot of pear-wrk-wdk and made the worklet bundle stale.
linkPackage(PROJECT_ROOT, providerDir);
linkPackage(pearWrkDir, providerDir);
// Build (prepare runs bob build + gen:secret-manager-bundle + gen:worker-bundle).
// gen:worker-bundle reads from node_modules/@tetherto/pear-wrk-wdk/src/wdk-worklet.js
// — that's now a symlink to the live submodule, so the bundle will pick up
// any local pear-wrk-wdk edits.
run('npm run prepare', providerDir);
// Remove duplicate copies of peer-dep packages so the example app's
// instance is used at runtime (avoids "Invalid hook call" from duplicate React)
run('rm -rf node_modules/react node_modules/react-native node_modules/react-dom node_modules/@types/react', providerDir);

// Setup wdk-starter-react-native example
console.log('\n6. Setting up wdk-starter-react-native example...');
const exampleDir = join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native');
// Install without scripts to avoid issues with missing linked packages
run('npm install --ignore-scripts', exampleDir);

// Install expo-crypto for Arkade support (if not already installed)
console.log('\n7. Ensuring expo-crypto is installed...');
run('npx expo install expo-crypto', exampleDir);

// Link local packages AFTER expo install (which would otherwise overwrite
// symlinks). We use direct fs symlinks rather than `npm link` because npm
// re-runs the provider's `prepare` script (which runs bob build → tsc) and
// that would fail here: step 5 deleted react/react-native from the provider's
// node_modules, so its tsc can no longer resolve `react`. The provider is
// already built; we only need the symlinks.
console.log('\n8. Linking local packages into example app...');
linkPackage(PROJECT_ROOT, exampleDir);
linkPackage(pearWrkDir, exampleDir);
linkPackage(providerDir, exampleDir);

console.log('\n=== Setup Complete ===\n');
console.log('The following packages are now linked:');
console.log('  - @arkade-os/wdk (from root)');
console.log('  - @tetherto/pear-wrk-wdk (from packages/pear-wrk-wdk)');
console.log('  - @tetherto/wdk-react-native-provider (from packages/)');
console.log('');
console.log('To run the example app:');
console.log('  cd examples/wdk-starter-react-native');
console.log('  npm run android  # or npm run ios');
console.log('');
console.log('Source ships from src/ — no build step. Edit and re-run.');
console.log('');
