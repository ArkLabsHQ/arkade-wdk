#!/usr/bin/env node
/**
 * Cross-platform setup script for arkade-wdk v2 development environment
 * Uses v2 branches of pear-wrk-wdk and wdk-react-native-provider
 * Uses develop branch of wdk-starter-react-native example
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
    return true;
  } catch (error) {
    if (exitOnError) {
      console.error(`  ERROR: Command failed`);
      process.exit(1);
    }
    console.log(`  (command completed with warnings)`);
    return false;
  }
}

function runStrict(cmd, cwd = PROJECT_ROOT) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
    return true;
  } catch (error) {
    console.error(`  ERROR: Command failed: ${cmd}`);
    throw error;
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

function checkoutBranch(dir, remoteBranch, name) {
  console.log(`\n  Switching ${name} to ${remoteBranch}...`);

  // First, discard any local changes
  console.log(`  Resetting local changes...`);
  run('git checkout .', dir);
  run('git clean -fd', dir);

  // Fetch latest from origin
  console.log(`  Fetching from origin...`);
  runStrict('git fetch origin', dir);

  // Checkout the remote branch in detached HEAD
  console.log(`  Checking out ${remoteBranch}...`);
  runStrict(`git checkout ${remoteBranch} --detach`, dir);

  // Verify we're on the right commit
  try {
    const headRef = execSync('git rev-parse --short HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
    console.log(`  ✓ ${name} now at commit ${headRef}`);
  } catch (e) {
    console.log(`  ✓ ${name} switched to ${remoteBranch}`);
  }
}

console.log('=== Arkade WDK v2 Development Setup ===\n');
console.log('This setup uses:');
console.log('  - pear-wrk-wdk v2 branch');
console.log('  - wdk-react-native-provider v2 branch');
console.log('  - wdk-starter-react-native develop branch\n');

const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');
const exampleDir = join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native');

// Reset submodules first to clear any local changes
console.log('1. Resetting submodules to clean state...');
run('git submodule foreach --recursive git checkout .', PROJECT_ROOT);
run('git submodule foreach --recursive git clean -fd', PROJECT_ROOT);

// Initialize submodules
console.log('\n2. Initializing git submodules...');
run('git submodule update --init --recursive');

// Checkout v2 branches for submodules
console.log('\n3. Checking out v2/develop branches...');

try {
  checkoutBranch(pearWrkDir, 'origin/v2', 'pear-wrk-wdk');
  checkoutBranch(providerDir, 'origin/v2', 'wdk-react-native-provider');
  checkoutBranch(exampleDir, 'origin/develop', 'wdk-starter-react-native');
} catch (error) {
  console.error('\nFailed to checkout branches. Please ensure submodules are properly initialized.');
  console.error('Try running: git submodule update --init --recursive');
  process.exit(1);
}

// Apply Arkade patches to submodules
console.log('\n4. Applying Arkade v2 patches to submodules...');
applyPatch('pear-wrk-wdk-v2.patch', pearWrkDir);
applyPatch('wdk-react-native-provider-v2.patch', providerDir);
applyPatch('wdk-starter-react-native-v2.patch', exampleDir);

// Install dependencies for main package
console.log('\n5. Installing arkade-wdk dependencies...');
run('npm install');

// Build the main package
console.log('\n6. Building arkade-wdk...');
run('npm run build');

// Create global link for arkade-wdk
console.log('\n7. Creating npm link for @arkade-os/wdk...');
run('npm link');

// Setup pear-wrk-wdk v2 submodule
console.log('\n8. Setting up pear-wrk-wdk v2 (@tetherto/pear-wrk-wdk)...');
// Install dependencies without postinstall (bundle generation requires internal Tether tooling)
run('npm install --ignore-scripts', pearWrkDir);
// Link @arkade-os/wdk for Arkade blockchain support (used via dynamic import at runtime)
run('npm link @arkade-os/wdk', pearWrkDir);
// Create global link for @tetherto/pear-wrk-wdk
run('npm link', pearWrkDir);

// Setup wdk-react-native-provider v2 submodule
console.log('\n9. Setting up wdk-react-native-provider v2...');

// Setup individual v2 packages
const workletDir = join(providerDir, 'wdk-rn-worklet');
const secureStorageDir = join(providerDir, 'wdk-rn-secure-storage');
const balanceFetcherDir = join(providerDir, 'wdk-rn-balance-fetcher');

// Install secure-storage first (dependency of worklet)
if (existsSync(secureStorageDir)) {
  console.log('  Installing wdk-rn-secure-storage...');
  run('npm install --ignore-scripts', secureStorageDir);
}

// Install balance-fetcher
if (existsSync(balanceFetcherDir)) {
  console.log('  Installing wdk-rn-balance-fetcher...');
  run('npm install --ignore-scripts', balanceFetcherDir);
}

// Install and link worklet package
if (existsSync(workletDir)) {
  console.log('  Installing wdk-rn-worklet...');
  run('npm install --ignore-scripts', workletDir);
  run('npm link @arkade-os/wdk @tetherto/pear-wrk-wdk', workletDir);
}

// Setup wdk-starter-react-native example (develop branch)
console.log('\n10. Setting up wdk-starter-react-native example (develop branch)...');
// Install without scripts to avoid issues with missing linked packages
run('npm install --ignore-scripts --legacy-peer-deps', exampleDir);

// Fix @tetherto packages to use src instead of dist (they're git dependencies without built dist)
console.log('  Fixing @tetherto package.json files to use src/index.ts...');
const tethertoPkgsDir = join(exampleDir, 'node_modules', '@tetherto');
if (existsSync(tethertoPkgsDir)) {
  const { readdirSync, readFileSync, writeFileSync } = await import('fs');
  for (const pkg of readdirSync(tethertoPkgsDir)) {
    const pkgJsonPath = join(tethertoPkgsDir, pkg, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        let content = readFileSync(pkgJsonPath, 'utf-8');
        if (content.includes('"main": "dist/index.js"') || content.includes('"main": "./dist/index.js"')) {
          content = content
            .replace(/"main": "dist\/index\.js"/g, '"main": "src/index.ts"')
            .replace(/"main": "\.\/dist\/index\.js"/g, '"main": "./src/index.ts"')
            .replace(/"types": "dist\/index\.d\.ts"/g, '"types": "src/index.ts"')
            .replace(/"types": "\.\/dist\/index\.d\.ts"/g, '"types": "./src/index.ts"')
            .replace(/"default": "dist\/index\.js"/g, '"default": "src/index.ts"')
            .replace(/"default": "\.\/dist\/index\.js"/g, '"default": "./src/index.ts"');
          writeFileSync(pkgJsonPath, content);
          console.log(`    Fixed ${pkg}/package.json`);
        }
      } catch (e) {
        // Ignore errors for individual packages
      }
    }
  }
}

// Link packages
run('npm link @arkade-os/wdk @tetherto/pear-wrk-wdk', exampleDir);

console.log('\n=== v2 Setup Complete ===\n');
console.log('The following packages are now linked:');
console.log('  - @arkade-os/wdk (from root)');
console.log('  - @tetherto/pear-wrk-wdk v2 (from packages/pear-wrk-wdk, patched for Arkade)');
console.log('  - wdk-react-native-provider v2 packages (from packages/wdk-react-native-provider)');
console.log('');
console.log('Arkade v2 patches applied from patches/ directory:');
console.log('  - pear-wrk-wdk-v2.patch (adds Arkade to schema.json wallet modules)');
console.log('  - wdk-react-native-provider-v2.patch (updates pear-wrk-wdk package name)');
console.log('  - wdk-starter-react-native-v2.patch (adds Arkade network config to example app)');
console.log('');
console.log('To run the example app:');
console.log('  cd examples/wdk-starter-react-native');
console.log('  npm run android  # or npm run ios');
console.log('');
console.log('To rebuild after changes:');
console.log('  npm run build  # in the root directory');
console.log('');
