#!/usr/bin/env node
/**
 * Cross-platform setup script for arkade-wdk development environment
 * This script initializes submodules and sets up pnpm links for local development
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

console.log('=== Arkade WDK Development Setup ===\n');

// Initialize and update submodules
console.log('1. Initializing git submodules...');
run('git submodule update --init --recursive');

// Install dependencies for main package
console.log('\n2. Installing arkade-wdk dependencies...');
run('pnpm install');

// Build the main package
console.log('\n3. Building arkade-wdk...');
run('pnpm run build');

// Setup pear-wrk-wdk submodule
console.log('\n4. Setting up pear-wrk-wdk...');
const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
// Install dependencies (postinstall generates mobile bundle)
run('pnpm install', pearWrkDir);
// Link @arkade-os/wdk for Arkade blockchain support
run(`pnpm link ${PROJECT_ROOT}`, pearWrkDir);

// Setup wdk-react-native-provider submodule
console.log('\n5. Setting up wdk-react-native-provider...');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');
// Install without running scripts (prepare would fail without @arkade-os/wdk linked)
run('pnpm install --ignore-scripts', providerDir);
// Link @arkade-os/wdk and @tetherto/pear-wrk-wdk BEFORE building
run(`pnpm link ${PROJECT_ROOT} ${pearWrkDir}`, providerDir);
// Now build (prepare script)
run('pnpm run prepare', providerDir);

// Setup wdk-starter-react-native example
console.log('\n6. Setting up wdk-starter-react-native example...');
const exampleDir = join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native');
// Install without scripts to avoid issues with missing linked packages
run('pnpm install --ignore-scripts', exampleDir);
// Link all packages
run(`pnpm link ${PROJECT_ROOT} ${pearWrkDir} ${providerDir}`, exampleDir);

// Install expo-crypto for Arkade support (if not already installed)
console.log('\n7. Ensuring expo-crypto is installed...');
run('npx expo install expo-crypto', exampleDir);

console.log('\n=== Setup Complete ===\n');
console.log('The following packages are now linked:');
console.log('  - @arkade-os/wdk (from root)');
console.log('  - @tetherto/pear-wrk-wdk (from packages/pear-wrk-wdk)');
console.log('  - @tetherto/wdk-react-native-provider (from packages/)');
console.log('');
console.log('To run the example app:');
console.log('  cd examples/wdk-starter-react-native');
console.log('  pnpm run android  # or pnpm run ios');
console.log('');
console.log('To rebuild after changes:');
console.log('  pnpm run build  # in the root directory');
console.log('');
