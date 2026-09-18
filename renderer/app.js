// app.js — panel logic (works inside Electron and as a plain browser preview)

const isDesktop = typeof window.desktop !== 'undefined';
if (!isDesktop) document.body.classList.add('preview');

const STATE_VERSION = 8;
const SEG_COUNT = 15;
const RING_C = 2 * Math.PI * 50;
const BODY_PAD = 10;
const MAIN_BODY_HEIGHT = 300;   // fixed shell height: side tools must scroll, never resize the window
const STEP = 10;                 // + / − change progress by 10%

const ACCENTS = [
  { accent: '#37d67a', glow: 'rgba(55,214,122,.5)'  },
  { accent: '#ff7a1a', glow: 'rgba(255,122,26,.55)' },
  { accent: '#ffd21e', glow: 'rgba(255,210,30,.5)'  },
  { accent: '#38b6ff', glow: 'rgba(56,182,255,.5)'  },
  { accent: '#ff5da2', glow: 'rgba(255,93,162,.5)'  },
];
const WEEK_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']; // Sat..Fri
const WEEK_FULL = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']; // Sat..Fri
const WEEK_SHORT_EN = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr'];
const WEEK_FULL_EN = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// --- Jalali (شمسی) helpers, using the browser's Persian calendar ----------
function toJalali(date) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
  const o = {}; for (const p of parts) if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  return { jy: o.year, jm: o.month, jd: o.day };
}
function jalaliToDate(jy, jm, jd, hh, mm) {
  const base = new Date(jy + 621, (jm - 1), jd, hh || 0, mm || 0, 0, 0);
  for (let off = -40; off <= 40; off++) {
    const g = new Date(base.getTime() + off * 864e5);
    const c = toJalali(g);
    if (c.jy === jy && c.jm === jm && c.jd === jd) return new Date(g.getFullYear(), g.getMonth(), g.getDate(), hh || 0, mm || 0, 0, 0);
  }
  return base;
}
const MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const MONTHS_EN_JALALI = ['Farvardin', 'Ordibehesht', 'Khordad', 'Tir', 'Mordad', 'Shahrivar', 'Mehr', 'Aban', 'Azar', 'Dey', 'Bahman', 'Esfand'];
function jalaliLong(date) {
  try {
    const j = toJalali(date);
    const en = currentLang() === 'en';
    const week = en ? WEEK_FULL_EN : WEEK_FULL;
    const months = en ? MONTHS_EN_JALALI : MONTHS_FA;
    return `${week[(date.getDay() + 1) % 7]} ${uiNum(j.jd)} ${months[j.jm - 1]}(${j.jm}) ${uiNum(j.jy)}`;
  } catch (_) { return ''; }
}
// 'YYYY-MM-DD' (Gregorian) -> Jalali display string
function jalaliOfKey(gkey) {
  try { const p = String(gkey).split('-'); return jalaliLong(new Date(+p[0], +p[1] - 1, +p[2])); }
  catch (_) { return gkey; }
}

// A "timer" = one task. `progress` is a percent (0..100). Each finished pomodoro
// adds 100/goal %. The +/- buttons nudge progress by 10%. `goal` is how many
// pomodoros make the task 100% complete.
function mkTimer(id, title, color) {
  return { id, title, color, running: false, durationSec: 1500, remainingSec: 1500, goal: 4, progress: 0 };
}

const DEFAULTS = {
  version: STATE_VERSION,
  settings: { alertOnFinish: true, language: 'fa', rightPanelMode: 'week', dateCalendar: 'persian', theme: 'dark' },
  history: [],
  habits: { items: [], records: {} },
  todos: { byDate: {} },
  timers: [ mkTimer(1, 'Deep Work', 0), mkTimer(2, 'UI Design', 1), mkTimer(3, 'Study', 2) ],
};

let state = load();
state.settings = Object.assign({ alertOnFinish: true, language: 'fa', rightPanelMode: 'week', dateCalendar: 'persian', theme: 'dark' }, state.settings || {});
if (!Array.isArray(state.history)) state.history = [];
ensureProductivityState(state);
let nextId = Math.max(0, ...state.timers.map(t => t.id)) + 1;
// (initial persist happens in restoreFromMemory(), after reading the disk memory)

