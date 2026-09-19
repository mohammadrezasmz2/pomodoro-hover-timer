// Shared, side-effect-free state and timer rules; also loaded by Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PomodoroCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function validState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.timers)) return false;
    return value.timers.every(t => t && typeof t === 'object' && Number.isSafeInteger(t.id) && typeof t.title === 'string');
  }
  function revision(value) { return Number.isSafeInteger(value?.revision) && value.revision >= 0 ? value.revision : 0; }
  function chooseState(local, disk) {
    if (!validState(local)) return validState(disk) ? disk : null;
    if (!validState(disk)) return local;
    if (revision(local) !== revision(disk)) return revision(local) > revision(disk) ? local : disk;
    return Number(local.updatedAt || 0) > Number(disk.updatedAt || 0) ? local : disk;
  }
  function markUpdated(state, now = Date.now()) {
    state.revision = revision(state) + 1;
    state.updatedAt = now;
  }
  function startTimer(timer, now = Date.now()) {
    if (!(timer.remainingSec > 0)) timer.remainingSec = timer.durationSec;
    timer.deadlineAt = now + timer.remainingSec * 1000;
    timer.completedAt = null;
    timer.running = true;
  }
  // Wall-clock deadlines include sleep and time while the app is closed.
  // Moving the clock back never increases the remaining displayed time.
  function advanceTimer(timer, now = Date.now()) {
    if (!timer.running) return false;
    if (!Number.isFinite(timer.deadlineAt)) timer.deadlineAt = now + timer.remainingSec * 1000;
    timer.remainingSec = Math.max(0, Math.min(timer.remainingSec, Math.ceil((timer.deadlineAt - now) / 1000)));
    if (timer.remainingSec > 0) return false;
    timer.completedAt = timer.deadlineAt;
    timer.running = false;
    timer.deadlineAt = null;
    timer.remainingSec = timer.durationSec;
    return true;
  }
  function pauseTimer(timer, now = Date.now()) {
    const completed = advanceTimer(timer, now);
    timer.running = false;
    timer.deadlineAt = null;
    return completed;
  }
  return {validState, chooseState, markUpdated, startTimer, advanceTimer, pauseTimer};
});
