// stats.js — daily analyzer + switchable Solar Hijri / Gregorian / Hijri calendar

const ACCENTS = [
  { accent: '#37d67a', glow: 'rgba(55,214,122,.45)' },
  { accent: '#ff7a1a', glow: 'rgba(255,122,26,.45)' },
  { accent: '#ffd21e', glow: 'rgba(255,210,30,.45)' },
  { accent: '#38b6ff', glow: 'rgba(56,182,255,.45)' },
  { accent: '#ff5da2', glow: 'rgba(255,93,162,.45)' },
];
const accent = (i) => ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length];
const CALENDAR_IDS = { persian: 'persian', gregorian: 'gregory', hijri: 'islamic-umalqura' };

const TXT = {
  fa: {
    docTitle: 'آمار و تقویم', pageTitle: 'آمار و تقویم پومودورو', dayOverview: 'جزئیات روز', dailyTitle: 'پومودوروهای روز', today: 'امروز',
    dayEmpty: 'هنوز پومودورویی برای این روز ثبت نشده.', thisMonth: 'این ماه',
    hint: 'روی هر روز کلیک کن تا جزئیات همان روز بالا نشان داده شود.', noData: 'هنوز داده‌ای ثبت نشده',
    total: ({pomodoros, habits, todos}) => `${num(pomodoros)} پومودورو • ${num(habits)} عادت انجام‌شده • ${num(todos)} کار انجام‌شده`,
    todaySuffix: 'امروز',
    daySum: ({count, minutes}) => `مجموع این روز: <b>${num(count)}</b> پومودورو  •  زمان تمرکز: <b>${num(minutes)}</b> دقیقه`,
    activityTitle: 'عادت‌ها و کارهای این روز', habitTracker: 'هبیت ترکر', todoList: 'فهرست کارهای روز',
    noHabitActivity: 'برای این روز وضعیت عادتی ثبت نشده.', noTodoActivity: 'برای این روز کاری ثبت نشده.',
    done: 'انجام شد', missed: 'انجام نشد', pending: 'در انتظار',
    habitDurationWeek: '۱ هفته', habitDurationMonth: '۱ ماه', habitDurationYear: '۱ سال', habitUntil: 'تا',
    calHabitDone: 'عادت انجام‌شده', calHabitMissed: 'عادت انجام‌نشده', calTodoDone: 'کار انجام‌شده', calTodoPending: 'کار ثبت‌شده'
  },
  en: {
    docTitle: 'Statistics & Calendar', pageTitle: 'Pomodoro Statistics & Calendar', dayOverview: 'Day overview', dailyTitle: 'Pomodoros by day', today: 'Today',
    dayEmpty: 'No pomodoros have been recorded for this day yet.', thisMonth: 'This month',
    hint: 'Click a day to show that day’s details above.', noData: 'No data recorded yet',
    total: ({pomodoros, habits, todos}) => `${pomodoros} pomodoro${pomodoros === 1 ? '' : 's'} • ${habits} habit${habits === 1 ? '' : 's'} done • ${todos} to-do${todos === 1 ? '' : 's'} done`,
    todaySuffix: 'today',
    daySum: ({count, minutes}) => `This day: <b>${count}</b> pomodoro${count === 1 ? '' : 's'}  •  Focus time: <b>${minutes}</b> minutes`,
    activityTitle: 'Habits & tasks for this day', habitTracker: 'Habit Tracker', todoList: 'To Do List',
    noHabitActivity: 'No habit status was recorded for this day.', noTodoActivity: 'No tasks were planned for this day.',
    done: 'Done', missed: 'Missed', pending: 'Pending',
    habitDurationWeek: '1 week', habitDurationMonth: '1 month', habitDurationYear: '1 year', habitUntil: 'until',
    calHabitDone: 'habit done', calHabitMissed: 'habit missed', calTodoDone: 'to-do done', calTodoPending: 'to-do recorded'
  }
};

let language = 'fa';
let calendarMode = 'persian';
let theme = 'dark';
const embedded = new URLSearchParams(location.search).get('embedded') === '1';
document.body.classList.toggle('embedded', embedded);
let history = [];
let habits = { items: [], records: {} };
let todos = { byDate: {} };
let selDate = localNoon(new Date());
let calAnchor = localNoon(new Date());

