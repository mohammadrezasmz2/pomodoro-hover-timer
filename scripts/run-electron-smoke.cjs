const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const base = path.join(__dirname, '..', '.test-tmp');
fs.mkdirSync(base, {recursive: true});
const data = fs.mkdtempSync(path.join(base, 'electron-'));
try {
  for (const phase of ['write', 'restore']) {
    const result = spawnSync(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
      env: {...process.env, POMODORO_SMOKE_DATA: data, POMODORO_SMOKE_PHASE: phase},
      timeout: 45000, encoding: 'utf8', windowsHide: true,
    });
    process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
    if (result.error || result.status !== 0) throw result.error || new Error(`Electron ${phase} failed: ${result.status}`);
  }
} finally { fs.rmSync(data, {recursive: true, force: true}); }
