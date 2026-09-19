// main.js — Electron main process
// A small frameless, transparent, always-on-top panel at the top-center of the
// desktop. Hidden by default. Reveals when:
//   1) the mouse touches the top-center edge of the screen,
//   2) the Windows Start menu / Search opens (mouse click on Start OR the
//      keyboard Windows key — detected by the offline PowerShell watcher), or
//   3) the Ctrl+Alt+P global shortcut is pressed.
// Hides again when the mouse leaves, unless pinned or "held" open (e.g. a timer
// just finished and is waiting for the user to acknowledge it).

const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('node:url');
const { createStateStore, atomicWrite } = require('./lib/state-store');
const { panelBounds, inHoverZone } = require('./lib/window-layout');
const { trustedSender, validPayload } = require('./lib/ipc-policy');
const { chooseState } = require('./renderer/core');
const PANEL_URL = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
const STATS_URL = pathToFileURL(path.join(__dirname, 'renderer', 'stats.html')).href;
// Only the main panel gets privileged IPC. The statistics iframe uses postMessage.
function onPanel(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (trustedSender(event, win, PANEL_URL)) listener(event, ...args);
  });
}
function handlePanel(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedSender(event, win, PANEL_URL)) throw new Error('Untrusted IPC sender');
    return listener(event, ...args);
  });
}

// --- crash / error logging (writes error.log next to the app) ------------
const LOG_FILE = path.join(__dirname, 'error.log');
function logError(tag, e) {
  const msg = `[${new Date().toISOString()}] ${tag}: ${(e && e.stack) || e}\n`;
  try { fs.appendFileSync(LOG_FILE, msg); } catch (_) {}
}
process.on('uncaughtException', (e) => {
  logError('uncaughtException', e);
  try { dialog.showErrorBox('Pomodoro Timing - error', String((e && e.stack) || e)); } catch (_) {}
});
process.on('unhandledRejection', (e) => logError('unhandledRejection', e));

let win = null;
let tray = null;
let watchProc = null;
let latestState = null;
let stateStore = null;

