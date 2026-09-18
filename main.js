// main.js — Electron main process
// A small frameless, transparent, always-on-top panel at the top-center of the
// desktop. Hidden by default. Reveals when:
//   1) the mouse touches the top-center edge of the screen,
//   2) the Windows Start menu / Search opens (mouse click on Start OR the
//      keyboard Windows key — both are detected via active-win), or
//   3) the Ctrl+Alt+P global shortcut is pressed.
// Hides again when the mouse leaves, unless pinned or "held" open (e.g. a timer
// just finished and is waiting for the user to acknowledge it).

const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
let startWatcher = null;

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
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { logError('mkdir-data', e); }
}
function readMemory() {
  try { return JSON.parse(fs.readFileSync(MEM_JSON, 'utf8')); } catch (_) { return null; }
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
function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!latestState) return;
    try {
      fs.writeFileSync(MEM_JSON, JSON.stringify(latestState, null, 2), 'utf8');
      fs.writeFileSync(MEM_LOG, buildLog(latestState), 'utf8');
      fs.writeFileSync(MEM_NOTES, buildNotes(latestState), 'utf8');
      fs.writeFileSync(MEM_WORKS, buildWorks(latestState), 'utf8');
      fs.writeFileSync(MEM_HABIT, buildHabit(latestState), 'utf8');
    } catch (e) { logError('writeMemory', e); }
  }, 700);
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
const HOTZONE_HALF_W = 220;
const HOTZONE_Y = 4;
const HIDE_DELAY = 650;
const GRACE = 3200;

function workArea() { return screen.getPrimaryDisplay().workArea; }

function targetBounds() {
  const wa = workArea();
  const h = Math.min(curH, wa.height - 8);
  const x = Math.round(wa.x + (wa.width - WIN_W) / 2);
  const y = wa.y;
  return { x, y, width: WIN_W, height: h };
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
      backgroundThrottling: false,   // keep timers ticking while hidden
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// --- show / hide ---------------------------------------------------------
function reveal(fromTrigger = false, focus = false) {
  if (!win) return;
  win.setBounds(targetBounds());
  if (!visible) {
    visible = true;
    if (focus) { win.show(); win.focus(); } else { win.showInactive(); }
    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.send('reveal');
  } else if (focus) {
    win.show(); win.focus();
  }
  if (fromTrigger) forceVisibleUntil = Date.now() + GRACE;
  cancelHide();
}

function conceal() {
  if (!win || !visible || holdOpen) return;
  win.webContents.send('conceal');
}

ipcMain.on('conceal-done', () => { if (win) win.hide(); visible = false; });

function scheduleHide() {
  if (hideTimer) return;
  hideTimer = setTimeout(() => { hideTimer = null; conceal(); }, HIDE_DELAY);
}
function cancelHide() { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } }

function toggle() { if (visible) conceal(); else reveal(true); }

// --- cursor polling (top-center hot zone) --------------------------------
// --- keep-open / auto-hide loop (NO hover-reveal) ------------------------
// The panel is revealed only by: the Start menu opening, the tray icon,
// Ctrl+Alt+P, or the tray menu. This loop only decides when to hide it again.
function startPolling() {
  setInterval(() => {
    if (!win || !visible) return;
    const forced = Date.now() < forceVisibleUntil;
    if (pinned || holdOpen || pointerInside || editing || forced) cancelHide();
    else scheduleHide();
  }, 110);
}

// --- (Start-menu detection removed in the offline build) -----------------
// Use the top-center hover zone or the Ctrl+Alt+P shortcut to reveal the panel.
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
ipcMain.on('open-stats', openStatsWindow);
ipcMain.on('sync-state', (_e, s) => {
  latestState = s;
  scheduleWrite();
  updateTrayMenu();
});
ipcMain.handle('get-state', () => latestState);

// file-based memory handlers (use the single DATA_DIR/MEM_JSON defined above)
ipcMain.handle('load-data', () => readMemory());
function openDataDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); shell.openPath(DATA_DIR); } catch (e) { logError('open-data', e); } }
ipcMain.on('open-data-folder', () => openDataDir());

// --- IPC -----------------------------------------------------------------
ipcMain.on('pointer-inside', (_e, v) => { pointerInside = !!v; if (pointerInside) cancelHide(); });
ipcMain.on('editing', (_e, v) => { editing = !!v; if (editing) cancelHide(); });
ipcMain.on('set-pinned', (_e, v) => { pinned = !!v; if (pinned) cancelHide(); });
ipcMain.on('set-hold', (_e, v) => { holdOpen = !!v; if (holdOpen) { reveal(true, true); cancelHide(); } });
ipcMain.on('hide-window', () => conceal());
ipcMain.on('minimize-window', () => conceal());
ipcMain.on('quit-app', () => quitApp());
ipcMain.on('resize', (_e, h) => {
  if (!win || !h) return;
  const wa = workArea();
  curH = Math.max(140, Math.min(Math.round(h), wa.height - 8));
  win.setBounds(targetBounds());
});
ipcMain.handle('get-autostart', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('get-work-area', () => { const wa = workArea(); return { width: wa.width, height: wa.height }; });
ipcMain.on('set-autostart', (_e, v) => app.setLoginItemSettings({ openAtLogin: !!v, path: process.execPath }));

function quitApp() {
  quitting = true;
  app.isQuitting = true;
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { if (watchProc) { watchProc.kill(); watchProc = null; } } catch (_) {}
  try { if (tray) { tray.destroy(); tray = null; } } catch (_) {}
  try { if (win) { win.destroy(); win = null; } } catch (_) {}
  app.quit();
  setTimeout(() => app.exit(0), 300); // ensure the process (and its file locks) fully exits
}

// --- lifecycle -----------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => reveal(true));
  app.on('before-quit', () => { quitting = true; });
  app.whenReady().then(() => {
    initDataPaths();
    latestState = readMemory();      // load saved memory so the panel can restore from it
    createWindow();
    createTray();
    startPolling();
    setupStartWatch();
    try { globalShortcut.register('Control+Alt+P', toggle); } catch (_) {}
  });
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (_) {} });
  app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); }); // stay in tray
}
