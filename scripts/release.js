#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tag = `v${version}`;

function run(cmd, opts = {}) {
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
}

const existingTags = execSync('git tag', { cwd: root }).toString().trim().split('\n');
if (existingTags.includes(tag)) {
  console.error(`Tag ${tag} already exists. Bump the version before releasing.`);
  process.exit(1);
}

run(`git tag ${tag}`);

try {
  run('npm publish');
} catch (err) {
  run(`git tag -d ${tag}`);
  console.error(`Publish failed — tag ${tag} removed.`);
  process.exit(1);
}

run(`git push origin ${tag}`);
