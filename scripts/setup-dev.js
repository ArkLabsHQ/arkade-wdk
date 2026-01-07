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

console.log('=== Arkade WDK Development Setup ===\n');

// Initialize and update submodules
console.log('1. Initializing git submodules...');
run('git submodule update --init --recursive');

// Install dependencies for main package
console.log('\n2. Installing arkade-wdk dependencies...');
run('npm install');

// Build the main package
console.log('\n3. Building arkade-wdk...');
run('npm run build');

// Create global link for arkade-wdk
console.log('\n4. Creating npm link for @arkade-os/wdk...');
run('npm link');

// Setup pear-wrk-wdk submodule (@wdk/bare)
console.log('\n5. Setting up pear-wrk-wdk (@wdk/bare)...');
const pearWrkDir = join(PROJECT_ROOT, 'packages', 'pear-wrk-wdk');
// Install dependencies (postinstall generates mobile bundle)
run('npm install', pearWrkDir);
// Link @arkade-os/wdk for Arkade blockchain support
run('npm link @arkade-os/wdk', pearWrkDir);
// Create global link for @wdk/bare
run('npm link', pearWrkDir);

// Setup wdk-react-native-provider submodule
console.log('\n6. Setting up wdk-react-native-provider...');
const providerDir = join(PROJECT_ROOT, 'packages', 'wdk-react-native-provider');
// Install without running scripts (prepare would fail without @arkade-os/wdk linked)
run('npm install --ignore-scripts', providerDir);
// Link @arkade-os/wdk and @wdk/bare BEFORE building
run('npm link @arkade-os/wdk @wdk/bare', providerDir);
// Now build (prepare script)
run('npm run prepare', providerDir);
// Create global link for the provider
run('npm link', providerDir);

// Setup wdk-starter-react-native example
console.log('\n7. Setting up wdk-starter-react-native example...');
const exampleDir = join(PROJECT_ROOT, 'examples', 'wdk-starter-react-native');
// Install without scripts to avoid issues with missing linked packages
run('npm install --ignore-scripts --legacy-peer-deps', exampleDir);
// Link all packages
run('npm link @arkade-os/wdk @wdk/bare @tetherto/wdk-react-native-provider', exampleDir);

// Install expo-crypto for Arkade support (if not already installed)
console.log('\n8. Ensuring expo-crypto is installed...');
run('npx expo install expo-crypto', exampleDir);

console.log('\n=== Setup Complete ===\n');
console.log('The following packages are now linked:');
console.log('  - @arkade-os/wdk (from root)');
console.log('  - @wdk/bare (from packages/pear-wrk-wdk)');
console.log('  - @tetherto/wdk-react-native-provider (from packages/)');
console.log('');
console.log('To run the example app:');
console.log('  cd examples/wdk-starter-react-native');
console.log('  npm run android  # or npm run ios');
console.log('');
console.log('To rebuild after changes:');
console.log('  npm run build  # in the root directory');
console.log('');