function tr(key, arg) {
  const v = (TXT[language] || TXT.fa)[key];
  return typeof v === 'function' ? v(arg) : v;
}
function num(x) {
  if (language === 'en') return String(x);
  return String(x).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
function applyLanguage() {
  document.documentElement.lang = language;
  // Keep physical layout stable; only text changes direction/content.
  document.documentElement.dir = 'ltr';
  document.body.classList.toggle('lang-fa', language === 'fa');
  document.body.classList.toggle('lang-en', language === 'en');
  document.title = tr('docTitle');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
}
function applyTheme() {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme !== 'light');
  document.documentElement.dataset.theme = theme;
}
function updateFromState(st) {
  const oldMode = calendarMode;
  history = (st && Array.isArray(st.history)) ? st.history : [];
  const h = st && st.habits && typeof st.habits === 'object' ? st.habits : {};
  habits = { items: Array.isArray(h.items) ? h.items : [], records: h.records && typeof h.records === 'object' ? h.records : {} };
  const td = st && st.todos && typeof st.todos === 'object' ? st.todos : {};
  todos = { byDate: td.byDate && typeof td.byDate === 'object' ? td.byDate : {} };
  language = st && st.settings && st.settings.language === 'en' ? 'en' : 'fa';
  const requestedCalendar = st && st.settings ? st.settings.dateCalendar : 'persian';
  calendarMode = ['persian', 'gregorian', 'hijri'].includes(requestedCalendar) ? requestedCalendar : 'persian';
  theme = st && st.settings && st.settings.theme === 'light' ? 'light' : 'dark';
  if (oldMode !== calendarMode) calAnchor = localNoon(selDate);
  applyLanguage();
  applyTheme();
}

