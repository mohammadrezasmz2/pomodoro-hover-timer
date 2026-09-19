const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  'main.js',
  'preload.js',
  '_startwatch.ps1',
  'renderer/index.html',
  'renderer/app.js',
  'renderer/core.js',
  'lib/state-store.js',
  'lib/window-layout.js',
  'lib/ipc-policy.js',
  'package-lock.json',
  'packaging/windows/_launch.ps1',
  'renderer/styles.css',
  'renderer/jalali.js',
  'renderer/stats.html',
  'renderer/stats.js',
  'renderer/stats.css',
  'build/icon.ico',
  'build/icon.png',
  'build/tray.png',
  'package.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md'
];

const jsFiles = [
  'main.js',
  'preload.js',
  'renderer/app.js',
  'renderer/jalali.js',
  'renderer/stats.js',
  'renderer/core.js', 'lib/state-store.js', 'lib/window-layout.js', 'lib/ipc-policy.js',
  'scripts/run-electron-smoke.cjs', 'scripts/electron-smoke.cjs'
];

let failed = false;
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`Missing required file: ${rel}`);
    failed = true;
  }
}

for (const rel of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, rel)], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    console.error(`JavaScript syntax check failed: ${rel}`);
    process.stderr.write(result.stderr || result.stdout || '');
    failed = true;
  } else {
    console.log(`OK syntax: ${rel}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== pkg.version || lock.packages[''].devDependencies.electron !== pkg.devDependencies.electron || lock.packages['node_modules/electron'].version !== pkg.devDependencies.electron) {
  console.error('package-lock.json must match the application and Electron versions'); failed = true;
}
if (pkg.main !== 'main.js') {
  console.error('package.json main must point to main.js');
  failed = true;
}
if (pkg.license !== 'MIT') {
  console.error('package.json license must be MIT');
  failed = true;
}

const indexHtml = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
for (const ref of ['styles.css', 'core.js', 'app.js']) {
  if (!indexHtml.includes(ref)) {
    console.error(`renderer/index.html does not reference ${ref}`);
    failed = true;
  }
}

const statsHtml = fs.readFileSync(path.join(root, 'renderer/stats.html'), 'utf8');
for (const ref of ['stats.css', 'jalali.js', 'stats.js']) {
  if (!statsHtml.includes(ref)) {
    console.error(`renderer/stats.html does not reference ${ref}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('Repository checks passed.');