// --- file-based memory (Documents\Pomodoro Timing) -----------------------
// The app's data is saved to disk so it survives restarts and is accessible to
// the user: a machine-readable JSON the app reads back, and a human-readable log.
let DATA_DIR = null, MEM_JSON = null, MEM_LOG = null, MEM_NOTES = null, MEM_WORKS = null, MEM_HABIT = null;
function initDataPaths() {
  try { DATA_DIR = path.join(app.getPath('documents'), 'Pomodoro Timing'); }
  catch (_) { DATA_DIR = path.join(__dirname, 'data'); }
  MEM_JSON = path.join(DATA_DIR, 'pomodoro-data.json');
  MEM_LOG = path.join(DATA_DIR, 'pomodoro-log.txt');
  MEM_NOTES = path.join(DATA_DIR, 'notes.txt');
  MEM_WORKS = path.join(DATA_DIR, 'works.txt');
  MEM_HABIT = path.join(DATA_DIR, 'habit.txt');
  stateStore = createStateStore(MEM_JSON);
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { logError('mkdir-data', e); }
}
function readMemory() {
  return stateStore ? stateStore.load() : null;
}
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function buildLog(s) {
  const L = [];
  L.push('Pomodoro Timing — memory / log');
  L.push('Last saved: ' + new Date().toLocaleString());
  L.push('');
  L.push('== Current tasks ==');
  (s.timers || []).forEach(t => {
    const durationMin = Math.max(5, Math.min(60, Math.round((Number(t.durationSec) || 1500) / 60)));
    L.push(`- ${t.title}: ${Math.round(t.progress || 0)}%  (goal ${t.goal} pomodoros)  duration ${durationMin} min  timer ${fmtClock(t.remainingSec)}${t.running ? '  [running]' : ''}`);
  });
  L.push('');
  const hist = Array.isArray(s.history) ? s.history : [];
  L.push(`== Completed pomodoros (total ${hist.length}) ==`);
  const byDate = {};
  hist.forEach(h => { (byDate[h.date] = byDate[h.date] || []).push(h); });
  Object.keys(byDate).sort().forEach(date => {
    const focusMin = byDate[date].reduce((sum, h) => sum + Math.max(1, Math.round(Number(h && h.durationMin) || 25)), 0);
    L.push(`# ${date}  —  ${byDate[date].length} pomodoros  (${focusMin} min)`);
    byDate[date].slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach(h => {
      const d = new Date(h.ts || 0);
      const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
      L.push(`    ${hh}:${mm}   ${h.title}`);
    });
  });
  const notes = s.notes || {};
  L.push('');
  L.push('== Notes ==');
  if (notes.today && (notes.today.text || '').trim()) { L.push(`# ${notes.today.date} (today)`); L.push(notes.today.text); L.push(''); }
  (notes.archive || []).forEach(a => { if ((a.text || '').trim()) { L.push(`# ${a.date}`); L.push(a.text); L.push(''); } });

  const habits = s.habits && typeof s.habits === 'object' ? s.habits : { items: [], records: {} };
  const habitTitles = new Map((Array.isArray(habits.items) ? habits.items : []).map(h => [String(h.id), h.title || String(h.id)]));
  L.push('');
  L.push('== Habit Tracker ==');
  const habitDates = Object.keys(habits.records || {}).sort();
  if (!habitDates.length) L.push('(no habit records yet)');
  habitDates.forEach(date => {
    const recs = habits.records[date] || {};
    L.push(`# ${date}`);
    Object.entries(recs).forEach(([id, status]) => {
      const mark = status === 'done' ? '[DONE]' : status === 'missed' ? '[MISSED]' : '[ ]';
      L.push(`    ${mark} ${habitTitles.get(String(id)) || id}`);
    });
  });

  const todos = s.todos && s.todos.byDate && typeof s.todos.byDate === 'object' ? s.todos.byDate : {};
  L.push('');
  L.push('== Daily To Do Lists ==');
  const todoDates = Object.keys(todos).sort();
  if (!todoDates.length) L.push('(no to-do items yet)');
  todoDates.forEach(date => {
    L.push(`# ${date}`);
    (Array.isArray(todos[date]) ? todos[date] : []).forEach(item => {
      const mark = item.status === 'done' ? '[DONE]' : item.status === 'missed' ? '[NOT DONE]' : '[PENDING]';
      L.push(`    ${mark} ${item.title || ''}`);
    });
  });
  return L.join('\r\n');
}
function buildWorks(s) {
  const todos = s && s.todos && s.todos.byDate && typeof s.todos.byDate === 'object' ? s.todos.byDate : {};
  const L = ['Pomodoro Timing — Works', 'Updated: ' + new Date().toLocaleString(), ''];
  const dates = Object.keys(todos).sort();
  if (!dates.length) L.push('(no works yet)');
  dates.forEach((date) => {
    L.push('# ' + date);
    (Array.isArray(todos[date]) ? todos[date] : []).forEach((item) => {
      const mark = item && item.status === 'done' ? '[DONE]' : item && item.status === 'missed' ? '[MISSED]' : '[PENDING]';
      L.push(`    ${mark} ${(item && item.title) || ''}`);
    });
    L.push('');
  });
  return L.join('\r\n');
}
function buildHabit(s) {
  const habits = s && s.habits && typeof s.habits === 'object' ? s.habits : { items: [], records: {} };
  const items = Array.isArray(habits.items) ? habits.items : [];
  const titles = new Map(items.filter(Boolean).map((h) => [String(h.id), h.title || String(h.id)]));
  const L = ['Pomodoro Timing — Habit Tracker', 'Updated: ' + new Date().toLocaleString(), '', '== Habits =='];
  if (!items.length) L.push('(no habits yet)');
  items.forEach((h) => {
    if (!h) return;
    const duration = h.duration || 'year';
    L.push(`- ${h.title || h.id} | ${h.createdDate || ''} -> ${h.endDate || ''} | duration=${duration}${h.archived ? ' | archived' : ''}`);
  });
  L.push('', '== Daily records ==');
  const dates = Object.keys(habits.records || {}).sort();
  if (!dates.length) L.push('(no habit records yet)');
  dates.forEach((date) => {
    L.push('# ' + date);
    const recs = habits.records[date] || {};
    Object.entries(recs).forEach(([id, status]) => {
      const mark = status === 'done' ? '[DONE]' : status === 'missed' ? '[MISSED]' : '[ ]';
      L.push(`    ${mark} ${titles.get(String(id)) || id}`);
    });
    L.push('');
  });
  return L.join('\r\n');
}
function buildNotes(s) {
  const n = (s && s.notes) || {};
  const habits = s && s.habits && typeof s.habits === 'object' ? s.habits : { items: [], records: {} };
  const todos = s && s.todos && s.todos.byDate && typeof s.todos.byDate === 'object' ? s.todos.byDate : {};
  const titles = new Map((Array.isArray(habits.items) ? habits.items : []).filter(Boolean).map((h) => [String(h.id), h.title || String(h.id)]));
  const noteMap = new Map();
  if (n.today && n.today.date) noteMap.set(n.today.date, n.today.text || '');
  (n.archive || []).forEach((a) => { if (a && a.date) noteMap.set(a.date, a.text || ''); });
  const dates = new Set([...noteMap.keys(), ...Object.keys(habits.records || {}), ...Object.keys(todos)]);
  const L = ['Pomodoro Timing — Notes + Daily Activity', 'Updated: ' + new Date().toLocaleString(), ''];
  [...dates].sort().reverse().forEach((date) => {
    const note = String(noteMap.get(date) || '').trim();
    const hrec = habits.records && habits.records[date] && typeof habits.records[date] === 'object' ? habits.records[date] : {};
    const works = Array.isArray(todos[date]) ? todos[date] : [];
    const hasActivity = Object.keys(hrec).length || works.length;
    if (!note && !hasActivity) return;
    L.push('# ' + date + (n.today && n.today.date === date ? ' (today)' : ''));
    if (note) { L.push(note); L.push(''); }
    if (Object.keys(hrec).length) {
      L.push('Habits:');
      Object.entries(hrec).forEach(([id, status]) => {
        const mark = status === 'done' ? '[DONE]' : status === 'missed' ? '[MISSED]' : '[ ]';
        const h = (Array.isArray(habits.items) ? habits.items : []).find((x) => x && String(x.id) === String(id));
        const meta = h ? ` [duration=${h.duration || 'year'}${h.endDate ? `, until=${h.endDate}` : ''}]` : '';
        L.push(`    ${mark} ${titles.get(String(id)) || id}${meta}`);
      });
    }
    if (works.length) {
      L.push('Works:');
      works.forEach((item) => {
        const mark = item && item.status === 'done' ? '[DONE]' : item && item.status === 'missed' ? '[MISSED]' : '[PENDING]';
        L.push(`    ${mark} ${(item && item.title) || ''}`);
      });
    }
    L.push('');
  });
  if (L.length <= 3) L.push('(no notes or daily activity yet)');
  return L.join('\r\n');
}
let writeTimer = null;
let storageFailed = false;
function storageStatus(ok) {
  storageFailed = !ok;
  if (win && !win.isDestroyed()) win.webContents.send('storage-status', ok);
}
function flushMemory() {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  if (!latestState || !stateStore) return true;
  try {
    stateStore.save(latestState);
    storageStatus(true);
  } catch (e) {
    logError('writeMemory', e);
    storageStatus(false);
    return false;
  }
  // JSON is authoritative; readable exports can be regenerated from it.
  for (const [file, build] of [[MEM_LOG, buildLog], [MEM_NOTES, buildNotes], [MEM_WORKS, buildWorks], [MEM_HABIT, buildHabit]]) {
    try { atomicWrite(file, build(latestState)); } catch (e) { logError('writeExport', e); }
  }
  return true;
}
function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(flushMemory, 700);
}

