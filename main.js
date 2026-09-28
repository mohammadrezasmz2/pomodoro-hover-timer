// main.js — Electron main process
// A small frameless, transparent, always-on-top panel at the top-center of the
// desktop. Hidden by default. Reveals when:
//   1) the tray icon, app shortcut or Ctrl+Alt+P is used,
//   2) the Windows Start menu / Search opens (mouse click on Start OR the
//      keyboard Windows key — detected by the offline PowerShell watcher), or
//   3) top-center hover is explicitly enabled in Settings (off by default).
// Hides again when the mouse leaves, unless pinned or "held" open (e.g. a timer
// just finished and is waiting for the user to acknowledge it).

const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, globalShortcut, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('node:url');
const { createStateStore, atomicWrite } = require('./lib/state-store');
const { panelBounds, inHoverZone, hoverRevealEnabled, clampWindowX } = require('./lib/window-layout');
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
let DATA_DIR = null, MEM_JSON = null, MEM_LOG = null, MEM_NOTES = null, MEM_WORKS = null, MEM_HABIT = null, MEM_POS = null;
function initDataPaths() {
  try { DATA_DIR = path.join(app.getPath('documents'), 'Pomodoro Timing'); }
  catch (_) { DATA_DIR = path.join(__dirname, 'data'); }
  MEM_JSON = path.join(DATA_DIR, 'pomodoro-data.json');
  MEM_LOG = path.join(DATA_DIR, 'pomodoro-log.txt');
  MEM_NOTES = path.join(DATA_DIR, 'notes.txt');
  MEM_WORKS = path.join(DATA_DIR, 'works.txt');
  MEM_HABIT = path.join(DATA_DIR, 'habit.txt');
  MEM_POS = path.join(DATA_DIR, 'window-position.json');
  stateStore = createStateStore(MEM_JSON);
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { logError('mkdir-data', e); }
}
function readMemory() {
  return stateStore ? stateStore.load() : null;
}
function readWindowPosition() {
  try {
    const saved = JSON.parse(fs.readFileSync(MEM_POS, 'utf8'));
    if (saved && Number.isFinite(saved.x)) return saved;
  } catch (_) {}
  return null;
}
function writeWindowPosition() {
  if (!MEM_POS || !Number.isFinite(userX)) return;
  try { atomicWrite(MEM_POS, JSON.stringify({ x: userX, displayId: activeDisplayId, set: true }, null, 2)); }
  catch (e) { logError('write-window-position', e); }
}
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function noteColumnLabels(notes, language = 'en') {
  const defaults = language === 'fa'
    ? ['یادداشت امروز', 'یادداشت ۲', 'یادداشت ۳']
    : ["Today's note", 'Note 2', 'Note 3'];
  const tabs = notes && Array.isArray(notes.tabs) ? notes.tabs : [];
  return defaults.map((fallback, i) => {
    const custom = tabs[i] && typeof tabs[i].name === 'string' ? tabs[i].name.trim() : '';
    return custom || fallback;
  });
}

