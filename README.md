# 🍅 Pomodoro Hover Timer

**An offline focus companion for your Windows desktop.**

Pomodoro Timing brings 25-minute focus sessions, task progress, daily notes,
reminders, and Persian-calendar statistics into a compact desktop panel.
It is built with Electron and has a Persian interface.

> **Publication status:** The project page and documentation are available.
> The application source and downloadable Windows release have not been
> uploaded yet. This repository does not currently contain a runnable app.

## About the app

- Multiple independent 25-minute Pomodoro timers with editable task names.
- Per-task session targets, progress rings, and manual progress adjustments.
- A tray-based panel with a **Ctrl + Alt + P** shortcut and pinning.
- Daily notes and an archive of previous notes.
- One-time and recurring reminders.
- Daily focus statistics, weekly summaries, and a Persian monthly calendar.
- Local data storage without an account or runtime cloud service.

## Project details

| Item | Details |
| --- | --- |
| Intended platform | Windows x64 |
| Framework | Electron |
| Interface language | Persian |
| Documentation language | English |
| License | MIT |

## Source and downloads

The next publication step is to add the application source, reproducible npm
setup, automated checks, and a Windows ZIP in **Releases**.

The prepared update addresses hover activation, reminder date conversion,
timer accuracy after delayed callbacks, and saving during normal exit.
A real Windows desktop smoke test is still required before claiming those
desktop integrations have been verified on Windows.

## Saved data

The original app keeps tasks, notes, reminders, and history in
`Documents\Pomodoro Timing`. Back up that folder before upgrading.
Data is stored as readable local files; the app does not encrypt it.

## Contributing

Bug reports, accessibility improvements, translations, and focused pull requests
are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright © 2026 mohammadrezasmz2.
Released under the [MIT License](LICENSE).
Bundled third-party components retain their own licenses.
