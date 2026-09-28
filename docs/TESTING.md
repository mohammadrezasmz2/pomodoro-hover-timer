# Validation for v1.7.4

Run `npm run check` and `npm test` on Node.js 22.12+ (24 recommended).
On Windows, run `npm ci` followed by `npm run test:electron`.

The behavior suite covers snapshot ordering, legacy metadata, atomic writes and
backup recovery, failed writes, countdown delay/pause/restore, monitor geometry,
manual opening by default, saved hover preferences, tray/Start/shortcut access,
horizontal drag bounds/persistence, three-tab note exports and safe renaming,
hover hit testing, IPC sender/payload boundaries, bridge event wrapping, and
Jalali conversion against Intl around calendar boundaries.

The Windows Electron smoke test uses disposable Documents/userData directories.
It launches the real app twice, exercises the isolated preload and statistics
frame, resizes the window, edits a title/note, quits immediately, and verifies
that the next process restores those edits. Screenshots are test output, not
personal application data. The test never points at an existing user profile.

## Manual Windows checks

Automated launch/DOM tests do not replace these hardware/OS checks:

- With the hover setting off, verify the top edge never opens the panel. Enable
  it and hover on each monitor, including monitors above/left of the primary;
  leave/re-enter the zone, then disable and restart. Verify pin/editing and rapid hide/show.
- Drag the ↔ handle horizontally; verify no vertical jump and restored position.
- Tray, Ctrl+Alt+P, Windows Start by mouse and keyboard; hidden tray overflow.
- 100%, 125%, 150% and 200% scaling; small work areas and taskbars on each edge.
- Real sleep/resume and timer completion sound; one completion per interval.
- Multiple reminder alarms, Persian/English labels and calendar month/year edges.
- Install, restart, sign out/in for autostart, then uninstall shortcuts.
- Launch from paths with spaces, Persian text and an apostrophe.
- Upgrade with a copy of old data and test a full/read-only disk using disposable
  data. Confirm failure is visible and the app preserves the last valid JSON.

Running timers count time during sleep and while the app is closed. Pause excludes
time. Deadlines use the system clock, so manual clock adjustments can change the
completion time. A backward adjustment never raises the displayed remaining time.

Do not mark these manual checks as passed solely because CI is green. Record the
Windows version, monitor/DPI setup, exact package version and observed result.
