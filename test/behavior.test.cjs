const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const core = require('../renderer/core');
const {createStateStore} = require('../lib/state-store');
const {panelBounds, inHoverZone} = require('../lib/window-layout');
const {trustedSender, validPayload} = require('../lib/ipc-policy');
const snapshot = (revision, title = 'Task') => ({revision, updatedAt: revision, timers: [{id: 1, title}], settings: {}, history: []});
function temporary(t) {
  const base = path.join(__dirname, '..', '.test-tmp');
  fs.mkdirSync(base, {recursive: true});
  const dir = fs.mkdtempSync(path.join(base, 'store-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'pomodoro-data.json');
}
test('newer local changes survive restart even when disk contains an older snapshot', () => {
  assert.equal(core.chooseState(snapshot(8, 'new'), snapshot(7, 'old')).timers[0].title, 'new');
  assert.equal(core.chooseState(snapshot(6), snapshot(7, 'disk')).timers[0].title, 'disk');
  assert.equal(core.chooseState(snapshot(8), {timers: [null]}).revision, 8);
});
test('legacy state migrates without a timestamp and revision ordering tolerates clock changes', () => {
  const legacy = {timers: [{id: 1, title: 'legacy'}]};
  assert.equal(core.chooseState(null, legacy), legacy);
  core.markUpdated(legacy, 1000); core.markUpdated(legacy, 500);
  assert.equal(legacy.revision, 2);
  assert.equal(core.chooseState(legacy, snapshot(1)), legacy);
});
test('atomic store recovers a corrupt primary from the last valid backup', t => {
  const file = temporary(t), store = createStateStore(file);
  store.save(snapshot(1)); store.save(snapshot(2));
  fs.writeFileSync(file, '{truncated');
  assert.equal(store.load().revision, 1);
  store.save(snapshot(3));
  assert.equal(JSON.parse(fs.readFileSync(file + '.bak')).revision, 1);
  assert.equal(store.load().revision, 3);
});
test('a failed replacement leaves the existing primary intact and reports the failure', t => {
  const file = temporary(t), store = createStateStore(file);
  store.save(snapshot(1));
  const io = Object.create(fs);
  io.renameSync = (from, to) => { if (to === file) throw new Error('simulated disk failure'); fs.renameSync(from, to); };
  assert.throws(() => createStateStore(file, io).save(snapshot(2)), /simulated disk failure/);
  assert.equal(store.load().revision, 1);
  assert.equal(fs.existsSync(file + '.tmp'), false);
});
test('delayed callbacks and sleep count the full elapsed interval', () => {
  const timer = {remainingSec: 120, durationSec: 120};
  core.startTimer(timer, 1000);
  assert.equal(core.advanceTimer(timer, 61000), false);
  assert.equal(timer.remainingSec, 60);
  assert.equal(core.advanceTimer(timer, 121000), true);
  assert.equal(timer.completedAt, 121000);
  assert.equal(core.advanceTimer(timer, 181000), false);
  assert.equal(timer.running, false);
});
test('pause excludes paused time and a persisted deadline survives reopening', () => {
  const timer = {remainingSec: 120, durationSec: 120};
  core.startTimer(timer, 0); core.pauseTimer(timer, 10000);
  core.advanceTimer(timer, 90000);
  assert.equal(timer.remainingSec, 110);
  core.startTimer(timer, 100000);
  const restored = JSON.parse(JSON.stringify(timer));
  core.advanceTimer(restored, 130000);
  assert.equal(restored.remainingSec, 80);
});
test('legacy running timers gain a deadline; a backward clock never increases remaining seconds', () => {
  const timer = {running: true, remainingSec: 90, durationSec: 120};
  core.advanceTimer(timer, 100000);
  assert.equal(timer.deadlineAt, 190000);
  core.advanceTimer(timer, 120000);
  core.advanceTimer(timer, 110000);
  assert.equal(timer.remainingSec, 70);
});
test('small, negative-coordinate and tall-work-area displays contain the entire panel', () => {
  for (const wa of [{x: 0, y: 0, width: 800, height: 600}, {x: -1024, y: -300, width: 1024, height: 280}, {x: 1920, y: 40, width: 1920, height: 1000}]) {
    const b = panelBounds(wa, 700);
    assert(b.x >= wa.x && b.y >= wa.y);
    assert(b.x + b.width <= wa.x + wa.width && b.y + b.height <= wa.y + wa.height);
  }
});
test('hover zones follow each monitor physical top edge and ignore neighboring points', () => {
  const d = {bounds: {x: -1280, y: -100, width: 1280, height: 720}};
  assert(inHoverZone({x: -640, y: -100}, d));
  assert(!inHoverZone({x: -640, y: -95}, d));
  assert(!inHoverZone({x: -1000, y: -100}, d));
  assert(!inHoverZone({x: -640, y: -101}, d));
});
test('IPC rejects subframes, other windows, malformed state and excessive payloads', () => {
  const url = 'file:///app/renderer/index.html', frame = {url};
  const w = {isDestroyed: () => false, webContents: {mainFrame: frame}};
  assert(trustedSender({sender: w.webContents, senderFrame: frame}, w, url));
  assert(!trustedSender({sender: w.webContents, senderFrame: {url}}, w, url));
  assert(!trustedSender({sender: {}, senderFrame: frame}, w, url));
  assert(!trustedSender({sender: w.webContents, senderFrame: frame}, w, url + '.evil'));
  assert(validPayload(snapshot(1)));
  assert(!validPayload({timers: [null]}));
  assert(!validPayload({...snapshot(1), note: 'x'.repeat(17 * 1024 * 1024)}));
});
test('preload subscriptions hide IPC events and support removal', () => {
  const ipc = new EventEmitter(); let api;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return {ipcRenderer: ipc, contextBridge: {exposeInMainWorld: (_name, exposed) => { api = exposed; }}}; },
  });
  let received;
  const stop = api.onConceal(value => {received = value;});
  ipc.emit('conceal', {sender: 'privileged'}, 7);
  assert.equal(received, 7);
  stop(); ipc.emit('conceal', {}, 9);
  assert.equal(received, 7);
  assert.equal(api.saveData, undefined);
});
test('Jalali conversion and reverse conversion agree with Intl around month/year boundaries', () => {
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/jalali.js'), 'utf8'), context);
  const J = context.window.J;
  for (const year of [2023, 2024, 2025, 2026]) {
    for (const month of [2, 3, 9, 12]) {
      const date = new Date(year, month - 1, 20, 12);
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US-u-ca-persian', {year: 'numeric', month: 'numeric', day: 'numeric'}).formatToParts(date).map(p => [p.type, p.value]));
      const j = J.toJalali(year, month, 20);
      assert.deepEqual(JSON.parse(JSON.stringify(j)), {jy: Number(parts.year), jm: Number(parts.month), jd: Number(parts.day)});
      const back = J.dateOfJalali(j.jy, j.jm, j.jd);
      assert.equal(back.getFullYear(), year); assert.equal(back.getMonth() + 1, month); assert.equal(back.getDate(), 20);
    }
  }
});