// --- runtime state -------------------------------------------------------
let pointerInside = false;
let editing = false;
let pinned = false;
let holdOpen = false;          // keep open until the user acknowledges (timer done)
let visible = false;
let hideTimer = null;
let forceVisibleUntil = 0;
let quitting = false;

// --- layout --------------------------------------------------------------
const WIN_W = 1060;             // wide enough for notes + timers + weekly columns
let curH = 430;                // starting height; the renderer resizes to fit
const HIDE_DELAY = 650;
const GRACE = 3200;

let activeDisplayId = null;
let hoverLatched = false;
let concealGeneration = 0;
function activeDisplay() {
  return screen.getAllDisplays().find(d => d.id === activeDisplayId) || screen.getPrimaryDisplay();
}
function workArea() { return activeDisplay().workArea; }

function targetBounds() {
  return panelBounds(workArea(), curH, WIN_W);
}

function createWindow() {
  const b = targetBounds();
  win = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,   // keep timers ticking while hidden
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('will-frame-navigate', event => {
    const url = event.url;
    if (url !== PANEL_URL && url !== STATS_URL + '?embedded=1') event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('query-session-end', () => flushMemory());
  win.on('session-end', () => flushMemory());
  win.on('closed', () => { win = null; });
}

// --- show / hide ---------------------------------------------------------
function reveal(fromTrigger = false, focus = false, display = null) {
  if (!win) return;
  if (!visible) activeDisplayId = (display || screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).id;
  concealGeneration++;
  win.setBounds(targetBounds());
  if (!visible) {
    visible = true;
    if (focus) { win.show(); win.focus(); } else { win.showInactive(); }
    win.setAlwaysOnTop(true, 'screen-saver');
  } else if (focus) {
    win.show(); win.focus();
  }
  win.webContents.send('reveal');
  if (fromTrigger) forceVisibleUntil = Date.now() + GRACE;
  cancelHide();
}

function conceal() {
  if (!win || !visible || holdOpen) return;
  win.webContents.send('conceal', ++concealGeneration);
}

onPanel('conceal-done', (_e, generation) => {
  if (generation !== concealGeneration) return;
  if (win) win.hide();
  visible = false;
  pointerInside = false;
});

function scheduleHide() {
  if (hideTimer) return;
  hideTimer = setTimeout(() => { hideTimer = null; conceal(); }, HIDE_DELAY);
}
function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }

function toggle() { if (visible) conceal(); else reveal(true); }

// Top-edge hover works on every monitor. Re-enter the zone to reveal again.
function startPolling() {
  setInterval(() => {
    if (!win || quitting) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const inZone = inHoverZone(point, display);
    if (!inZone) hoverLatched = false;
    if (!visible) {
      if (inZone && !hoverLatched) { hoverLatched = true; reveal(true, false, display); }
      return;
    }
    const forced = Date.now() < forceVisibleUntil;
    if (pinned || holdOpen || pointerInside || editing || forced) cancelHide();
    else scheduleHide();
  }, 110);
}

// Offline Start-menu detection, alongside hover/tray/shortcut access.
function setupStartWatch() {
  try {
    watchProc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', path.join(__dirname, '_startwatch.ps1')],
      { windowsHide: true }
    );
    watchProc.stdout.on('data', (data) => { if (String(data).includes('SHOW')) reveal(true); });
    watchProc.on('error', (e) => logError('startwatch-spawn', e));
    watchProc.on('close', () => { watchProc = null; if (!quitting) setTimeout(setupStartWatch, 1500); });
  } catch (e) { logError('startwatch', e); }
}