const I18N = {
  fa: {
    toolReminder: 'یادآور', toolStats: 'آمار و تقویم', toolSettings: 'تنظیمات',
    toolPin: 'سنجاق کردن (باز نگه‌داشتن)', toolHide: 'مخفی کردن', toolClose: 'بستن (به تری می‌رود)',
    alertOnFinish: 'نمایش پنجره هنگام پایان تایمر', language: 'زبان',
    dateSystem: 'نوع تاریخ', calendarPersian: 'شمسی', calendarGregorian: 'میلادی', calendarHijri: 'قمری',
    themeLabel: 'تم', themeDark: 'دارک', themeLight: 'روشن',
    openData: '📁 باز کردن پوشهٔ حافظه (Documents)', aboutButton: 'ℹ️ درباره',
    shortcutHint: 'میان‌بر نمایش سریع: Ctrl + Alt + P', todayNote: 'یادداشت امروز',
    notePlaceholder: 'امروز روی چی کار کردی؟ اینجا بنویس…', previousNotes: '🗒️ یادداشت‌های روزهای قبل',
    addTimer: 'افزودن تایمر جدید', thisWeek: 'این هفته', pomodoroFinished: 'یک پومودورو تمام شد',
    breakTime: 'وقت استراحت', finishOk: 'OK — تمام شد، استراحت', previousNotesTitle: '🗒️ یادداشت‌های روزهای قبل',
    close: 'بستن', remindersTitle: '⏰ یادآورها (تاریخ شمسی)', savedReminders: 'ثبت‌شده‌ها',
    setReminder: 'تنظیم یادآور', dateLabel: 'تاریخ:', year: 'سال', month: 'ماه', day: 'روز',
    timeLabel: 'ساعت:', hour: 'ساعت', minute: 'دقیقه', textLabel: 'متن:', reminderPlaceholder: 'یادم بنداز که…',
    repeatLabel: 'تکرار:', repeatNone: 'بدون تکرار', repeatWeekly: 'هر هفته', repeatMonthly: 'هر ماه',
    addReminder: 'افزودن یادآور', quickFromNow: 'سریع (از الان)', reminder: 'یادآور', okay: 'باشه',
    aboutTitle: 'ℹ️ درباره Pomodoro Timing', developer: 'سازنده', email: 'ایمیل',
    goalTitle: 'هدف: چند پومودورو تا ۱۰۰٪؟ (کلیک کن و عدد بزن)', timeRemaining: 'زمان باقی‌مانده',
    durationUnit: 'MIN', durationEditTitle: 'مدت تایمر را بین ۵ تا ۶۰ دقیقه تنظیم کن',
    ringTitle: 'چرخ ماوس: یک پومودورو +/−', progress: 'پیشرفت', incTitle: 'یک پومودورو +',
    decTitle: 'یک پومودورو −', deleteTimer: 'حذف تایمر', untitled: 'بدون عنوان', newTimer: 'تایمر جدید',
    taskComplete: ({title}) => `کارِ «${title}» کامل شد 🎉`, reached100: 'به ۱۰۰٪ رسید — آفرین!',
    pomodoroBreak: ({title, progress}) => `«${title}» — ${uiNum(progress)}٪ • وقت استراحت`,
    todaySuffix: 'امروز', noNotes: 'هنوز یادداشتی ثبت نشده.', deleteDay: 'حذف این روز',
    deleteDayConfirm: 'آیا مایلید یادداشت این روز حذف شود؟', weekEmpty: 'این هفته هنوز پومودورویی ثبت نشده.',
    weekTotal: ({count}) => `مجموع هفته: <b>${uiNum(count)}</b> پومودورو`,
    solarLabel: 'شمسی', gregorianLabel: 'میلادی', hijriLabel: 'قمری',
    hoursLater: ({hours}) => `${uiNum(hours)} ساعت دیگر`, defaultHoursReminder: ({hours}) => `یادآور ${uiNum(hours)} ساعته`,
    noReminders: 'یادآوری ثبت نشده.', weeklyBadge: 'هفتگی', monthlyBadge: 'ماهانه', noText: '(بدون متن)',
    reminderFallback: 'یادآور',
    weekMode: 'هفته', habitMode: 'عادت‌ها', todoMode: 'کارها', weekModeTitle: 'نمای هفتگی',
    habitModeTitle: 'هبیت ترکر', todoModeTitle: 'فهرست کارهای روز', habitTracker: 'هبیت ترکر', todoList: 'فهرست کارهای روز',
    habitPlaceholder: 'عنوان عادت…', todoPlaceholder: 'کار این روز…', addHabit: 'افزودن عادت', addTodo: 'افزودن کار',
    habitDoneLegend: '✓ انجام شد', habitMissedLegend: '✕ انجام نشد', todoDoneLegend: '✓ انجام شد', todoMissedLegend: '✕ انجام نشد',
    noHabits: 'برای این روز عادت فعالی وجود ندارد.', noTodos: 'برای این روز کاری ثبت نشده.', removeHabit: 'حذف عادت', removeTodo: 'حذف کار',
    habitDuration: 'مدت عادت', habitDurationWeek: '۱ هفته', habitDurationMonth: '۱ ماه', habitDurationYear: '۱ سال',
    habitUntil: 'تا', todoStatusCycle: 'وضعیت: خالی ← انجام شد ← انجام نشد', noteActivityTitle: 'فعالیت‌های ثبت‌شده',
    noteHabits: 'عادت‌ها', noteWorks: 'کارها', todayCompact: 'امروز'
  },
  en: {
    toolReminder: 'Reminders', toolStats: 'Statistics & Calendar', toolSettings: 'Settings',
    toolPin: 'Pin (keep open)', toolHide: 'Hide', toolClose: 'Close (keep in tray)',
    alertOnFinish: 'Show window when a timer finishes', language: 'Language',
    dateSystem: 'Date system', calendarPersian: 'Solar Hijri', calendarGregorian: 'Gregorian', calendarHijri: 'Hijri',
    themeLabel: 'Theme', themeDark: 'Dark', themeLight: 'Light',
    openData: '📁 Open data folder (Documents)', aboutButton: 'ℹ️ About',
    shortcutHint: 'Quick show shortcut: Ctrl + Alt + P', todayNote: "Today's note",
    notePlaceholder: 'What did you work on today? Write it here…', previousNotes: '🗒️ Previous notes',
    addTimer: 'Add new timer', thisWeek: 'This week', pomodoroFinished: 'One pomodoro finished',
    breakTime: 'Time for a break', finishOk: 'OK — done, take a break', previousNotesTitle: '🗒️ Previous notes',
    close: 'Close', remindersTitle: '⏰ Reminders (Solar Hijri date)', savedReminders: 'Saved',
    setReminder: 'Set reminder', dateLabel: 'Date:', year: 'Year', month: 'Month', day: 'Day',
    timeLabel: 'Time:', hour: 'Hour', minute: 'Minute', textLabel: 'Text:', reminderPlaceholder: 'Remind me to…',
    repeatLabel: 'Repeat:', repeatNone: 'No repeat', repeatWeekly: 'Every week', repeatMonthly: 'Every month',
    addReminder: 'Add reminder', quickFromNow: 'Quick (from now)', reminder: 'Reminder', okay: 'OK',
    aboutTitle: 'ℹ️ About Pomodoro Timing', developer: 'Developer', email: 'Email',
    goalTitle: 'Goal: how many pomodoros to reach 100%? (click and enter a number)', timeRemaining: 'Time remaining',
    durationUnit: 'MIN', durationEditTitle: 'Set timer duration from 5 to 60 minutes',
    ringTitle: 'Mouse wheel: one pomodoro +/−', progress: 'Progress', incTitle: 'One pomodoro +',
    decTitle: 'One pomodoro −', deleteTimer: 'Delete timer', untitled: 'Untitled', newTimer: 'New timer',
    taskComplete: ({title}) => `“${title}” is complete 🎉`, reached100: 'Reached 100% — great work!',
    pomodoroBreak: ({title, progress}) => `“${title}” — ${progress}% • time for a break`,
    todaySuffix: 'today', noNotes: 'No notes have been saved yet.', deleteDay: 'Delete this day',
    deleteDayConfirm: 'Delete the note for this day?', weekEmpty: 'No pomodoros recorded this week yet.',
    weekTotal: ({count}) => `Week total: <b>${count}</b> pomodoros`,
    solarLabel: 'Solar Hijri', gregorianLabel: 'Gregorian', hijriLabel: 'Hijri',
    hoursLater: ({hours}) => `${hours} hour${hours === 1 ? '' : 's'} from now`,
    defaultHoursReminder: ({hours}) => `${hours}-hour reminder`, noReminders: 'No reminders saved.',
    weeklyBadge: 'Weekly', monthlyBadge: 'Monthly', noText: '(no text)', reminderFallback: 'Reminder',
    weekMode: 'Week', habitMode: 'Habits', todoMode: 'To-do', weekModeTitle: 'Weekly view',
    habitModeTitle: 'Habit Tracker', todoModeTitle: 'Daily To Do List', habitTracker: 'Habit Tracker', todoList: 'To Do List',
    habitPlaceholder: 'Habit title…', todoPlaceholder: 'Task for this day…', addHabit: 'Add habit', addTodo: 'Add task',
    habitDoneLegend: '✓ Done', habitMissedLegend: '✕ Missed', todoDoneLegend: '✓ Done', todoMissedLegend: '✕ Not done',
    noHabits: 'No active habits for this day.', noTodos: 'No tasks for this day.', removeHabit: 'Remove habit', removeTodo: 'Remove task',
    habitDuration: 'Habit duration', habitDurationWeek: '1 week', habitDurationMonth: '1 month', habitDurationYear: '1 year',
    habitUntil: 'until', todoStatusCycle: 'Status: empty → done → missed', noteActivityTitle: 'Recorded activity',
    noteHabits: 'Habits', noteWorks: 'Works', todayCompact: 'Today'
  }
};
function currentLang() { return state && state.settings && state.settings.language === 'en' ? 'en' : 'fa'; }
function t(key, vars) {
  const value = (I18N[currentLang()] || I18N.fa)[key];
  return typeof value === 'function' ? value(vars || {}) : (value == null ? key : value);
}
function uiNum(value) {
  if (currentLang() === 'en') return String(value);
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(value).replace(/\d/g, (d) => fa[d]);
}

const CALENDAR_IDS = { persian: 'persian', gregorian: 'gregory', hijri: 'islamic-umalqura' };
function currentCalendarMode() {
  const v = state && state.settings ? state.settings.dateCalendar : 'persian';
  return ['persian', 'gregorian', 'hijri'].includes(v) ? v : 'persian';
}
function currentTheme() {
  return state && state.settings && state.settings.theme === 'light' ? 'light' : 'dark';
}
function calendarParts(date, mode) {
  const m = mode || currentCalendarMode();
  const id = CALENDAR_IDS[m] || CALENDAR_IDS.persian;
  try {
    const parts = new Intl.DateTimeFormat(`en-US-u-ca-${id}`, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
    const out = {};
    for (const p of parts) if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
    return { year: out.year, month: out.month, day: out.day };
  } catch (_) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
}
function calendarMonthName(date, mode) {
  const m = mode || currentCalendarMode();
  const id = CALENDAR_IDS[m] || CALENDAR_IDS.persian;
  const locale = currentLang() === 'en' ? 'en-US' : 'fa-IR';
  try { return new Intl.DateTimeFormat(`${locale}-u-ca-${id}`, { month: 'long' }).format(date); }
  catch (_) { return String(calendarParts(date, m).month); }
}
function calendarWeekdayName(date, mode) {
  const m = mode || currentCalendarMode();
  const id = CALENDAR_IDS[m] || CALENDAR_IDS.persian;
  const locale = currentLang() === 'en' ? 'en-US' : 'fa-IR';
  try { return new Intl.DateTimeFormat(`${locale}-u-ca-${id}`, { weekday: 'long' }).format(date); }
  catch (_) { return ''; }
}
function calendarLong(date, mode) {
  const p = calendarParts(date, mode);
  return `${calendarWeekdayName(date, mode)} ${uiNum(p.day)} ${calendarMonthName(date, mode)}(${uiNum(p.month)}) ${uiNum(p.year)}`.trim();
}
function calendarShort(date, mode) {
  const p = calendarParts(date, mode);
  return `${uiNum(p.day)} ${calendarMonthName(date, mode)}(${uiNum(p.month)}) ${uiNum(p.year)}`;
}
function displayDateOfKey(gkey) {
  try {
    const p = String(gkey).split('-').map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite)) return gkey;
    return calendarLong(new Date(p[0], p[1] - 1, p[2]), currentCalendarMode());
  } catch (_) { return gkey; }
}
function applyTheme() {
  const theme = currentTheme();
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme !== 'light');
  document.documentElement.dataset.theme = theme;
  const sel = document.getElementById('themeSelect');
  if (sel) sel.value = theme;
}
function translateTree(root) {
  if (!root) return;
  const nodes = [];
  if (root.matches && (root.matches('[data-i18n]') || root.matches('[data-i18n-title]') || root.matches('[data-i18n-placeholder]'))) nodes.push(root);
  if (root.querySelectorAll) nodes.push(...root.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-placeholder]'));
  for (const el of nodes) {
    if (el.dataset.i18n) el.textContent = t(el.dataset.i18n);
    if (el.dataset.i18nTitle) el.title = t(el.dataset.i18nTitle);
    if (el.dataset.i18nPlaceholder) el.placeholder = t(el.dataset.i18nPlaceholder);
  }
}
function applyLanguage() {
  const lang = currentLang();
  document.documentElement.lang = lang;
  // Keep the entire UI geometry identical to the English layout in both languages.
  // Language switching changes text only; it must never mirror/reorder the header,
  // settings, side panels, timer controls, or reminder columns.
  document.documentElement.dir = 'ltr';
  document.body.classList.toggle('lang-en', lang === 'en');
  document.body.classList.toggle('lang-fa', lang === 'fa');
  translateTree(document);
  const rowTemplate = document.getElementById('rowTpl');
  if (rowTemplate && rowTemplate.content) translateTree(rowTemplate.content);
  const languageSelect = document.getElementById('languageSelect');
  if (languageSelect) languageSelect.value = lang;
  const calendarSelect = document.getElementById('calendarSelect');
  if (calendarSelect) calendarSelect.value = currentCalendarMode();
  applyTheme();
  // Only the user's note text follows the selected writing direction; its panel stays left.
  const note = document.getElementById('noteToday');
  if (note) note.dir = lang === 'fa' ? 'rtl' : 'ltr';
  updateHeaderDate();
}

