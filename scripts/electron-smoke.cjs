// Runs the real application against disposable data on a Windows CI runner.
const {app, dialog, screen} = require('electron');
// Never let an application error open an unattended modal on the CI desktop.
dialog.showErrorBox = (title, message) => { console.error(title, message); app.exit(1); };
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.POMODORO_SMOKE_DATA;
if (!root) throw new Error('Use npm run test:electron to create isolated test data');
const phase = process.env.POMODORO_SMOKE_PHASE;
console.log('Starting Electron smoke phase:', phase);
const documents = path.join(root, 'documents');
const userData = path.join(root, 'userData');
fs.mkdirSync(documents, {recursive: true}); fs.mkdirSync(userData, {recursive: true});
app.setPath('documents', documents); app.setPath('userData', userData);
const dataFile = path.join(documents, 'Pomodoro Timing', 'pomodoro-data.json');
const errors = [];
let assertionsFinished = false;
const timeout = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 30000);
app.on('will-quit', () => {
  clearTimeout(timeout);
  try {
    assert(assertionsFinished, 'App quit before the smoke assertions finished');
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(saved.timers[0].title, 'Smoke title saved immediately');
    assert.equal(saved.notes.today.text, 'یادداشت ذخیرهٔ سریع');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log(`PASS Electron ${process.versions.electron}: ${phase}, IPC, CSP, responsive layout and quit persistence`);
  } catch (e) { console.error(e); app.exit(1); }
});
app.on('browser-window-created', (_event, win) => {
  console.log('Main window created');
  win.webContents.on('console-message', details => {
    const message = details.message || '';
    if (/Uncaught|Refused to .*Content Security Policy/i.test(message)) errors.push(message);
  });
  win.webContents.once('did-finish-load', async () => {
    console.log('Renderer loaded');
    try {
      const run = code => win.webContents.executeJavaScript(code, true);
      for (let tries = 0; !await run('typeof stateReady !== "undefined" && stateReady'); tries++) {
        if (tries > 50) throw new Error('Renderer did not restore state');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(process.versions.electron, require('../package.json').devDependencies.electron);
      console.log('State restored');
      assert.equal(await run('typeof window.desktop.loadData'), 'function');
      assert.equal(await run('typeof require'), 'undefined');
      assert.equal(await run('typeof window.desktop.onReveal(() => {})'), 'function');
      win.show(); win.webContents.send('reveal');
      if (phase === 'restore') {
        assert.equal(await run('state.timers[0].title'), 'Smoke title saved immediately');
        assert.equal(await run('state.notes.today.text'), 'یادداشت ذخیرهٔ سریع');
      }
      await run("state.settings.language='en'; state.settings.theme='light'; refreshLocalizedUI(); document.getElementById('statsBtn').click();");
      assert.equal(await run('statsDockOpen'), true);
      console.log('Statistics dock opened');
      await run("pushStatsState();");
      for (let tries = 0; !await run("!!document.getElementById('statsFrame').contentDocument?.body.classList.contains('theme-light')"); tries++) {
        if (tries > 40) throw new Error('Statistics iframe did not receive the parent state');
        await new Promise(resolve => setTimeout(resolve, 50));
        await run('pushStatsState()');
      }
      const nativeWidth = Math.min(1060, screen.getDisplayMatching(win.getBounds()).workArea.width);
      for (const width of [nativeWidth, 800, 480]) {
        console.log('Testing viewport:', width);
        win.setSize(nativeWidth, 700);
        win.webContents.setZoomFactor(nativeWidth / width);
        await new Promise(resolve => setTimeout(resolve, 200));
        const geometry = await run("(() => { const p=document.getElementById('panel').getBoundingClientRect(); return {left:p.left,right:p.right,width:innerWidth}; })()");
        assert(geometry.left >= 0 && geometry.right <= geometry.width + 1, JSON.stringify(geometry));
        assert(Math.abs(geometry.width - width) <= 2, JSON.stringify(geometry));
        assert(await run("Array.from(document.querySelectorAll('.js-del')).every(button => button.getBoundingClientRect().right <= innerWidth)"));
      }
      win.webContents.setZoomFactor(1);
      await run('syncSize()');
      await new Promise(resolve => setTimeout(resolve, 200));
      assert(await run("document.getElementById('statsDock').getBoundingClientRect().height >= 150"));
      assert(await run("document.documentElement.scrollHeight >= document.getElementById('panel').offsetHeight"));
      if (phase === 'write') {
        const output = path.join(__dirname, '..', 'test-results');
        fs.mkdirSync(output, {recursive: true});
        await new Promise(resolve => setTimeout(resolve, 300));
        fs.writeFileSync(path.join(output, 'calendar-light.png'), (await win.capturePage()).toPNG());
        await run("state.settings.theme='dark'; state.settings.language='fa'; refreshLocalizedUI(); setStatsDock(false);");
        await new Promise(resolve => setTimeout(resolve, 300));
        fs.writeFileSync(path.join(output, 'panel-persian.png'), (await win.capturePage()).toPNG());
      }
      await run('setStatsDock(false)');
      // Trigger input rather than blur; then quit before the 700ms debounce.
      await run("(() => { const title=document.querySelector('.js-title'); title.textContent='Smoke title saved immediately'; title.dispatchEvent(new Event('input')); const note=document.getElementById('noteToday'); note.value='یادداشت ذخیرهٔ سریع'; note.dispatchEvent(new Event('input')); })()");
      assertionsFinished = true;
      console.log('Requesting immediate quit');
      await run('window.desktop.quit()');
    } catch (e) { console.error(e); console.error(errors.join('\n')); app.exit(1); }
  });
});
require('../main');
