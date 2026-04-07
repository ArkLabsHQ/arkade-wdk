#!/usr/bin/env node
/**
 * Cross-platform setup script for arkade-wdk development environment
 * This script initializes submodules and sets up npm links for local development
 */

import { execSync } from 'child_process';
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

// Setup pear-wrk-wdk submodule
console.log('\n4. Setting up pear-wrk-wdk...');
const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
// Install dependencies (postinstall generates mobile bundle)
run('npm install', pearWrkDir);
// Link @arkade-os/wdk for Arkade blockchain support
run(`npm link ${PROJECT_ROOT}`, pearWrkDir);

// Setup wdk-react-native-provider submodule
console.log('\n5. Setting up wdk-react-native-provider...');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');
// Install without running scripts (prepare would fail without @arkade-os/wdk linked)
run('npm install --ignore-scripts', providerDir);
// Link @arkade-os/wdk and @tetherto/pear-wrk-wdk BEFORE building
run(`npm link ${PROJECT_ROOT} ${pearWrkDir}`, providerDir);
// Reinstall deps that npm link may have removed
run('npm install --ignore-scripts', providerDir);
// Now build (prepare script)
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

// Link local packages AFTER expo install (which would otherwise overwrite symlinks).
// `--ignore-scripts` is required because the provider's `prepare` script runs
// `bob build` (→ tsc), which would fail here: step 5 deleted react/react-native
// from the provider's node_modules to avoid duplicate-React at runtime, so the
// provider's tsc can no longer resolve `react`. The provider was already built
// successfully in step 5, so we just need the symlinks — no rebuild.
console.log('\n8. Linking local packages into example app...');
run(`npm link --ignore-scripts ${PROJECT_ROOT} ${pearWrkDir} ${providerDir}`, exampleDir);

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