function ensureProductivityState(target) {
  if (!target || typeof target !== 'object') return;
  if (!target.habits || typeof target.habits !== 'object') target.habits = { items: [], records: {} };
  if (!Array.isArray(target.habits.items)) target.habits.items = [];
  if (!target.habits.records || typeof target.habits.records !== 'object' || Array.isArray(target.habits.records)) target.habits.records = {};
  target.habits.items.forEach((h) => {
    if (!h || typeof h !== 'object') return;
    if (!h.createdDate) h.createdDate = dateKey(new Date(h.createdTs || Date.now()));
    if (!['week', 'month', 'year'].includes(h.duration)) h.duration = 'year';
    if (!h.endDate) h.endDate = habitEndDate(h.createdDate, h.duration);
  });
  if (!target.todos || typeof target.todos !== 'object') target.todos = { byDate: {} };
  if (!target.todos.byDate || typeof target.todos.byDate !== 'object' || Array.isArray(target.todos.byDate)) target.todos.byDate = {};
}
function normalizeState(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.timers)) return structuredClone(DEFAULTS);
  if (s.version === 3) { // migrate old done/goal format -> progress%
    s.timers.forEach(tmr => {
      const g = Math.max(1, tmr.goal || 1);
      tmr.progress = Math.max(0, Math.min(100, Math.round((tmr.done || 0) / g * 100)));
      delete tmr.done;
    });
  }
  s.version = STATE_VERSION;
  s.settings = Object.assign({ alertOnFinish: true, language: 'fa', rightPanelMode: 'week', dateCalendar: 'persian', theme: 'dark' }, s.settings || {});
  if (!['week', 'habits', 'todos'].includes(s.settings.rightPanelMode)) s.settings.rightPanelMode = 'week';
  if (!['persian', 'gregorian', 'hijri'].includes(s.settings.dateCalendar)) s.settings.dateCalendar = 'persian';
  if (!['dark', 'light'].includes(s.settings.theme)) s.settings.theme = 'dark';
  s.timers.forEach((tmr) => {
    if (!tmr || typeof tmr !== 'object') return;
    let mins = Math.round((Number(tmr.durationSec) || 1500) / 60);
    mins = Math.max(5, Math.min(60, mins));
    tmr.durationSec = mins * 60;
    if (!Number.isFinite(Number(tmr.remainingSec))) tmr.remainingSec = tmr.durationSec;
    tmr.remainingSec = Math.max(0, Math.min(tmr.durationSec, Math.round(Number(tmr.remainingSec))));
  });
  if (!Array.isArray(s.history)) s.history = [];
  ensureProductivityState(s);
  return s;
}
function load() {
  try {
    const raw = localStorage.getItem('pomodoro-state');
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (_) {}
  return structuredClone(DEFAULTS);
}
function save() {
  try { localStorage.setItem('pomodoro-state', JSON.stringify(state)); } catch (_) {}
  if (isDesktop && window.desktop.syncState) { try { window.desktop.syncState(state); } catch (_) {} }
  if (isDesktop && window.desktop.saveData) { try { window.desktop.saveData(JSON.stringify(state, null, 2)); } catch (_) {} }
  pushStatsState();
}

// record one completed focus session into history (for the analyzer & calendar)
function pad2(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function recordCompletion(t) {
  if (!Array.isArray(state.history)) state.history = [];
  const d = new Date();
  const durationMin = Math.max(5, Math.min(60, Math.round((Number(t.durationSec) || 1500) / 60)));
  state.history.push({ date: dateKey(d), ts: d.getTime(), title: t.title, color: t.color, durationMin });
}

const listEl = document.getElementById('timerList');
const tpl = document.getElementById('rowTpl');

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function clampPct(v) { return Math.max(0, Math.min(100, v)); }

// ---------- render ----------
function renderList() {
  listEl.innerHTML = '';
  state.timers.forEach(t => listEl.appendChild(buildRow(t)));
  syncSize();
}

function buildRow(t) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  translateTree(node);
  const c = ACCENTS[t.color % ACCENTS.length];
  node.style.setProperty('--accent', c.accent);
  node.style.setProperty('--glow', c.glow);
  node.dataset.id = t.id;

  const run = node.querySelector('.js-run');
  run.classList.toggle('off', !t.running);
  run.addEventListener('click', () => { t.running = !t.running; run.classList.toggle('off', !t.running); save(); });

  const title = node.querySelector('.js-title');
  title.textContent = t.title;
  title.setAttribute('dir', 'auto');
  bindEditableTitle(title, (v) => { t.title = v; save(); });

  const durationInput = node.querySelector('.js-duration');
  durationInput.value = String(Math.max(5, Math.min(60, Math.round((Number(t.durationSec) || 1500) / 60))));
  durationInput.addEventListener('focus', () => { reportEditing(true); try { durationInput.select(); } catch (_) {} });
  durationInput.addEventListener('click', (e) => e.stopPropagation());
  durationInput.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  durationInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); durationInput.blur(); }
    else if (e.key === 'Escape') { durationInput.value = String(Math.round(t.durationSec / 60)); durationInput.blur(); }
  });
  durationInput.addEventListener('change', () => commitDuration(t, node, durationInput));
  durationInput.addEventListener('blur', () => { commitDuration(t, node, durationInput); reportEditing(false); });

  node.querySelector('.js-goal').addEventListener('click', () => editGoal(t, node));

  const segWrap = node.querySelector('.js-segments');
  for (let i = 0; i < SEG_COUNT; i++) { const s = document.createElement('span'); s.className = 'seg'; segWrap.appendChild(s); }

  node.querySelector('.js-ring').addEventListener('wheel', (e) => {
    e.preventDefault();
    setProgress(t, (t.progress || 0) + (e.deltaY < 0 ? STEP : -STEP), node);
  }, { passive: false });

  node.querySelector('.js-inc').addEventListener('click', () => setProgress(t, (t.progress || 0) + STEP, node));
  node.querySelector('.js-dec').addEventListener('click', () => setProgress(t, (t.progress || 0) - STEP, node));

  node.querySelector('.js-del').addEventListener('click', () => {
    state.timers = state.timers.filter(x => x.id !== t.id);
    save(); renderList();
  });

  paintRow(t, node);
  return node;
}

function paintRow(t, node) {
  node.querySelector('.js-time').textContent = fmt(t.remainingSec);
  const durationInput = node.querySelector('.js-duration');
  if (durationInput && document.activeElement !== durationInput) durationInput.value = String(Math.round(t.durationSec / 60));
  const p = clampPct(t.progress || 0);
  const f = p / 100;
  // Segmented bar = PROGRESS. Each completed pomodoro adds 100/goal %, so the bar
  // fills up and reaches 100% after `goal` pomodoros are done.
  const onCount = Math.round(f * SEG_COUNT);
  node.querySelectorAll('.seg').forEach((s, i) => s.classList.toggle('on', i < onCount));
  const prog = node.querySelector('.js-ring-prog');
  prog.setAttribute('stroke-dasharray', `${f * RING_C} ${RING_C}`);
  prog.style.opacity = p > 0 ? '1' : '0';
  node.querySelector('.js-pct').textContent = `${Math.round(p)}%`;
  const chip = node.querySelector('.js-goal');
  if (!chip.querySelector('input')) {
    const goal = Math.max(1, t.goal || 1);
    chip.textContent = `🍅 ${Math.round(f * goal)}/${goal}`;
  }
}

function commitDuration(t, node, input) {
  let mins = parseInt(input.value, 10);
  if (!Number.isFinite(mins)) mins = Math.round((Number(t.durationSec) || 1500) / 60);
  mins = Math.max(5, Math.min(60, mins));
  input.value = String(mins);
  const nextSec = mins * 60;
  if (nextSec === t.durationSec) return;
  t.durationSec = nextSec;
  // Changing duration is a timer setup action: reset this countdown to the new
  // length and stop it so no hidden elapsed-time state carries over.
  t.remainingSec = nextSec;
  t.running = false;
  const run = node.querySelector('.js-run');
  if (run) run.classList.add('off');
  paintRow(t, node);
  save();
}

function nodeFor(id) { return listEl.querySelector(`.timer-row[data-id="${id}"]`); }

function setProgress(t, val, node) {
  t.progress = clampPct(Math.round(val));
  paintRow(t, node || nodeFor(t.id));
  save();
}