// Each note tab also has its own human-readable backup file in
// Documents\Pomodoro Timing. The file name follows the visible tab title, so
// renaming a tab immediately renames/replaces its backup file as well.
function safeBackupBaseName(value, fallback) {
  let name = String(value == null ? '' : value).normalize('NFKC');
  // Windows file-name rules: replace reserved/control characters, trim trailing
  // dots/spaces, and avoid reserved DOS device names.
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim();
  name = name.replace(/[. ]+$/g, '').trim();
  if (!name) name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  if (name.length > 96) name = name.slice(0, 96).replace(/[. ]+$/g, '').trim();
  return name || fallback;
}
function isNoteBackup(file) {
  try { return /^Pomodoro Timing — [^\r\n]*\r?\nNote tab: [123]\r?\nUpdated: /.test(fs.readFileSync(file, 'utf8')); }
  catch (_) { return false; }
}
function noteBackupFileNames(s) {
  const notes = s && s.notes && typeof s.notes === 'object' ? s.notes : {};
  const language = s && s.settings && s.settings.language === 'fa' ? 'fa' : 'en';
  const labels = noteColumnLabels(notes, language);
  // Never collide with the app's existing shared data/log files even if the
  // user deliberately names a tab "notes", "works", etc.
  const used = new Set([
    'notes.txt', 'works.txt', 'habit.txt', 'pomodoro-log.txt',
    'pomodoro-data.json', 'window-position.json', 'error.log'
  ]);
  return labels.map((label, i) => {
    const base = safeBackupBaseName(label, `Note ${i + 1}`);
    let candidate = `${base}.txt`;
    let n = 2;
    while (used.has(candidate.toLocaleLowerCase()) || (DATA_DIR && fs.existsSync(path.join(DATA_DIR, candidate)) && !isNoteBackup(path.join(DATA_DIR, candidate)))) candidate = `${base} (${n++}).txt`;
    used.add(candidate.toLocaleLowerCase());
    return candidate;
  });
}
function buildNoteTabBackup(s, tabIndex) {
  const notes = s && s.notes && typeof s.notes === 'object' ? s.notes : {};
  const language = s && s.settings && s.settings.language === 'fa' ? 'fa' : 'en';
  const labels = noteColumnLabels(notes, language);
  const label = labels[tabIndex] || `Note ${tabIndex + 1}`;
  const byDate = new Map();
  (Array.isArray(notes.archive) ? notes.archive : []).forEach((entry) => {
    if (!entry || !entry.date) return;
    byDate.set(entry.date, noteColumnTexts(entry)[tabIndex] || '');
  });
  if (notes.today && notes.today.date) byDate.set(notes.today.date, noteColumnTexts(notes.today)[tabIndex] || '');

  const L = [
    `Pomodoro Timing — ${label}`,
    `Note tab: ${tabIndex + 1}`,
    'Updated: ' + new Date().toLocaleString(),
    ''
  ];
  let count = 0;
  [...byDate.keys()].sort().reverse().forEach((date) => {
    const text = String(byDate.get(date) || '').trim();
    if (!text) return;
    count += 1;
    const today = notes.today && notes.today.date === date ? ' (today)' : '';
    L.push(`# ${date}${today}`);
    L.push(text);
    L.push('');
  });
  if (!count) L.push('(no notes yet)');
  return L.join('\r\n');
}
function syncNoteBackupFiles(s, previousState = null) {
  if (!DATA_DIR || !s) return;
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { logError('mkdir-note-backups', e); return; }
  const nextNames = noteBackupFileNames(s);
  const oldNames = previousState ? noteBackupFileNames(previousState) : [];

  // Write new/current files first so a rename never risks losing the backup.
  let allSaved = true;
  nextNames.forEach((fileName, i) => {
    try { atomicWrite(path.join(DATA_DIR, fileName), buildNoteTabBackup(s, i)); }
    catch (e) { allSaved = false; logError(`write-note-backup-${i + 1}`, e); }
  });

  // Remove the stale file name after a header rename (unless that name is now
  // used by another tab). This makes the rename visible in Explorer at once.
  if (!allSaved) return;
  const keep = new Set(nextNames.map((x) => x.toLocaleLowerCase()));
  oldNames.forEach((fileName) => {
    if (keep.has(fileName.toLocaleLowerCase())) return;
    try {
      const oldPath = path.join(DATA_DIR, fileName);
      if (fs.existsSync(oldPath) && isNoteBackup(oldPath)) fs.unlinkSync(oldPath);
    } catch (e) { logError('remove-old-note-backup', e); }
  });
}
function noteColumnTexts(entry) {
  if (!entry || typeof entry !== 'object') return ['', '', ''];
  const texts = Array.isArray(entry.texts) ? entry.texts.slice(0, 3) : [];
  while (texts.length < 3) texts.push('');
  if (!String(texts[0] || '').trim() && typeof entry.text === 'string') texts[0] = entry.text;
  return texts.map((x) => String(x == null ? '' : x));
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
  const noteLabels = noteColumnLabels(notes, s && s.settings && s.settings.language === 'fa' ? 'fa' : 'en');
  L.push('');
  L.push('== Notes ==');
  const appendNoteEntry = (entry, suffix) => {
    if (!entry || !entry.date) return;
    const texts = noteColumnTexts(entry);
    if (!texts.some((x) => x.trim())) return;
    L.push(`# ${entry.date}${suffix || ''}`);
    texts.forEach((text, i) => {
      if (!text.trim()) return;
      L.push(`[${noteLabels[i]}]`);
      L.push(text);
    });
    L.push('');
  };
  appendNoteEntry(notes.today, ' (today)');
  (notes.archive || []).forEach((a) => appendNoteEntry(a, ''));

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
  const labels = noteColumnLabels(n, s && s.settings && s.settings.language === 'fa' ? 'fa' : 'en');
  const habits = s && s.habits && typeof s.habits === 'object' ? s.habits : { items: [], records: {} };
  const todos = s && s.todos && s.todos.byDate && typeof s.todos.byDate === 'object' ? s.todos.byDate : {};
  const titles = new Map((Array.isArray(habits.items) ? habits.items : []).filter(Boolean).map((h) => [String(h.id), h.title || String(h.id)]));
  const noteMap = new Map();
  if (n.today && n.today.date) noteMap.set(n.today.date, noteColumnTexts(n.today));
  (n.archive || []).forEach((a) => { if (a && a.date) noteMap.set(a.date, noteColumnTexts(a)); });
  const dates = new Set([...noteMap.keys(), ...Object.keys(habits.records || {}), ...Object.keys(todos)]);
  const L = ['Pomodoro Timing — Notes + Daily Activity', 'Updated: ' + new Date().toLocaleString(), ''];
  [...dates].sort().reverse().forEach((date) => {
    const notesForDay = noteMap.get(date) || ['', '', ''];
    const hasNote = notesForDay.some((x) => String(x || '').trim());
    const hrec = habits.records && habits.records[date] && typeof habits.records[date] === 'object' ? habits.records[date] : {};
    const works = Array.isArray(todos[date]) ? todos[date] : [];
    const hasActivity = Object.keys(hrec).length || works.length;
    if (!hasNote && !hasActivity) return;
    L.push('# ' + date + (n.today && n.today.date === date ? ' (today)' : ''));
    notesForDay.forEach((text, i) => {
      const clean = String(text || '').trim();
      if (!clean) return;
      L.push(`[${labels[i]}]`);
      L.push(clean);
      L.push('');
    });
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
let exportedState = null;
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
  syncNoteBackupFiles(latestState, exportedState);
  exportedState = latestState;
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
let movingWindow = false;
let dragStartCursorX = 0;
let dragStartWindowX = 0;
let userX = null;

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
  return panelBounds(workArea(), curH, WIN_W, userX);
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
  if (!visible) {
    const nextDisplay = display || (activeDisplayId != null && screen.getAllDisplays().find(d => d.id === activeDisplayId)) || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (activeDisplayId !== nextDisplay.id) userX = null;
    activeDisplayId = nextDisplay.id;
  }
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

// Hover is opt-in; legacy settings and first runs default to manual opening.
// When enabled it works on every monitor; re-enter the zone to reveal again.
function startPolling() {
  setInterval(() => {
    if (!win || quitting) return;
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const inZone = hoverRevealEnabled(latestState) && inHoverZone(point, display);
    if (!inZone) hoverLatched = false;
    if (!visible) {
      if (inZone && !hoverLatched) { hoverLatched = true; reveal(true, false, display); }
      return;
    }
    const forced = Date.now() < forceVisibleUntil;
    if (pinned || holdOpen || pointerInside || editing || movingWindow || forced) cancelHide();
    else scheduleHide();
  }, 110);
}

// Offline Start-menu detection, alongside hover/tray/shortcut access.
function setupStartWatch() {
  if (process.platform !== 'win32' || quitting) return;
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
// Custom horizontal-only window movement. The renderer sends only lifecycle
// events; the main process reads the real screen cursor X so moving the window
// cannot feed back into client coordinates. Y is always pinned to workArea.y.
onPanel('horizontal-drag-start', () => {
  if (!win || win.isDestroyed()) return;
  const wa = workArea();
  const cursor = screen.getCursorScreenPoint();
  const [wx] = win.getPosition();
  movingWindow = true;
  dragStartCursorX = cursor.x;
  dragStartWindowX = clampWindowX(wx, wa, WIN_W);
  userX = dragStartWindowX;
  cancelHide();
  forceVisibleUntil = Date.now() + GRACE;
  // Correct any stale vertical offset immediately and keep the panel visible.
  try { win.setPosition(userX, wa.y, false); } catch (_) {}
});

onPanel('horizontal-drag-update', () => {
  if (!movingWindow || !win || win.isDestroyed()) return;
  const wa = workArea();
  const cursor = screen.getCursorScreenPoint();
  const nx = clampWindowX(dragStartWindowX + (cursor.x - dragStartCursorX), wa, WIN_W);
  userX = nx;
  cancelHide();
  // Only X changes. Keeping this as setPosition avoids resize/repaint flicker.
  try { win.setPosition(nx, wa.y, false); } catch (_) {}
});

onPanel('horizontal-drag-end', () => {
  if (!movingWindow) return;
  movingWindow = false;
  const wa = workArea();
  if (win && !win.isDestroyed()) {
    const [wx] = win.getPosition();
    userX = clampWindowX(wx, wa, WIN_W);
    try { win.setPosition(userX, wa.y, false); } catch (_) {}
  }
  if (Number.isFinite(userX)) writeWindowPosition();
  forceVisibleUntil = Date.now() + GRACE;
  cancelHide();
});

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
    exportedState = latestState;
    const savedPosition = readWindowPosition();
    if (savedPosition) {
      userX = savedPosition.x;
      activeDisplayId = savedPosition.displayId ?? screen.getPrimaryDisplay().id;
    }
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