// --- language / tray -----------------------------------------------------
function currentLanguage() {
  return latestState && latestState.settings && latestState.settings.language === 'en' ? 'en' : 'fa';
}
function trayText() {
  return currentLanguage() === 'en'
    ? { show: 'Show panel', data: 'Open data folder', quit: 'Quit' }
    : { show: 'نمایش پنل', data: 'باز کردن پوشهٔ حافظه', quit: 'خروج' };
}
function updateTrayMenu() {
  if (!tray) return;
  const t = trayText();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.show, click: () => reveal(true) },
    { label: t.data, click: () => openDataDir() },
    { type: 'separator' },
    { label: t.quit, click: quitApp },
  ]));
  tray.setToolTip('Pomodoro Timing');
}

// --- tray ----------------------------------------------------------------
function createTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico'));
  if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
  if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  updateTrayMenu();
  tray.on('click', () => reveal(true));
}

// --- stats / analytics dock ----------------------------------------------
// v1.6.0 keeps Statistics & Calendar inside the main panel. The old IPC name
// is retained for compatibility, but it now toggles the attached dock instead
// of creating another BrowserWindow.
function openStatsWindow() {
  if (!win || win.isDestroyed()) return;
  reveal(true, true);
  win.webContents.send('toggle-stats-dock');
}
onPanel('open-stats', openStatsWindow);
onPanel('sync-state', (_e, s) => {
  if (!validPayload(s)) { storageStatus(false); return; }
  latestState = chooseState(s, latestState);
  scheduleWrite();
  updateTrayMenu();
});
handlePanel('get-state', () => latestState);