function editGoal(t, node) {
  const chip = node.querySelector('.js-goal');
  if (chip.querySelector('input')) return;
  chip.textContent = '';
  const input = document.createElement('input');
  input.className = 'goal-input'; input.type = 'text'; input.inputMode = 'numeric'; input.value = t.goal || 1;
  chip.appendChild(input); input.focus(); input.select();
  reportEditing(true);
  const commit = (keep) => {
    if (input._done) return; input._done = true;
    reportEditing(false);
    if (keep) { const n = parseInt(input.value, 10); if (!Number.isNaN(n)) t.goal = Math.max(1, Math.min(99, n)); }
    input.remove();            // remove the editor first, so the chip text refreshes
    save(); paintRow(t, node);
  };
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
}

function bindEditableTitle(el, onSave) {
  el.addEventListener('focus', () => reportEditing(true));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  el.addEventListener('blur', () => { const v = el.textContent.trim() || t('untitled'); el.textContent = v; onSave(v); reportEditing(false); });
}

// ---------- add ----------
document.getElementById('addBtn').addEventListener('click', () => {
  state.timers.push(mkTimer(nextId++, t('newTimer'), state.timers.length % ACCENTS.length));
  save(); renderList();
  const n = nodeFor(nextId - 1);
  if (n) n.scrollIntoView({ block: 'nearest' });
});

// ---------- countdown ----------
setInterval(() => {
  let changed = false;
  state.timers.forEach(t => {
    if (t.running && t.remainingSec > 0) {
      t.remainingSec -= 1;
      if (t.remainingSec <= 0) {
        t.progress = clampPct((t.progress || 0) + 100 / Math.max(1, t.goal || 1)); // one pomodoro done
        t.remainingSec = t.durationSec;
        t.running = false;
        changed = true;
        recordCompletion(t);
        const n = nodeFor(t.id);
        if (n) n.querySelector('.js-run').classList.add('off');
        onFinished(t);
      }
      const n = nodeFor(t.id);
      if (n) paintRow(t, n);
    }
  });
  if (changed) { save(); renderWeek(); }
}, 1000);
setInterval(save, 5000);

// ---------- finish handling ----------
const finishQueue = [];
let showingFinish = false;
const overlay = document.getElementById('finishOverlay');
const finishTitleEl = document.getElementById('finishTitle');
const finishSubEl = document.getElementById('finishSub');

function onFinished(t) {
  if (!state.settings.alertOnFinish) return;
  finishQueue.push({ title: t.title, progress: Math.round(t.progress) });
  if (!showingFinish) showNextFinish();
}
function showNextFinish() {
  if (finishQueue.length === 0) {
    showingFinish = false;
    overlay.classList.remove('show');
    if (isDesktop) { window.desktop.setHold(false); window.desktop.hide(); }
    return;
  }
  showingFinish = true;
  const f = finishQueue[0];
  if (f.progress >= 100) {
    finishTitleEl.textContent = t('taskComplete', { title: f.title });
    finishSubEl.textContent = t('reached100');
  } else {
    finishTitleEl.textContent = t('pomodoroFinished');
    finishSubEl.textContent = t('pomodoroBreak', { title: f.title, progress: f.progress });
  }
  overlay.classList.add('show');
  if (isDesktop) window.desktop.setHold(true);
  beep();
}
document.getElementById('finishOk').addEventListener('click', () => { finishQueue.shift(); showNextFinish(); });

function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = beep._ctx || (beep._ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    [0, 0.18].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.15);
      o.connect(g).connect(ctx.destination); o.start(t0 + d); o.stop(t0 + d + 0.16);
    });
  } catch (_) {}
}

// ---------- settings ----------
const gearBtn = document.getElementById('gearBtn');
const settingsPop = document.getElementById('settingsPop');
const setAlert = document.getElementById('setAlert');

setAlert.checked = !!state.settings.alertOnFinish;
setAlert.addEventListener('change', () => { state.settings.alertOnFinish = setAlert.checked; save(); });
const openDataBtn = document.getElementById('openDataBtn');
if (openDataBtn) openDataBtn.addEventListener('click', () => { if (isDesktop && window.desktop.openDataFolder) window.desktop.openDataFolder(); });
const languageSelect = document.getElementById('languageSelect');
if (languageSelect) {
  languageSelect.value = currentLang();
  languageSelect.addEventListener('change', () => {
    state.settings.language = languageSelect.value === 'en' ? 'en' : 'fa';
    save();
    refreshLocalizedUI();
  });
}
const calendarSelect = document.getElementById('calendarSelect');
if (calendarSelect) {
  calendarSelect.value = currentCalendarMode();
  calendarSelect.addEventListener('change', () => {
    const value = calendarSelect.value;
    state.settings.dateCalendar = ['persian', 'gregorian', 'hijri'].includes(value) ? value : 'persian';
    save();
    refreshLocalizedUI();
  });
}
const themeSelect = document.getElementById('themeSelect');
if (themeSelect) {
  themeSelect.value = currentTheme();
  themeSelect.addEventListener('change', () => {
    state.settings.theme = themeSelect.value === 'light' ? 'light' : 'dark';
    save();
    applyTheme();
  });
}
const aboutOverlay = document.getElementById('aboutOverlay');
const aboutBtn = document.getElementById('aboutBtn');
const aboutClose = document.getElementById('aboutClose');
if (aboutBtn) aboutBtn.addEventListener('click', () => {
  settingsPop.classList.remove('show'); gearBtn.classList.remove('active');
  aboutOverlay.classList.add('show');
  if (isDesktop && window.desktop.resize) window.desktop.resize(390);
});
if (aboutClose) aboutClose.addEventListener('click', () => { aboutOverlay.classList.remove('show'); syncSize(); });

gearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPop.classList.toggle('show');
  gearBtn.classList.toggle('active', settingsPop.classList.contains('show'));
});
document.addEventListener('click', (e) => {
  if (settingsPop.classList.contains('show') && !settingsPop.contains(e.target) && e.target !== gearBtn) {
    settingsPop.classList.remove('show'); gearBtn.classList.remove('active');
  }
});

// ---------- title-bar buttons ----------
let pinned = false;
const pinBtn = document.getElementById('pinBtn');
pinBtn.addEventListener('click', () => {
  pinned = !pinned; pinBtn.classList.toggle('active', pinned);
  if (isDesktop) window.desktop.setPinned(pinned);
});
document.getElementById('minBtn').addEventListener('click', () => { if (isDesktop) window.desktop.minimize(); });
document.getElementById('closeBtn').addEventListener('click', () => { if (isDesktop) window.desktop.hide(); });
const statsBtn = document.getElementById('statsBtn');
const statsDock = document.getElementById('statsDock');
const statsFrame = document.getElementById('statsFrame');
let statsDockOpen = false;
let statsFocusDateKey = null;

function pushStatsState() {
  if (!statsDockOpen || !statsFrame || !statsFrame.contentWindow) return;
  try { statsFrame.contentWindow.postMessage({ type: 'pomodoro-state', state }, '*'); } catch (_) {}
}
async function setStatsDock(open) {
  statsDockOpen = !!open;
  if (statsDock) {
    statsDock.classList.toggle('show', statsDockOpen);
    statsDock.setAttribute('aria-hidden', statsDockOpen ? 'false' : 'true');
    if (!statsDockOpen) { statsDock.style.height = ''; statsDock.style.minHeight = ''; statsDock.style.maxHeight = ''; }
  }
  if (statsBtn) statsBtn.classList.toggle('active', statsDockOpen);
  if (statsDockOpen && statsDock && isDesktop && window.desktop.getWorkArea) {
    try {
      const wa = await window.desktop.getWorkArea();
      const panel = document.getElementById('panel');
      const dockH = statsDock.getBoundingClientRect().height || 300;
      const baseH = Math.max(0, panel.getBoundingClientRect().height - dockH - 10);
      const room = Math.max(150, Math.floor((wa && wa.height ? wa.height : 760) - BODY_PAD * 2 - baseH - 12));
      const fitted = Math.min(300, room);
      statsDock.style.height = `${fitted}px`;
      statsDock.style.minHeight = `${fitted}px`;
      statsDock.style.maxHeight = `${fitted}px`;
    } catch (_) {}
  }
  if (statsDockOpen) setTimeout(pushStatsState, 30);
  syncSize();
}
function pushStatsFocusDate(dateOrKey) {
  if (!statsDockOpen || !statsFrame || !statsFrame.contentWindow) return;
  const key = typeof dateOrKey === 'string' ? dateOrKey : dateKey(dateOrKey instanceof Date ? dateOrKey : new Date());
  statsFocusDateKey = key;
  try { statsFrame.contentWindow.postMessage({ type: 'pomodoro-focus-date', date: key }, '*'); } catch (_) {}
}
async function showStatsForTrackerDate(date) {
  const key = dateKey(date instanceof Date ? date : new Date());
  statsFocusDateKey = key;
  if (!statsDockOpen) await setStatsDock(true);
  else pushStatsState();
  setTimeout(() => pushStatsFocusDate(key), 45);
}
if (statsFrame) statsFrame.addEventListener('load', () => {
  if (!statsDockOpen) return;
  pushStatsState();
  if (statsFocusDateKey) setTimeout(() => pushStatsFocusDate(statsFocusDateKey), 20);
});
if (statsBtn) statsBtn.addEventListener('click', () => setStatsDock(!statsDockOpen));
if (isDesktop && window.desktop.onToggleStatsDock) window.desktop.onToggleStatsDock(() => setStatsDock(!statsDockOpen));

