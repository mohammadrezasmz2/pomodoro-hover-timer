const fs = require('node:fs');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const base = path.join(__dirname, '..', '.test-tmp');
fs.mkdirSync(base, {recursive: true});
const data = fs.mkdtempSync(path.join(base, 'electron-'));
async function run(phase) {
  await new Promise((resolve, reject) => {
    const cli = path.join(__dirname, '..', 'node_modules', 'electron', 'cli.js');
    const child = spawn(process.execPath, [cli, path.join(__dirname, 'electron-smoke.cjs')], {
      env: {...process.env, POMODORO_SMOKE_DATA: data, POMODORO_SMOKE_PHASE: phase},
      stdio: 'inherit', windowsHide: true,
    });
    const timer = setTimeout(() => {
      console.error('Electron smoke timeout:', phase);
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {stdio: 'inherit'});
      else child.kill('SIGKILL');
      reject(new Error('Electron smoke timed out'));
    }, 40000);
    child.on('error', error => {clearTimeout(timer); reject(error);});
    child.on('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`Electron ${phase} failed: ${code}`));
    });
  });
}
(async () => {
  try { for (const phase of ['write', 'restore']) await run(phase); }
  finally { fs.rmSync(data, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