// file-based memory handlers (use the single DATA_DIR/MEM_JSON defined above)
handlePanel('load-data', () => readMemory());
handlePanel('storage-status', () => !storageFailed);
function openDataDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); shell.openPath(DATA_DIR); } catch (e) { logError('open-data', e); } }
onPanel('open-data-folder', () => openDataDir());

// --- IPC -----------------------------------------------------------------
onPanel('pointer-inside', (_e, v) => { if (typeof v !== 'boolean') return; pointerInside = v; if (pointerInside) cancelHide(); });
onPanel('editing', (_e, v) => { if (typeof v !== 'boolean') return; editing = v; if (editing) cancelHide(); });
onPanel('set-pinned', (_e, v) => { if (typeof v !== 'boolean') return; pinned = v; if (pinned) cancelHide(); });
onPanel('set-hold', (_e, v) => { if (typeof v !== 'boolean') return; holdOpen = v; if (holdOpen) { reveal(true, true); cancelHide(); } });
onPanel('hide-window', () => conceal());
onPanel('minimize-window', () => conceal());
onPanel('quit-app', () => quitApp());
onPanel('resize', (_e, h) => {
  if (!win || !Number.isFinite(h) || h <= 0) return;
  const wa = workArea();
  curH = Math.max(140, Math.min(Math.round(h), wa.height - 8));
  win.setBounds(targetBounds());
});
handlePanel('get-work-area', () => { const wa = workArea(); return { width: wa.width, height: wa.height }; });

let quitRequested = false;
let finalizingQuit = false;
let quitTimer = null;
let restartRequested = false;
function finishQuit() {
  if (quitTimer) { clearTimeout(quitTimer); quitTimer = null; }
  if (!flushMemory()) {
    quitRequested = false;
    restartRequested = false;
    reveal(true, true);
    dialog.showErrorBox('Pomodoro Timing', currentLanguage() === 'fa'
      ? 'ذخیرهٔ اطلاعات انجام نشد. برنامه باز می‌ماند؛ فضای دیسک و دسترسی پوشهٔ حافظه را بررسی کنید.'
      : 'Your changes could not be saved. The app will stay open. Check disk space and access to the data folder.');
    return;
  }
  finalizingQuit = true;
  quitting = true;
  if (restartRequested) app.relaunch();
  app.quit();
}
onPanel('quit-ready', (_e, state) => {
  if (!quitRequested || !validPayload(state)) return;
  latestState = chooseState(state, latestState);
  finishQuit();
});
function quitApp() {
  if (quitRequested || finalizingQuit) return;
  quitRequested = true;
  if (!win || win.isDestroyed() || win.webContents.isLoadingMainFrame()) { finishQuit(); return; }
  quitTimer = setTimeout(finishQuit, 1500);
  win.webContents.send('prepare-quit');
}

// --- lifecycle -----------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock || process.argv.includes('--quit')) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--restart') || argv.includes('--quit')) {
      restartRequested = argv.includes('--restart'); quitApp();
    } else reveal(true);
  });
  app.on('before-quit', event => {
    if (!finalizingQuit) { event.preventDefault(); quitApp(); }
    else flushMemory();
  });
  app.whenReady().then(() => {
    initDataPaths();
    latestState = readMemory();      // load saved memory so the panel can restore from it
    createWindow();
    createTray();
    startPolling();
    setupStartWatch();
    const fitDisplay = () => {
      if (win) { win.setBounds(targetBounds()); win.webContents.send('work-area-changed'); }
    };
    screen.on('display-metrics-changed', fitDisplay);
    screen.on('display-removed', fitDisplay);
    try { globalShortcut.register('Control+Alt+P', toggle); } catch (_) {}
  });
  app.on('will-quit', () => {
    quitting = true;
    try { globalShortcut.unregisterAll(); } catch (_) {}
    try { if (watchProc) { watchProc.kill(); watchProc = null; } } catch (_) {}
  });
  app.on('window-all-closed', () => {}); // stay in tray until explicit quit
}