// ---------- size sync (fit 3 rows, scroll beyond) ----------
function applyListFit() {
  const rows = [...listEl.children];
  if (rows.length > 3) {
    const rH = rows[0].offsetHeight;
    listEl.style.maxHeight = (rH * 3 + 8 * 2) + 'px';
    listEl.style.overflowY = 'auto';
  } else { listEl.style.maxHeight = ''; listEl.style.overflowY = ''; }
}
function lockMainBodyHeight() {
  const body = document.querySelector('.body');
  if (!body) return;
  // Keep the original three-row shell geometry *exactly* fixed. Habit/To-do
  // content is allowed to grow only inside its own scroll viewport. Using a
  // hard min/height/max trio also prevents a flex item's min-content size from
  // stretching the entire Electron window.
  const h = MAIN_BODY_HEIGHT + 'px';
  body.style.height = h;
  body.style.minHeight = h;
  body.style.maxHeight = h;
}
function syncSize() {
  applyListFit();
  requestAnimationFrame(() => {
    lockMainBodyHeight();
    requestAnimationFrame(() => {
      if (!isDesktop) return;
      const panel = document.getElementById('panel');
      window.desktop.resize(Math.ceil(panel.getBoundingClientRect().height) + BODY_PAD * 2);
    });
  });
}

// ---------- desktop integration ----------
function reportEditing(v) { if (isDesktop) window.desktop.editing(v); }

if (isDesktop) {
  const panel = document.getElementById('panel');
  panel.addEventListener('mouseenter', () => window.desktop.pointerInside(true));
  panel.addEventListener('mouseleave', () => window.desktop.pointerInside(false));
  window.desktop.onReveal(() => panel.classList.add('show'));
  window.desktop.onConceal(() => {
    panel.classList.remove('show');
    const finish = () => { window.desktop.concealDone(); panel.removeEventListener('transitionend', finish); };
    panel.addEventListener('transitionend', finish);
    setTimeout(finish, 300);
  });
} else {
  document.getElementById('panel').classList.add('show');
}

// ---------- Today notes (kept for one day, then archived) ----------
const noteEl = document.getElementById('noteToday');
const notesOverlay = document.getElementById('notesOverlay');
const notesListEl = document.getElementById('notesList');
let noteSaveTimer = null;

function ensureNotes() {
  if (!state.notes || typeof state.notes !== 'object') state.notes = { today: { date: dateKey(new Date()), text: '' }, archive: [] };
  if (!state.notes.today) state.notes.today = { date: dateKey(new Date()), text: '' };
  if (!Array.isArray(state.notes.archive)) state.notes.archive = [];
}
function rolloverNotes() {
  ensureNotes();
  const today = dateKey(new Date());
  if (state.notes.today.date !== today) {
    if ((state.notes.today.text || '').trim()) state.notes.archive.unshift({ date: state.notes.today.date, text: state.notes.today.text });
    state.notes.today = { date: today, text: '' };
  }
}
function refreshNotes() { ensureNotes(); rolloverNotes(); if (noteEl) noteEl.value = state.notes.today.text || ''; }
function dayActivityForNotes(key) {
  ensureProductivityState(state);
  const result = { habits: [], works: [] };
  const habitMap = new Map(state.habits.items.filter(Boolean).map((h) => [String(h.id), h]));
  const recs = state.habits.records[key] && typeof state.habits.records[key] === 'object' ? state.habits.records[key] : {};
  Object.entries(recs).forEach(([id, status]) => {
    if (status !== 'done' && status !== 'missed') return;
    const h = habitMap.get(String(id));
    const title = h ? `${h.title || t('untitled')} — ${habitDurationText(h.duration || 'year')}` : String(id);
    result.habits.push({ title, status });
  });
  const works = Array.isArray(state.todos.byDate[key]) ? state.todos.byDate[key] : [];
  works.forEach((x) => result.works.push({ title: (x && x.title) || t('untitled'), status: x && x.status }));
  return result;
}
function hasDayActivity(a) { return !!(a && (a.habits.length || a.works.length)); }
function activityLine(label, entries) {
  const line = document.createElement('div'); line.className = 'ni-activity-line';
  const head = document.createElement('strong'); head.textContent = label + ': '; line.appendChild(head);
  entries.forEach((entry, i) => {
    if (i) line.appendChild(document.createTextNode(' • '));
    const part = document.createElement('span');
    part.className = entry.status === 'done' ? 'ok' : entry.status === 'missed' ? 'miss' : 'pending';
    part.textContent = `${entry.status === 'done' ? '✓' : entry.status === 'missed' ? '×' : '□'} ${entry.title}`;
    line.appendChild(part);
  });
  return line;
}
function renderNotesList() {
  ensureNotes(); ensureProductivityState(state);
  notesListEl.innerHTML = '';

  const notesByDate = new Map();
  notesByDate.set(state.notes.today.date, { key: 'today', text: state.notes.today.text || '' });
  state.notes.archive.forEach((a, i) => { if (a && a.date) notesByDate.set(a.date, { key: 'arch', idx: i, text: a.text || '' }); });

  const dates = new Set(notesByDate.keys());
  Object.keys(state.habits.records || {}).forEach((k) => dates.add(k));
  Object.keys(state.todos.byDate || {}).forEach((k) => dates.add(k));
  const ordered = [...dates].sort().reverse();
  const visible = ordered.filter((key) => {
    const note = notesByDate.get(key);
    const act = dayActivityForNotes(key);
    return !!((note && String(note.text || '').trim()) || hasDayActivity(act));
  });

  if (!visible.length) {
    const e = document.createElement('div'); e.className = 'notes-empty'; e.textContent = t('noNotes'); notesListEl.appendChild(e); return;
  }

  for (const key of visible) {
    const note = notesByDate.get(key) || null;
    const act = dayActivityForNotes(key);
    const d = document.createElement('div'); d.className = 'note-item';
    const dt = document.createElement('div'); dt.className = 'ni-date';
    const dlabel = document.createElement('span');
    dlabel.textContent = displayDateOfKey(key) + (key === dateKey(new Date()) ? `  (${t('todaySuffix')})` : '') + (note ? '  ✎' : '');
    dt.appendChild(dlabel);

    if (note && String(note.text || '').trim()) {
      const ndel = document.createElement('button'); ndel.className = 'ni-del'; ndel.title = t('deleteDay'); ndel.textContent = '🗑';
      ndel.addEventListener('click', () => {
        if (!confirm(t('deleteDayConfirm'))) return;
        if (note.key === 'today') { state.notes.today.text = ''; if (noteEl) noteEl.value = ''; }
        else if (state.notes.archive[note.idx]) { state.notes.archive.splice(note.idx, 1); }
        save(); renderNotesList();
      });
      dt.appendChild(ndel);
    }
    d.appendChild(dt);

    if (note) {
      const tx = document.createElement('div'); tx.className = 'ni-text'; tx.contentEditable = 'true'; tx.spellcheck = false;
      tx.setAttribute('dir', 'auto'); tx.textContent = note.text || '';
      tx.addEventListener('focus', () => reportEditing(true));
      tx.addEventListener('blur', () => {
        reportEditing(false);
        const val = tx.innerText.replace(/\u00a0/g, ' ');
        if (note.key === 'today') { state.notes.today.text = val; if (noteEl) noteEl.value = val; }
        else if (state.notes.archive[note.idx]) { state.notes.archive[note.idx].text = val; }
        save();
      });
      d.appendChild(tx);
    }

    if (hasDayActivity(act)) {
      const box = document.createElement('div'); box.className = 'ni-activity';
      const h = document.createElement('div'); h.className = 'ni-activity-title'; h.textContent = t('noteActivityTitle'); box.appendChild(h);
      if (act.habits.length) box.appendChild(activityLine(t('noteHabits'), act.habits));
      if (act.works.length) box.appendChild(activityLine(t('noteWorks'), act.works));
      d.appendChild(box);
    }
    notesListEl.appendChild(d);
  }
}
if (noteEl) {
  noteEl.addEventListener('focus', () => reportEditing(true));
  noteEl.addEventListener('blur', () => { reportEditing(false); ensureNotes(); state.notes.today.text = noteEl.value; save(); });
  noteEl.addEventListener('input', () => {
    ensureNotes(); state.notes.today.text = noteEl.value;
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(save, 600);
  });
}
const prevNotesBtn = document.getElementById('prevNotesBtn');
if (prevNotesBtn) prevNotesBtn.addEventListener('click', () => { renderNotesList(); notesOverlay.classList.add('show'); if (isDesktop && window.desktop.resize) window.desktop.resize(640); });
const notesCloseBtn = document.getElementById('notesClose');
if (notesCloseBtn) notesCloseBtn.addEventListener('click', () => { notesOverlay.classList.remove('show'); syncSize(); });

