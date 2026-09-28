const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');
const root = path.join(__dirname, '..');
const snapshot = (settings = {}) => ({revision: 1, timers: [{id: 1, title: 'Task'}], history: [], settings});

// Exercise the real main process with deterministic OS inputs and disposable data.
function harness(t, saved = null, data = null) {
  if (!data) {
    const base = path.join(root, '.test-tmp');
    fs.mkdirSync(base, {recursive: true});
    data = fs.mkdtempSync(path.join(base, 'main-'));
    t.after(() => fs.rmSync(data, {recursive: true, force: true}));
  }
  const dataDir = path.join(data, 'Pomodoro Timing');
  fs.mkdirSync(dataDir, {recursive: true});
  if (saved) fs.writeFileSync(path.join(dataDir, 'pomodoro-data.json'), JSON.stringify(saved));
  const app = new EventEmitter(), ipcMain = new EventEmitter(), screen = new EventEmitter();
  const display = {id: 1, bounds: {x: 0, y: 0, width: 1920, height: 1080}, workArea: {x: 0, y: 0, width: 1920, height: 1040}};
  let cursor = {x: 960, y: 0}, ready, win, tray, shortcut, poll;
  const watcher = new EventEmitter(); watcher.stdout = new EventEmitter(); watcher.kill = () => {};
  app.requestSingleInstanceLock = () => true;
  app.whenReady = () => ({then: callback => {ready = callback;}});
  app.getPath = () => data;
  app.quit = () => {}; app.relaunch = () => {};
  ipcMain.handle = () => {};
  screen.getCursorScreenPoint = () => cursor;
  screen.getPrimaryDisplay = () => display;
  screen.getAllDisplays = () => [display];
  screen.getDisplayNearestPoint = () => display;
  class BrowserWindow extends EventEmitter {
    constructor(bounds) {
      super(); win = this; this.bounds = bounds; this.shown = false; this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {url: require('node:url').pathToFileURL(path.join(root, 'renderer/index.html')).href};
      this.webContents.session = {setPermissionRequestHandler() {}, setPermissionCheckHandler() {}};
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (...args) => this.messages.push(args);
    }
    isDestroyed() { return false; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} loadFile() {} focus() {}
    setBounds(bounds) { this.bounds = bounds; }
    setPosition(x, y) { this.bounds = {...this.bounds, x, y}; }
    getPosition() { return [this.bounds.x, this.bounds.y]; }
    show() { this.shown = true; } showInactive() { this.show(); } hide() { this.shown = false; }
  }
  class Tray extends EventEmitter {
    constructor() { super(); tray = this; }
    setContextMenu(menu) { this.menu = menu; } setToolTip() {}
  }
  const electron = {app, BrowserWindow, ipcMain, screen, Tray, Menu: {buildFromTemplate: x => x}, nativeImage: {createFromPath: () => ({isEmpty: () => false})}, globalShortcut: {register: (_key, callback) => {shortcut = callback;}}, dialog: {}, shell: {}};
  const localRequire = createRequire(path.join(root, 'main.js'));
  const context = vm.createContext({
    require: name => name === 'electron' ? electron : name === 'child_process' ? {spawn: () => watcher} : localRequire(name),
    __dirname: root, Buffer, console,
    process: {argv: [], platform: 'win32', on() {}},
    setInterval: callback => {poll = callback;},
    setTimeout: callback => callback, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
  ready();
  const ipc = (channel, ...args) => ipcMain.emit(channel, {sender: win.webContents, senderFrame: win.webContents.mainFrame}, ...args);
  const hide = () => {
    ipc('hide-window');
    const message = win.messages.findLast(([name]) => name === 'conceal');
    if (message) ipc('conceal-done', message[1]);
  };
  return {data, dataDir, win, tray, watcher, app, ipc, hide, poll: () => poll(), shortcut: () => shortcut(), move: p => {cursor = p;}, run: code => vm.runInContext(code, context)};
}

test('fresh installs, legacy states and explicitly disabled hover stay hidden at the top edge', t => {
  for (const state of [null, snapshot(), snapshot({revealOnHover: false}), snapshot({revealOnHover: 'true'})]) {
    const h = harness(t, state);
    h.poll(); h.poll();
    assert.equal(h.win.shown, false);
    assert.equal(h.win.messages.some(([name]) => name === 'reveal'), false);
  }
});

test('settings apply immediately, persist across restart, and hover requires re-entry after hiding', t => {
  const h = harness(t, snapshot());
  h.ipc('sync-state', {...snapshot({revealOnHover: true}), revision: 2});
  h.poll(); assert.equal(h.win.shown, true);
  h.hide(); h.poll(); assert.equal(h.win.shown, false);
  h.move({x: 20, y: 200}); h.poll();
  h.move({x: 960, y: 0}); h.poll(); assert.equal(h.win.shown, true);
  h.ipc('sync-state', {...snapshot({revealOnHover: false}), revision: 3});
  h.hide(); h.poll(); assert.equal(h.win.shown, false);
  assert.equal(h.run('flushMemory()'), true);
  const reopened = harness(t, null, h.data);
  reopened.poll(); assert.equal(reopened.win.shown, false);
  assert.equal(reopened.run('latestState.settings.revealOnHover'), false);
});

test('tray, shortcut, taskbar/desktop re-launch and Windows Start still open with hover disabled', t => {
  const h = harness(t, snapshot({revealOnHover: false}));
  for (const open of [() => h.tray.emit('click'), h.shortcut, () => h.app.emit('second-instance', {}, []), () => h.watcher.stdout.emit('data', 'SHOW\n'), () => h.tray.menu[0].click()]) {
    open(); assert.equal(h.win.shown, true);
    h.hide(); h.poll(); assert.equal(h.win.shown, false);
  }
});

test('an old hide acknowledgement cannot close a panel reopened manually', t => {
  const h = harness(t);
  h.tray.emit('click'); h.ipc('hide-window');
  const generation = h.win.messages.findLast(([name]) => name === 'conceal')[1];
  h.tray.emit('click'); h.ipc('conceal-done', generation);
  assert.equal(h.win.shown, true);
});

test('horizontal dragging clamps both edges, preserves Y, and restores the selected position', t => {
  const h = harness(t);
  h.tray.emit('click'); h.ipc('horizontal-drag-start');
  h.move({x: 9999, y: 500}); h.ipc('horizontal-drag-update');
  assert.equal(h.win.bounds.x, 860); assert.equal(h.win.bounds.y, 0);
  h.move({x: -9999, y: -500}); h.ipc('horizontal-drag-update');
  assert.equal(h.win.bounds.x, 0); assert.equal(h.win.bounds.y, 0);
  h.move({x: 800, y: 200}); h.ipc('horizontal-drag-update'); h.ipc('horizontal-drag-end');
  assert.equal(h.win.bounds.x, 270);
  const reopened = harness(t, null, h.data);
  reopened.tray.emit('click'); assert.equal(reopened.win.bounds.x, 270);
});

test('all note tabs and legacy notes are backed up, with safe names and no unrelated file overwrite', t => {
  const state = snapshot({language: 'en'});
  state.notes = {tabs: [{name: 'Personal'}, {name: '../CON'}, {name: 'notes'}], today: {date: '2026-09-28', texts: ['one', 'two', 'three']}, archive: [{date: '2026-09-27', text: 'legacy note'}]};
  const h = harness(t, state);
  fs.writeFileSync(path.join(h.dataDir, 'Personal.txt'), 'unrelated user document');
  assert.equal(h.run('flushMemory()'), true);
  assert.equal(fs.readFileSync(path.join(h.dataDir, 'Personal.txt'), 'utf8'), 'unrelated user document');
  assert.match(fs.readFileSync(path.join(h.dataDir, 'Personal (2).txt'), 'utf8'), /one[\s\S]*legacy note/);
  assert.match(fs.readFileSync(path.join(h.dataDir, '..-CON.txt'), 'utf8'), /two/);
  assert.match(fs.readFileSync(path.join(h.dataDir, 'notes (2).txt'), 'utf8'), /three/);
  const updated = structuredClone(state); updated.revision = 2; updated.notes.tabs[0].name = 'Renamed';
  h.ipc('sync-state', updated); h.run('flushMemory()');
  assert.match(fs.readFileSync(path.join(h.dataDir, 'Renamed.txt'), 'utf8'), /one/);
  assert.equal(fs.existsSync(path.join(h.dataDir, 'Personal (2).txt')), false);
  assert.equal(fs.readFileSync(path.join(h.dataDir, 'Personal.txt'), 'utf8'), 'unrelated user document');
});