function pad2(n) { return String(n).padStart(2, '0'); }
function localNoon(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0); }
function addDays(d, delta) { const n = localNoon(d); n.setDate(n.getDate() + delta); return n; }
function gkeyOfDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function dateFromKey(key) {
  const p = String(key || '').split('-').map(Number);
  return p.length === 3 && p.every(Number.isFinite) ? new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0) : null;
}
function calendarId(mode = calendarMode) { return CALENDAR_IDS[mode] || CALENDAR_IDS.persian; }
function localeForCalendar(mode = calendarMode) { return `${language === 'en' ? 'en-US' : 'fa-IR'}-u-ca-${calendarId(mode)}`; }
function calendarParts(d, mode = calendarMode) {
  try {
    const parts = new Intl.DateTimeFormat(`en-US-u-ca-${calendarId(mode)}`, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d);
    const out = {};
    for (const p of parts) if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
    return { year: out.year, month: out.month, day: out.day };
  } catch (_) {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
}
function sameCalendarMonth(d, target, mode = calendarMode) {
  const p = calendarParts(d, mode);
  return p.year === target.year && p.month === target.month;
}
function monthBounds(anchor, mode = calendarMode) {
  const target = calendarParts(anchor, mode);
  let first = localNoon(anchor), last = localNoon(anchor);
  for (let i = 0; i < 35; i++) {
    const prev = addDays(first, -1);
    if (!sameCalendarMonth(prev, target, mode)) break;
    first = prev;
  }
  for (let i = 0; i < 35; i++) {
    const next = addDays(last, 1);
    if (!sameCalendarMonth(next, target, mode)) break;
    last = next;
  }
  return { first, last, parts: target };
}
function shiftCalendarMonth(anchor, delta) {
  const b = monthBounds(anchor, calendarMode);
  return delta > 0 ? addDays(b.last, 1) : addDays(b.first, -1);
}
function calendarMonthName(d, mode = calendarMode) {
  try { return new Intl.DateTimeFormat(localeForCalendar(mode), { month: 'long' }).format(d); }
  catch (_) { return String(calendarParts(d, mode).month); }
}
function calendarWeekdayName(d, mode = calendarMode) {
  try { return new Intl.DateTimeFormat(localeForCalendar(mode), { weekday: 'long' }).format(d); }
  catch (_) { return ''; }
}
function formattedDate(d, mode = calendarMode) {
  const p = calendarParts(d, mode);
  return `${calendarWeekdayName(d, mode)} ${num(p.day)} ${calendarMonthName(d, mode)}(${num(p.month)}) ${num(p.year)}`.trim();
}
function monthTitleText(anchor) {
  const p = calendarParts(anchor, calendarMode);
  return `${calendarMonthName(anchor, calendarMode)}(${num(p.month)}) ${num(p.year)}`;
}
function calendarWeekStart() { return calendarMode === 'gregorian' ? 0 : 6; } // Gregorian: Sunday; Solar/Hijri: Saturday
function weekHeaders() {
  if (calendarMode === 'gregorian') return language === 'en' ? ['Su','Mo','Tu','We','Th','Fr','Sa'] : ['ی','د','س','چ','پ','ج','ش'];
  return language === 'en' ? ['Sa','Su','Mo','Tu','We','Th','Fr'] : ['ش','ی','د','س','چ','پ','ج'];
}

async function boot() {
  let initial = null;
  try {
    initial = (window.desktop && window.desktop.getState) ? await window.desktop.getState() : null;
  } catch (_) {}
  if (!initial) {
    try { initial = JSON.parse(localStorage.getItem('pomodoro-state') || 'null'); } catch (_) {}
  }
  updateFromState(initial);
  if (window.desktop && window.desktop.onStateUpdate) window.desktop.onStateUpdate((st) => { updateFromState(st); renderAll(); });
  window.addEventListener('message', (ev) => {
    const msg = ev && ev.data;
    if (!msg) return;
    if (msg.type === 'pomodoro-state' && msg.state) {
      updateFromState(msg.state);
      renderAll();
      return;
    }
    if (msg.type === 'pomodoro-focus-date' && msg.date) {
      const d = dateFromKey(msg.date);
      if (!d) return;
      selDate = localNoon(d);
      calAnchor = localNoon(d);
      renderAll();
    }
  });
  calAnchor = localNoon(new Date());
  wireNav();
  renderAll();
  if (embedded && window.parent && window.parent !== window) {
    try { window.parent.postMessage({ type: 'stats-ready' }, '*'); } catch (_) {}
  }
}

function entriesForGDate(d) {
  const key = gkeyOfDate(d);
  return history.filter((h) => h && h.date === key);
}
function habitInfo(id) {
  const h = habits.items.find((x) => x && String(x.id) === String(id));
  if (!h) return { title: String(id), meta: '' };
  const duration = h.duration === 'week' ? tr('habitDurationWeek') : h.duration === 'month' ? tr('habitDurationMonth') : tr('habitDurationYear');
  let until = '';
  if (h.endDate) {
    const d = dateFromKey(h.endDate);
    until = d ? formattedDate(d) : h.endDate;
  }
  const meta = until ? `${duration} • ${tr('habitUntil')} ${until}` : duration;
  return { title: h.title || String(id), meta };
}
function habitActiveOnDate(h, key) {
  if (!h || typeof h !== 'object') return false;
  const start = h.createdDate || gkeyOfDate(new Date(h.createdTs || Date.now()));
  const end = h.endDate || start;
  if (key < start || key > end) return false;
  if (h.archived && h.archivedDate && key >= h.archivedDate) return false;
  return true;
}
function activityForGDate(d) {
  const key = gkeyOfDate(d);
  const recs = habits.records[key] && typeof habits.records[key] === 'object' ? habits.records[key] : {};

  // Show every habit planned for this day, not only habits that already have a status.
  // This makes the dock useful while the user is planning the day: unchecked habits stay visible as Pending.
  const hs = [];
  const seen = new Set();
  for (const h of habits.items || []) {
    if (!habitActiveOnDate(h, key)) continue;
    const id = String(h.id);
    seen.add(id);
    const status = recs[id] === 'done' || recs[id] === 'missed' ? recs[id] : null;
    hs.push({ id, ...habitInfo(id), status });
  }
  // Keep legacy/orphaned records visible as well so historical data is never hidden.
  for (const [id, status] of Object.entries(recs)) {
    if (seen.has(String(id)) || (status !== 'done' && status !== 'missed')) continue;
    hs.push({ id, ...habitInfo(id), status });
  }

  const ts = Array.isArray(todos.byDate[key]) ? todos.byDate[key] : [];
  return { habits: hs, todos: ts };
}

function renderAll() { renderDaily(); renderActivities(); renderCalendar(); renderTotal(); }
function renderTotal() {
  let habitDone = 0, todoDone = 0;
  Object.values(habits.records || {}).forEach((r) => { if (r && typeof r === 'object') Object.values(r).forEach((s) => { if (s === 'done') habitDone += 1; }); });
  Object.values(todos.byDate || {}).forEach((arr) => { if (Array.isArray(arr)) arr.forEach((x) => { if (x && x.status === 'done') todoDone += 1; }); });
  const hasAny = history.length || habitDone || todoDone || Object.keys(todos.byDate || {}).length || Object.keys(habits.records || {}).length;
  document.getElementById('allTotal').textContent = hasAny ? tr('total', { pomodoros: history.length, habits: habitDone, todos: todoDone }) : tr('noData');
}

function renderDaily() {
  const isToday = gkeyOfDate(selDate) === gkeyOfDate(new Date());
  document.getElementById('dayLabel').textContent = formattedDate(selDate) + (isToday ? `  (${tr('todaySuffix')})` : '');
  const entries = entriesForGDate(selDate);
  const groups = new Map();
  for (const e of entries) { const g = groups.get(e.title) || { title: e.title, color: e.color || 0, count: 0 }; g.count += 1; groups.set(e.title, g); }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  const chart = document.getElementById('chart'); chart.innerHTML = '';
  if (list.length === 0) {
    const em = document.createElement('div'); em.className = 'empty'; em.textContent = tr('dayEmpty'); chart.appendChild(em);
    document.getElementById('daySum').textContent = '';
  } else {
    const max = Math.max(...list.map((g) => g.count));
    for (const g of list) {
      const c = accent(g.color);
      const col = document.createElement('div'); col.className = 'bar-col';
      const cnt = document.createElement('div'); cnt.className = 'bar-count'; cnt.textContent = num(g.count);
      const outer = document.createElement('div'); outer.className = 'bar-outer';
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.style.setProperty('--c', c.accent); bar.style.setProperty('--g', c.glow);
      const chartMax = embedded ? 48 : 150;
      bar.style.height = Math.max(4, Math.round((g.count / max) * chartMax)) + 'px';
      outer.appendChild(bar);
      const name = document.createElement('div'); name.className = 'bar-name'; name.textContent = g.title; name.title = g.title; name.dir = 'auto';
      col.append(cnt, outer, name); chart.appendChild(col);
    }
    const focusMinutes = entries.reduce((sum, e) => {
      const m = Math.max(1, Math.round(Number(e && e.durationMin) || 25));
      return sum + m;
    }, 0);
    document.getElementById('daySum').innerHTML = tr('daySum', { count: entries.length, minutes: focusMinutes });
  }
}

function activityRow(titleText, status, metaText) {
  const row = document.createElement('div'); row.className = `activity-row ${status || 'pending'}`;
  const icon = document.createElement('span'); icon.className = 'activity-status'; icon.textContent = status === 'done' ? '✓' : status === 'missed' ? '×' : '•';
  const text = document.createElement('span'); text.className = 'activity-text';
  const title = document.createElement('span'); title.className = 'activity-name'; title.textContent = titleText; title.dir = 'auto'; text.appendChild(title);
  if (metaText) { const meta = document.createElement('span'); meta.className = 'activity-meta'; meta.textContent = metaText; text.appendChild(meta); }
  const label = document.createElement('span'); label.className = 'activity-state'; label.textContent = tr(status === 'done' ? 'done' : status === 'missed' ? 'missed' : 'pending');
  row.append(icon, text, label); return row;
}
function renderActivities() {
  const data = activityForGDate(selDate);
  const hEl = document.getElementById('habitActivity'); hEl.innerHTML = '';
  if (!data.habits.length) { const e = document.createElement('div'); e.className = 'activity-empty'; e.textContent = tr('noHabitActivity'); hEl.appendChild(e); }
  else data.habits.forEach((h) => hEl.appendChild(activityRow(h.title, h.status, h.meta)));
  const tEl = document.getElementById('todoActivity'); tEl.innerHTML = '';
  if (!data.todos.length) { const e = document.createElement('div'); e.className = 'activity-empty'; e.textContent = tr('noTodoActivity'); tEl.appendChild(e); }
  else data.todos.forEach((item) => tEl.appendChild(activityRow(item.title || '—', item.status)));
}

function renderCalendar() {
  const bounds = monthBounds(calAnchor, calendarMode);
  document.getElementById('monthTitle').textContent = monthTitleText(calAnchor);
  const head = document.getElementById('calHead'); head.innerHTML = '';
  for (const w of weekHeaders()) { const d = document.createElement('div'); d.textContent = w; head.appendChild(d); }
  const body = document.getElementById('calBody'); body.innerHTML = '';

  const startCol = (bounds.first.getDay() - calendarWeekStart() + 7) % 7;
  const todayKey = gkeyOfDate(new Date());
  const selKey = gkeyOfDate(selDate);
  const counts = new Map();
  for (const h of history) {
    if (!h || !h.date) continue;
    const arr = counts.get(h.date) || [];
    arr.push(h); counts.set(h.date, arr);
  }

  for (let i = 0; i < startCol; i++) { const b = document.createElement('div'); b.className = 'cell blank'; body.appendChild(b); }
  for (let gDate = bounds.first; gDate <= bounds.last; gDate = addDays(gDate, 1)) {
    const key = gkeyOfDate(gDate);
    const entries = counts.get(key) || [];
    const act = activityForGDate(gDate);
    const hDone = act.habits.filter((x) => x.status === 'done').length;
    const hMiss = act.habits.filter((x) => x.status === 'missed').length;
    const tDone = act.todos.filter((x) => x.status === 'done').length;
    const tMiss = act.todos.filter((x) => x.status === 'missed').length;
    const tPending = act.todos.filter((x) => !x.status).length;
    const hasActivity = hDone + hMiss + tDone + tMiss + tPending > 0;
    const cell = document.createElement('div');
    cell.className = 'cell' + (entries.length ? ' has' : '') + (hasActivity ? ' has-activity' : '');
    if (key === todayKey) cell.classList.add('today');
    if (key === selKey) cell.classList.add('sel');
    const cp = calendarParts(gDate, calendarMode);
    const dayNum = document.createElement('div'); dayNum.className = 'dnum'; dayNum.textContent = num(cp.day); cell.appendChild(dayNum);
    if (entries.length) {
      const colors = [...new Set(entries.map((e) => e.color || 0))].slice(0, 6);
      const dots = document.createElement('div'); dots.className = 'dots';
      for (const c of colors) { const dot = document.createElement('div'); dot.className = 'dot'; dot.style.background = accent(c).accent; dots.appendChild(dot); }
      cell.appendChild(dots);
      const cnt = document.createElement('div'); cnt.className = 'cnt'; cnt.textContent = num(entries.length) + ' ×'; cell.appendChild(cnt);
    }
    if (hasActivity) {
      const meta = document.createElement('div'); meta.className = 'cal-activity';
      if (hDone) { const b = document.createElement('span'); b.className = 'ca done'; b.textContent = `✓${num(hDone)}`; b.title = `${num(hDone)} ${tr('calHabitDone')}`; meta.appendChild(b); }
      if (hMiss) { const b = document.createElement('span'); b.className = 'ca missed'; b.textContent = `×${num(hMiss)}`; b.title = `${num(hMiss)} ${tr('calHabitMissed')}`; meta.appendChild(b); }
      if (tDone) { const b = document.createElement('span'); b.className = 'ca todo-done'; b.textContent = `☑${num(tDone)}`; b.title = `${num(tDone)} ${tr('calTodoDone')}`; meta.appendChild(b); }
      if (tMiss) { const b = document.createElement('span'); b.className = 'ca todo-missed'; b.textContent = `☒${num(tMiss)}`; b.title = `${num(tMiss)} ${tr('missed')}`; meta.appendChild(b); }
      if (tPending) { const b = document.createElement('span'); b.className = 'ca todo-pending'; b.textContent = `□${num(tPending)}`; b.title = `${num(tPending)} ${tr('calTodoPending')}`; meta.appendChild(b); }
      cell.appendChild(meta);
    }
    const clickDate = localNoon(gDate);
    cell.addEventListener('click', () => { selDate = clickDate; calAnchor = clickDate; renderDaily(); renderActivities(); renderCalendar(); });
    body.appendChild(cell);
  }
}

function wireNav() {
  document.getElementById('dayPrev').onclick = () => { selDate = addDays(selDate, -1); calAnchor = localNoon(selDate); renderDaily(); renderActivities(); renderCalendar(); };
  document.getElementById('dayNext').onclick = () => { selDate = addDays(selDate, 1); calAnchor = localNoon(selDate); renderDaily(); renderActivities(); renderCalendar(); };
  document.getElementById('dayToday').onclick = () => { selDate = localNoon(new Date()); calAnchor = localNoon(selDate); renderAll(); };
  document.getElementById('monPrev').onclick = () => { calAnchor = shiftCalendarMonth(calAnchor, -1); renderCalendar(); };
  document.getElementById('monNext').onclick = () => { calAnchor = shiftCalendarMonth(calAnchor, 1); renderCalendar(); };
  document.getElementById('monThis').onclick = () => { calAnchor = localNoon(new Date()); renderCalendar(); };
}

boot();