// ---------- right-side modes: Week / Habit Tracker / To Do List ----------
const weekModeBtn = document.getElementById('weekModeBtn');
const habitModeBtn = document.getElementById('habitModeBtn');
const todoModeBtn = document.getElementById('todoModeBtn');
const weekView = document.getElementById('weekView');
const habitView = document.getElementById('habitView');
const todoView = document.getElementById('todoView');
const habitListEl = document.getElementById('habitList');
const todoListEl = document.getElementById('todoList');
const habitInput = document.getElementById('habitInput');
const habitDurationEl = document.getElementById('habitDuration');
const todoInput = document.getElementById('todoInput');
let habitSelectedDate = new Date();
let todoSelectedDate = new Date();

function copyLocalDate(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function shiftLocalDate(d, delta) { const n = copyLocalDate(d); n.setDate(n.getDate() + delta); return n; }
function dateFromKey(key) {
  const p = String(key || '').split('-').map(Number);
  return p.length === 3 && p.every(Number.isFinite) ? new Date(p[0], p[1] - 1, p[2]) : new Date();
}
function habitEndDate(startKey, duration) {
  const d = dateFromKey(startKey);
  if (duration === 'week') d.setDate(d.getDate() + 6);
  else if (duration === 'month') { d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() - 1); }
  else { d.setFullYear(d.getFullYear() + 1); d.setDate(d.getDate() - 1); }
  return dateKey(d);
}
function habitDurationText(duration) {
  return duration === 'week' ? t('habitDurationWeek') : duration === 'month' ? t('habitDurationMonth') : t('habitDurationYear');
}
function habitActiveOn(habit, key) {
  const start = habit.createdDate || dateKey(new Date(habit.createdTs || Date.now()));
  const end = habit.endDate || habitEndDate(start, habit.duration || 'year');
  if (habit.archived && habit.archivedDate && key >= habit.archivedDate) return false;
  return start <= key && key <= end;
}
function trackerDateLabel(d) {
  if (dateKey(d) === dateKey(new Date())) return t('todayCompact');
  try {
    const p = calendarParts(d, currentCalendarMode());
    return `${uiNum(p.day)} ${calendarMonthName(d, currentCalendarMode())}(${uiNum(p.month)})`;
  } catch (_) { return dateKey(d); }
}
function makeTrackerEmpty(text) {
  const el = document.createElement('div');
  el.className = 'tracker-empty';
  el.textContent = text;
  return el;
}
function nextTrackerId(prefix) { return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}`; }
function setRightPanelMode(mode) {
  if (!['week', 'habits', 'todos'].includes(mode)) mode = 'week';
  state.settings.rightPanelMode = mode;
  save(); renderRightPanel(); syncSize();
  // Habit/To-do work is mirrored immediately in the docked day tables below.
  if (mode === 'habits') showStatsForTrackerDate(habitSelectedDate);
  else if (mode === 'todos') showStatsForTrackerDate(todoSelectedDate);
}
function renderRightPanel() {
  ensureProductivityState(state);
  const mode = ['week', 'habits', 'todos'].includes(state.settings.rightPanelMode) ? state.settings.rightPanelMode : 'week';
  const pairs = [[weekModeBtn, weekView, 'week'], [habitModeBtn, habitView, 'habits'], [todoModeBtn, todoView, 'todos']];
  for (const [btn, view, key] of pairs) {
    if (btn) btn.classList.toggle('active', mode === key);
    if (view) view.classList.toggle('active', mode === key);
  }
  if (mode === 'week') renderWeek();
  else if (mode === 'habits') renderHabits();
  else renderTodos();
}

function renderHabits() {
  ensureProductivityState(state);
  const key = dateKey(habitSelectedDate);
  const label = document.getElementById('habitToday');
  const next = document.getElementById('habitNext');
  if (label) { label.textContent = trackerDateLabel(habitSelectedDate); label.title = t('todayCompact'); }
  if (next) next.disabled = key >= dateKey(new Date());
  if (!habitListEl) return;
  const previousScrollTop = habitListEl.scrollTop;
  habitListEl.innerHTML = '';
  const items = state.habits.items.filter((h) => h && habitActiveOn(h, key));
  if (!items.length) { habitListEl.appendChild(makeTrackerEmpty(t('noHabits'))); return; }
  const recs = state.habits.records[key] || {};
  for (const habit of items) {
    const row = document.createElement('div'); row.className = 'tracker-item habit-item';
    const top = document.createElement('div'); top.className = 'tracker-item-top';
    const textWrap = document.createElement('div'); textWrap.className = 'tracker-text-wrap';
    const title = document.createElement('div'); title.className = 'tracker-item-title'; title.textContent = habit.title || t('untitled'); title.dir = 'auto';
    const meta = document.createElement('div'); meta.className = 'habit-meta';
    const end = habit.endDate || habitEndDate(habit.createdDate, habit.duration || 'year');
    meta.textContent = `${habitDurationText(habit.duration)} • ${t('habitUntil')} ${trackerDateLabel(dateFromKey(end))}`;
    const del = document.createElement('button'); del.type = 'button'; del.className = 'tracker-del'; del.textContent = '×'; del.title = t('removeHabit');
    textWrap.append(title, meta); top.append(textWrap, del);
    const actions = document.createElement('div'); actions.className = 'tracker-actions habit-actions';
    const done = document.createElement('button'); done.type = 'button'; done.className = 'status-btn done'; done.textContent = '✓'; done.title = t('habitDoneLegend');
    const miss = document.createElement('button'); miss.type = 'button'; miss.className = 'status-btn missed'; miss.textContent = '×'; miss.title = t('habitMissedLegend');
    const status = recs[habit.id];
    done.classList.toggle('selected', status === 'done'); miss.classList.toggle('selected', status === 'missed');
    done.addEventListener('click', () => setHabitStatus(habit.id, 'done'));
    miss.addEventListener('click', () => setHabitStatus(habit.id, 'missed'));
    del.addEventListener('click', () => { showStatsForTrackerDate(habitSelectedDate); habit.archived = true; habit.archivedDate = dateKey(new Date()); save(); renderHabits(); });
    actions.append(done, miss); row.append(top, actions); habitListEl.appendChild(row);
  }
  requestAnimationFrame(() => {
    habitListEl.scrollTop = Math.min(previousScrollTop, Math.max(0, habitListEl.scrollHeight - habitListEl.clientHeight));
  });
}
function setHabitStatus(id, status) {
  showStatsForTrackerDate(habitSelectedDate);
  ensureProductivityState(state);
  const key = dateKey(habitSelectedDate);
  const habit = state.habits.items.find((h) => h && String(h.id) === String(id));
  if (!habit || !habitActiveOn(habit, key)) return;
  const recs = state.habits.records[key] || (state.habits.records[key] = {});
  if (recs[id] === status) delete recs[id]; else recs[id] = status;
  if (Object.keys(recs).length === 0) delete state.habits.records[key];
  save(); renderHabits();
}
function addHabit(title) {
  const text = String(title || '').trim(); if (!text) return;
  showStatsForTrackerDate(habitSelectedDate);
  ensureProductivityState(state);
  const duration = habitDurationEl && ['week', 'month', 'year'].includes(habitDurationEl.value) ? habitDurationEl.value : 'week';
  const createdDate = dateKey(habitSelectedDate);
  state.habits.items.push({
    id: nextTrackerId('h'), title: text, createdDate, createdTs: Date.now(),
    duration, endDate: habitEndDate(createdDate, duration), archived: false
  });
  save(); if (habitInput) habitInput.value = ''; renderHabits();
  requestAnimationFrame(() => { if (habitListEl) habitListEl.scrollTop = habitListEl.scrollHeight; });
}

function todosForKey(key) {
  ensureProductivityState(state);
  if (!Array.isArray(state.todos.byDate[key])) state.todos.byDate[key] = [];
  return state.todos.byDate[key];
}
function renderTodos() {
  ensureProductivityState(state);
  const key = dateKey(todoSelectedDate);
  const label = document.getElementById('todoToday');
  if (label) { label.textContent = trackerDateLabel(todoSelectedDate); label.title = t('todayCompact'); }
  if (!todoListEl) return;
  const previousScrollTop = todoListEl.scrollTop;
  todoListEl.innerHTML = '';
  // To-do items are intentionally date-scoped: nothing carries into the next day.
  const items = Array.isArray(state.todos.byDate[key]) ? state.todos.byDate[key] : [];
  if (!items.length) { todoListEl.appendChild(makeTrackerEmpty(t('noTodos'))); return; }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'tracker-item todo-item' + (item.status === 'done' ? ' done-state' : item.status === 'missed' ? ' missed-state' : '');

    const top = document.createElement('div'); top.className = 'todo-main';
    const statusBox = document.createElement('button');
    statusBox.type = 'button'; statusBox.className = 'todo-status-box'; statusBox.title = t('todoStatusCycle');
    statusBox.setAttribute('aria-label', t('todoStatusCycle'));
    if (item.status === 'done') statusBox.textContent = '✓';
    else if (item.status === 'missed') statusBox.textContent = '×';
    else statusBox.textContent = '';
    statusBox.addEventListener('click', () => cycleTodoStatus(key, item.id));

    const title = document.createElement('div'); title.className = 'tracker-item-title'; title.textContent = item.title || t('untitled'); title.dir = 'auto';
    const del = document.createElement('button'); del.type = 'button'; del.className = 'tracker-del'; del.textContent = '×'; del.title = t('removeTodo');
    del.addEventListener('click', () => {
      showStatsForTrackerDate(todoSelectedDate);
      state.todos.byDate[key] = todosForKey(key).filter((x) => x.id !== item.id);
      if (!state.todos.byDate[key].length) delete state.todos.byDate[key];
      save(); renderTodos();
    });
    top.append(statusBox, title, del); row.append(top); todoListEl.appendChild(row);
  }
  requestAnimationFrame(() => {
    todoListEl.scrollTop = Math.min(previousScrollTop, Math.max(0, todoListEl.scrollHeight - todoListEl.clientHeight));
  });
}
function cycleTodoStatus(key, id) {
  showStatsForTrackerDate(todoSelectedDate);
  const item = todosForKey(key).find((x) => x.id === id); if (!item) return;
  item.status = item.status == null ? 'done' : item.status === 'done' ? 'missed' : null;
  item.statusTs = item.status ? Date.now() : null;
  save(); renderTodos();
}
function setTodoStatus(key, id, status) {
  showStatsForTrackerDate(todoSelectedDate);
  const item = todosForKey(key).find((x) => x.id === id); if (!item) return;
  item.status = item.status === status ? null : status;
  item.statusTs = item.status ? Date.now() : null;
  save(); renderTodos();
}
function addTodo(title) {
  const text = String(title || '').trim(); if (!text) return;
  showStatsForTrackerDate(todoSelectedDate);
  const key = dateKey(todoSelectedDate);
  todosForKey(key).push({ id: nextTrackerId('t'), title: text, status: null, createdDate: key, createdTs: Date.now() });
  save(); if (todoInput) todoInput.value = ''; renderTodos();
  requestAnimationFrame(() => { if (todoListEl) todoListEl.scrollTop = todoListEl.scrollHeight; });
}

[weekModeBtn, habitModeBtn, todoModeBtn].forEach((btn) => { if (btn) btn.addEventListener('click', () => setRightPanelMode(btn.dataset.mode)); });
const habitAddForm = document.getElementById('habitAddForm');
if (habitAddForm) habitAddForm.addEventListener('submit', (e) => { e.preventDefault(); addHabit(habitInput && habitInput.value); });
const todoAddForm = document.getElementById('todoAddForm');
if (todoAddForm) todoAddForm.addEventListener('submit', (e) => { e.preventDefault(); addTodo(todoInput && todoInput.value); });
if (habitInput) {
  habitInput.addEventListener('focus', () => { reportEditing(true); showStatsForTrackerDate(habitSelectedDate); });
  habitInput.addEventListener('blur', () => reportEditing(false));
}
if (todoInput) {
  todoInput.addEventListener('focus', () => { reportEditing(true); showStatsForTrackerDate(todoSelectedDate); });
  todoInput.addEventListener('blur', () => reportEditing(false));
}
if (habitDurationEl) {
  habitDurationEl.addEventListener('focus', () => showStatsForTrackerDate(habitSelectedDate));
  habitDurationEl.addEventListener('change', () => showStatsForTrackerDate(habitSelectedDate));
}
const habitPrev = document.getElementById('habitPrev'), habitNext = document.getElementById('habitNext'), habitToday = document.getElementById('habitToday');
if (habitPrev) habitPrev.addEventListener('click', () => { habitSelectedDate = shiftLocalDate(habitSelectedDate, -1); renderHabits(); showStatsForTrackerDate(habitSelectedDate); });
if (habitNext) habitNext.addEventListener('click', () => { if (dateKey(habitSelectedDate) < dateKey(new Date())) habitSelectedDate = shiftLocalDate(habitSelectedDate, 1); renderHabits(); showStatsForTrackerDate(habitSelectedDate); });
if (habitToday) habitToday.addEventListener('click', () => { habitSelectedDate = new Date(); renderHabits(); showStatsForTrackerDate(habitSelectedDate); });
const todoPrev = document.getElementById('todoPrev'), todoNext = document.getElementById('todoNext'), todoToday = document.getElementById('todoToday');
if (todoPrev) todoPrev.addEventListener('click', () => { todoSelectedDate = shiftLocalDate(todoSelectedDate, -1); renderTodos(); showStatsForTrackerDate(todoSelectedDate); });
if (todoNext) todoNext.addEventListener('click', () => { todoSelectedDate = shiftLocalDate(todoSelectedDate, 1); renderTodos(); showStatsForTrackerDate(todoSelectedDate); });
if (todoToday) todoToday.addEventListener('click', () => { todoSelectedDate = new Date(); renderTodos(); showStatsForTrackerDate(todoSelectedDate); });

// ---------- weekly analyzer (last 7 days) ----------
const weekBarsEl = document.getElementById('weekBars');
const weekTotalEl = document.getElementById('weekTotal');
function accentOf(i) { return ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length]; }
function faNum(n) { return uiNum(n); }
function renderWeek() {
  if (!weekBarsEl) return;
  const now = new Date();
  const satOffset = (now.getDay() + 1) % 7;            // days since Saturday
  const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() - satOffset);
  const dayList = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sat.getTime() + i * 864e5);
    dayList.push({ date: dateKey(d), label: (currentLang() === 'en' ? WEEK_FULL_EN : WEEK_FULL)[i], recs: new Map() });
  }
  const idx = new Map(dayList.map((d, i) => [d.date, i]));
  const hist = Array.isArray(state.history) ? state.history : [];
  let maxCount = 0, total = 0;
  for (const h of hist) {
    if (!h || !idx.has(h.date)) continue;
    const day = dayList[idx.get(h.date)];
    const r = day.recs.get(h.title) || { title: h.title, color: h.color || 0, count: 0 };
    r.count += 1; day.recs.set(h.title, r);
    if (r.count > maxCount) maxCount = r.count;
  }
  weekBarsEl.innerHTML = '';
  if (maxCount === 0) {
    const e = document.createElement('div'); e.className = 'week-empty'; e.textContent = t('weekEmpty');
    weekBarsEl.appendChild(e); weekTotalEl.textContent = ''; return;
  }
  const chart = document.createElement('div'); chart.className = 'wc-chart';
  for (const day of dayList) {
    const grp = document.createElement('div'); grp.className = 'wc-day';
    const bars = document.createElement('div'); bars.className = 'wc-bars';
    const recs = [...day.recs.values()].sort((a, b) => a.color - b.color);
    for (const r of recs) {
      total += r.count;
      const bar = document.createElement('div'); bar.className = 'wc-bar';
      bar.style.background = accentOf(r.color).accent;
      bar.style.height = Math.max(4, Math.round((r.count / maxCount) * 100)) + '%';
      bar.title = `${r.title}: ${r.count}`;
      bars.appendChild(bar);
    }
    const lbl = document.createElement('div'); lbl.className = 'wc-label'; lbl.textContent = day.label;
    grp.append(bars, lbl); chart.appendChild(grp);
  }
  weekBarsEl.appendChild(chart);
  weekTotalEl.innerHTML = t('weekTotal', { count: currentLang() === 'en' ? total : faNum(total) });
}

// keep the note rolling over at midnight while the app runs
setInterval(() => {
  const before = state.notes && state.notes.today ? state.notes.today.date : null;
  rolloverNotes();
  if (state.notes.today.date !== before) {
    if (noteEl) noteEl.value = '';
    if (dateKey(habitSelectedDate) === before) habitSelectedDate = new Date();
    if (dateKey(todoSelectedDate) === before) todoSelectedDate = new Date();
    renderRightPanel(); save();
  }
}, 60000);

function renderAll() { renderList(); refreshNotes(); renderRightPanel(); }

// ---------- header date (Jalali / شمسی) ----------
function calendarDateWithMonthNumber(date, calendar) {
  try {
    const locale = currentLang() === 'en' ? 'en-US' : 'fa-IR';
    const fmt = new Intl.DateTimeFormat(`${locale}-u-ca-${calendar}`, { day: 'numeric', month: 'long', year: 'numeric' });
    const monthParts = new Intl.DateTimeFormat(`en-US-u-ca-${calendar}`, { month: 'numeric' }).formatToParts(date);
    const monthPart = monthParts.find((p) => p.type === 'month');
    const monthNo = monthPart ? String(parseInt(monthPart.value, 10)) : '';
    return fmt.formatToParts(date).map((p) => p.type === 'month' && monthNo ? `${p.value}(${monthNo})` : p.value).join('');
  } catch (_) { return ''; }
}
function updateHeaderDate() {
  const el = document.getElementById('headerDate'); if (!el) return;
  const d = new Date();
  const gap = currentLang() === 'en' ? '\u00a0•\u00a0' : '\u00a0\u00a0•\u00a0\u00a0';
  // Keep the established three-date header order/geometry unchanged.
  el.textContent = `${t('solarLabel')}: ${calendarLong(d, 'persian')}${gap}${t('gregorianLabel')}: ${calendarLong(d, 'gregorian')}${gap}${t('hijriLabel')}: ${calendarLong(d, 'hijri')}`;
}
updateHeaderDate();
setInterval(updateHeaderDate, 60000);

// ---------- reminders (Jalali date + time, with alarm) ----------
const reminderOverlay = document.getElementById('reminderOverlay');
const remListEl = document.getElementById('remList');
const alarmOverlay = document.getElementById('alarmOverlay');
const alarmSubEl = document.getElementById('alarmSub');
function ensureReminders() { if (!Array.isArray(state.reminders)) state.reminders = []; }
function openReminders() {
  ensureReminders();
  const j = toJalali(new Date()); const now = new Date();
  document.getElementById('remY').value = j.jy;
  document.getElementById('remM').value = j.jm;
  document.getElementById('remD').value = j.jd;
  document.getElementById('remH').value = now.getHours();
  document.getElementById('remMin').value = now.getMinutes();
  document.getElementById('remText').value = '';
  const rep = document.getElementById('remRepeat'); if (rep) rep.value = 'none';
  buildQuickChips();
  renderReminders();
  reminderOverlay.classList.add('show');
  if (isDesktop && window.desktop.resize) window.desktop.resize(600);
}
function buildQuickChips() {
  const q = document.getElementById('remQuick'); if (!q || q.children.length) return;
  for (let h = 1; h <= 12; h++) {
    const b = document.createElement('button'); b.className = 'rem-chip';
    b.textContent = t('hoursLater', { hours: currentLang() === 'en' ? h : faNum(h) });
    b.addEventListener('click', () => addQuickReminder(h));
    q.appendChild(b);
  }
}
function addQuickReminder(hours) {
  ensureReminders();
  const text = (document.getElementById('remText').value || '').trim() || t('defaultHoursReminder', { hours: currentLang() === 'en' ? hours : faNum(hours) });
  const repeat = (document.getElementById('remRepeat') || {}).value || 'none';
  state.reminders.push({ id: Date.now() + Math.floor(Math.random() * 1000), ts: Date.now() + hours * 3600000, text, repeat, fired: false });
  save(); renderReminders();
}
function renderReminders() {
  ensureReminders();
  remListEl.innerHTML = '';
  const up = state.reminders.slice().sort((a, b) => a.ts - b.ts);
  if (up.length === 0) { const e = document.createElement('div'); e.className = 'notes-empty'; e.textContent = t('noReminders'); remListEl.appendChild(e); return; }
  for (const r of up) {
    const d = new Date(r.ts);
    const row = document.createElement('div'); row.className = 'rem-item' + (r.fired ? ' fired' : '');
    const info = document.createElement('div'); info.className = 'rem-info';
    const dt = document.createElement('div'); dt.className = 'rem-when';
    dt.textContent = jalaliLong(d) + ' — ' + faNum(String(d.getHours()).padStart(2, '0')) + ':' + faNum(String(d.getMinutes()).padStart(2, '0'));
    if (r.repeat === 'weekly' || r.repeat === 'monthly') {
      const badge = document.createElement('span'); badge.className = 'rem-badge ' + r.repeat;
      badge.textContent = r.repeat === 'weekly' ? t('weeklyBadge') : t('monthlyBadge'); dt.appendChild(badge);
    }
    const tx = document.createElement('div'); tx.className = 'rem-txt'; tx.textContent = r.text || t('noText');
    info.append(dt, tx);
    const del = document.createElement('button'); del.className = 'rem-del'; del.textContent = '✕';
    del.addEventListener('click', () => { state.reminders = state.reminders.filter(x => x.id !== r.id); save(); renderReminders(); });
    row.append(info, del); remListEl.appendChild(row);
  }
}
function addReminderFromForm() {
  ensureReminders();
  const jy = parseInt(document.getElementById('remY').value, 10);
  const jm = parseInt(document.getElementById('remM').value, 10);
  const jd = parseInt(document.getElementById('remD').value, 10);
  const hh = parseInt(document.getElementById('remH').value, 10) || 0;
  const mm = parseInt(document.getElementById('remMin').value, 10) || 0;
  const text = document.getElementById('remText').value.trim();
  if (Number.isNaN(jy) || Number.isNaN(jm) || Number.isNaN(jd)) return;
  const when = jalaliToDate(jy, jm, jd, hh, mm);
  const repeat = (document.getElementById('remRepeat') || {}).value || 'none';
  state.reminders.push({ id: Date.now() + Math.floor(Math.random() * 1000), ts: when.getTime(), text, repeat, fired: false });
  save(); renderReminders();
  document.getElementById('remText').value = '';
}
const remindBtn = document.getElementById('remindBtn');
if (remindBtn) remindBtn.addEventListener('click', openReminders);
const reminderCloseBtn = document.getElementById('reminderClose');
if (reminderCloseBtn) reminderCloseBtn.addEventListener('click', () => { reminderOverlay.classList.remove('show'); syncSize(); });
const remAddBtn = document.getElementById('remAdd');
if (remAddBtn) remAddBtn.addEventListener('click', addReminderFromForm);
['remY', 'remM', 'remD', 'remH', 'remMin', 'remText'].forEach((id) => { const el = document.getElementById(id); if (el) { el.addEventListener('focus', () => reportEditing(true)); el.addEventListener('blur', () => reportEditing(false)); } });

let alarmQueue = [];
function fireAlarm(r) { alarmQueue.push(r); if (alarmQueue.length === 1) showAlarm(); }
function showAlarm() {
  if (alarmQueue.length === 0) { alarmOverlay.classList.remove('show'); if (isDesktop) { window.desktop.setHold(false); window.desktop.hide(); } return; }
  const r = alarmQueue[0]; const d = new Date(r.ts);
  alarmSubEl.textContent = (r.text || t('reminderFallback')) + '  •  ' + jalaliLong(d);
  alarmOverlay.classList.add('show');
  if (isDesktop) window.desktop.setHold(true);
  beep(); setTimeout(beep, 700); setTimeout(beep, 1400);
}
const alarmOkBtn = document.getElementById('alarmOk');
if (alarmOkBtn) alarmOkBtn.addEventListener('click', () => { alarmQueue.shift(); showAlarm(); });
setInterval(() => {
  ensureReminders();
  const now = Date.now(); let changed = false;
  for (const r of state.reminders) {
    if (!r.fired && now >= r.ts) {
      fireAlarm(r); changed = true;
      if (r.repeat === 'weekly') { do { r.ts += 7 * 864e5; } while (r.ts <= now); }
      else if (r.repeat === 'monthly') { const d = new Date(r.ts); do { d.setMonth(d.getMonth() + 1); } while (d.getTime() <= now); r.ts = d.getTime(); }
      else { r.fired = true; }
    }
  }
  if (changed) { save(); if (reminderOverlay.classList.contains('show')) renderReminders(); }
}, 1000);

function refreshLocalizedUI() {
  applyLanguage();
  applyTheme();
  renderAll();
  if (notesOverlay && notesOverlay.classList.contains('show')) renderNotesList();
  const quick = document.getElementById('remQuick');
  if (quick) { quick.innerHTML = ''; buildQuickChips(); }
  if (reminderOverlay && reminderOverlay.classList.contains('show')) renderReminders();
  if (showingFinish && finishQueue.length) {
    const f = finishQueue[0];
    if (f.progress >= 100) { finishTitleEl.textContent = t('taskComplete', { title: f.title }); finishSubEl.textContent = t('reached100'); }
    else { finishTitleEl.textContent = t('pomodoroFinished'); finishSubEl.textContent = t('pomodoroBreak', { title: f.title, progress: f.progress }); }
  }
  if (alarmQueue.length) {
    const r = alarmQueue[0];
    alarmSubEl.textContent = (r.text || t('reminderFallback')) + '  •  ' + jalaliLong(new Date(r.ts));
  }
  if (isDesktop && window.desktop.resize) {
    if (reminderOverlay && reminderOverlay.classList.contains('show')) window.desktop.resize(600);
    else if (notesOverlay && notesOverlay.classList.contains('show')) window.desktop.resize(640);
    else if (aboutOverlay && aboutOverlay.classList.contains('show')) window.desktop.resize(390);
    else syncSize();
  } else syncSize();
}

refreshLocalizedUI();

// Restore from the on-disk memory (Documents\Pomodoro Timing) if present, so
// data survives restarts even if browser storage is cleared. Then sync back.
async function restoreFromMemory() {
  if (isDesktop && window.desktop.loadData) {
    try {
      const f = await window.desktop.loadData();
      if (f && Array.isArray(f.timers)) {
        state = normalizeState(f);
        ensureNotes();
        nextId = Math.max(0, ...state.timers.map(t => t.id)) + 1;
        try { setAlert.checked = !!state.settings.alertOnFinish; } catch (_) {}
        try { if (languageSelect) languageSelect.value = currentLang(); } catch (_) {}
        try { if (calendarSelect) calendarSelect.value = currentCalendarMode(); } catch (_) {}
        try { if (themeSelect) themeSelect.value = currentTheme(); } catch (_) {}
        refreshLocalizedUI();
      }
    } catch (_) {}
  }
  save();
}
restoreFromMemory();
