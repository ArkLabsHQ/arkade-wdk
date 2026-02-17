#!/usr/bin/env node
/**
 * Cross-platform setup script for arkade-wdk development environment
 * This script initializes submodules, applies Arkade patches, and sets up npm links
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const PATCHES_DIR = join(PROJECT_ROOT, 'patches');

function run(cmd, cwd = PROJECT_ROOT, exitOnError = false) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
  } catch (error) {
    if (exitOnError) {
      console.error(`  ERROR: Command failed`);
      process.exit(1);
    }
    console.log(`  (command completed with warnings)`);
  }
}

function applyPatch(patchName, targetDir) {
  const patchPath = join(PATCHES_DIR, patchName);
  if (!existsSync(patchPath)) {
    console.log(`  Warning: Patch ${patchName} not found, skipping`);
    return false;
  }

  console.log(`  Applying ${patchName}...`);
  try {
    // Check if patch can be applied (--check does a dry run)
    execSync(`git apply --check "${patchPath}"`, { cwd: targetDir, stdio: 'pipe', shell: true });
    // Apply the patch
    execSync(`git apply "${patchPath}"`, { cwd: targetDir, stdio: 'inherit', shell: true });
    console.log(`  ✓ Patch applied successfully`);
    return true;
  } catch (error) {
    // Patch might already be applied or conflict
    console.log(`  Patch already applied or conflicts exist, skipping`);
    return false;
  }
}

console.log('=== Arkade WDK Development Setup ===\n');

// Initialize and update submodules (reset to clean state)
console.log('1. Initializing git submodules...');
run('git submodule update --init --recursive');

// Apply Arkade patches to submodules
console.log('\n2. Applying Arkade patches to submodules...');
const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');

applyPatch('pear-wrk-wdk.patch', pearWrkDir);
applyPatch('wdk-react-native-provider.patch', providerDir);

// Install dependencies for main package
console.log('\n3. Installing arkade-wdk dependencies...');
run('npm install');

// Build the main package
console.log('\n4. Building arkade-wdk...');
run('npm run build');

// Create global link for arkade-wdk
console.log('\n5. Creating npm link for @arkade-os/wdk...');
run('npm link');

// Setup pear-wrk-wdk submodule (@tetherto/pear-wrk-wdk)
console.log('\n6. Setting up pear-wrk-wdk (@tetherto/pear-wrk-wdk)...');
// Install dependencies without postinstall (bundle generation requires internal Tether tooling)
run('npm install --ignore-scripts', pearWrkDir);
// Link @arkade-os/wdk for Arkade blockchain support (used via dynamic import at runtime)
run('npm link @arkade-os/wdk', pearWrkDir);
// Create global link for @tetherto/pear-wrk-wdk
// Note: Bundle generation skipped - uses existing bundle + npm link for Arkade
run('npm link', pearWrkDir);

// Setup wdk-react-native-provider submodule
console.log('\n7. Setting up wdk-react-native-provider...');
// Install without running scripts (prepare/bundle generation requires internal Tether tooling)
run('npm install --ignore-scripts', providerDir);
// Link @arkade-os/wdk and @tetherto/pear-wrk-wdk
run('npm link @arkade-os/wdk @tetherto/pear-wrk-wdk', providerDir);
// Build TypeScript only (skip bundle generation which requires internal tooling)
run('npx bob build', providerDir);
// Create global link for the provider
run('npm link', providerDir);

// Setup wdk-starter-react-native example
console.log('\n8. Setting up wdk-starter-react-native example...');
const exampleDir = join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native');
// Install without scripts to avoid issues with missing linked packages
run('npm install --ignore-scripts --legacy-peer-deps', exampleDir);
// Link all packages
run('npm link @arkade-os/wdk @tetherto/pear-wrk-wdk @tetherto/wdk-react-native-provider', exampleDir);

// Install expo-crypto for Arkade support
// Use npm directly with --ignore-scripts to avoid triggering postinstall in linked packages
console.log('\n9. Ensuring expo-crypto is installed...');
run('npm install expo-crypto --ignore-scripts --legacy-peer-deps', exampleDir);
// Re-link packages (npm install may have overwritten symlinks)
run('npm link @arkade-os/wdk @tetherto/pear-wrk-wdk @tetherto/wdk-react-native-provider', exampleDir);

console.log('\n=== Setup Complete ===\n');
console.log('The following packages are now linked:');
console.log('  - @arkade-os/wdk (from root)');
console.log('  - @tetherto/pear-wrk-wdk (from packages/pear-wrk-wdk, patched for Arkade)');
console.log('  - @tetherto/wdk-react-native-provider (from packages/, patched for Arkade)');
console.log('');
console.log('Arkade patches applied from patches/ directory:');
console.log('  - pear-wrk-wdk.patch (adds Arkade blockchain support to WdkManager)');
console.log('  - wdk-react-native-provider.patch (adds Arkade network type)');
console.log('');
console.log('To run the example app:');
console.log('  cd examples/wdk-starter-react-native');
console.log('  npm run android  # or npm run ios');
console.log('');
console.log('To rebuild after changes:');
console.log('  npm run build  # in the root directory');
console.log('');
