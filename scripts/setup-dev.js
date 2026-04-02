#!/usr/bin/env node
/**
 * Cross-platform setup script for arkade-wdk development environment.
 *
 * Prerequisites — run these BEFORE this script:
 *   git submodule update --init --recursive
 *   git submodule foreach 'git checkout main && git pull origin main'
 *   node scripts/apply-patches.js
 *
 * This script installs dependencies and wires up local links so that
 * the example app resolves @arkade-os/wdk, pear-wrk-wdk, and the
 * provider from the monorepo working tree.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

function run(cmd, cwd = PROJECT_ROOT) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function tryRun(cmd, cwd = PROJECT_ROOT) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', shell: true });
  } catch {
    console.log('  (command completed with warnings)');
  }
}

const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');
const exampleDir = join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native');

console.log('=== Arkade WDK Development Setup ===\n');

// 1. Install root dependencies
console.log('1. Installing arkade-wdk dependencies...');
run('pnpm install');

// 2. Setup pear-wrk-wdk submodule
console.log('\n2. Setting up pear-wrk-wdk...');
run('pnpm install', pearWrkDir);
run(`pnpm link ${PROJECT_ROOT}`, pearWrkDir);

// 3. Setup wdk-react-native-provider (uses npm per its packageManager field)
//    Install deps first — this fetches pear-wrk-wdk from the registry and runs
//    `prepare` (bob build), which produces pre-built bundles under lib/module/.
//    Then copy the worklet bundles into src/ so that Metro (which resolves from
//    the src/ tree for the linked provider) can find them at runtime.
//    Finally, link local packages for development.
console.log('\n3. Setting up wdk-react-native-provider...');
run('npm install', providerDir);

// Copy pre-built worklet bundles from lib/ to src/ for Metro resolution
const wdkServiceSrc = join(providerDir, 'src', 'services', 'wdk-service');
const wdkServiceLib = join(providerDir, 'lib', 'module', 'services', 'wdk-service');
run(`cp ${join(wdkServiceLib, 'wdk-worklet.mobile.bundle.js')} ${wdkServiceSrc}/`);

run(`npm link ${PROJECT_ROOT} ${pearWrkDir}`, providerDir);

// 4. Setup wdk-starter-react-native example
console.log('\n4. Setting up wdk-starter-react-native example...');
run('pnpm install --ignore-scripts', exampleDir);
run(`pnpm link ${PROJECT_ROOT} ${pearWrkDir} ${providerDir}`, exampleDir);

console.log('\n=== Setup Complete ===\n');
console.log('The following packages are now linked:');
console.log('  - @arkade-os/wdk (from root)');
console.log('  - @tetherto/pear-wrk-wdk (from packages/pear-wrk-wdk)');
console.log('  - @tetherto/wdk-react-native-provider (from packages/wdk-react-native-provider)');
console.log('');
console.log('To run the example app:');
console.log('  cd examples/wdk-starter-react-native');
console.log('  pnpm run android  # or pnpm run ios');
console.log('');
