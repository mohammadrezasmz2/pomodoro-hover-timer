# Pomodoro Timing

Pomodoro Timing is a Windows desktop productivity app built with Electron. It
runs locally, stays available from the system tray, and combines Pomodoro
timers with notes, reminders, habit tracking, daily tasks, weekly summaries,
and calendar/statistics views.

> فارسی: [README.fa.md](README.fa.md)

## Features

- Multiple Pomodoro timers with editable duration, goal, progress, and task name
- Quick show/hide shortcut: `Ctrl + Alt + P`
- System-tray operation and optional Windows autostart
- Daily notes saved locally in the user's Documents folder
- Daily task list and habit tracker
- Weekly productivity summary and statistics/calendar view
- Reminder system
- Persian and English interface
- Persian, Gregorian, and Hijri date display options
- Dark and light themes
- No backend or cloud account required

## Platform

The current application and packaging scripts target **Windows x64**. The app
source is Electron/HTML/CSS/JavaScript, but Windows-specific behavior such as
PowerShell-based Start-menu detection means other desktop platforms are not
currently supported without changes.

## Development

Requirements:

- Node.js 20 or newer (Node 22 is recommended for development)
- npm
- Windows for testing Windows-specific behavior

```bash
npm install
npm start
```

The app's runtime dependency is pinned to Electron `31.7.7` to match the
original supplied build. Dependency updates should be tested before release.

## Static checks

```bash
npm run check
```

This validates JavaScript syntax and verifies that required application files
are present.

## Build a Windows portable ZIP

On Windows:

```powershell
npm run build:windows
```

or directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-portable.ps1
```

The build script downloads the official Electron 31.7.7 Windows x64 runtime,
copies this repository's app source into it, preserves Electron/Chromium
license files, adds the supplied Windows launcher scripts, and writes a release
ZIP plus SHA-256 checksum to `dist/`.

## GitHub Actions

- **CI** checks the repository on pushes and pull requests.
- **CodeQL** performs JavaScript security analysis.
- **Windows Build / Release** creates a portable Windows ZIP. A tag such as
  `v1.6.3` also creates a GitHub Release and attaches the ZIP and checksum.
- **Dependabot** checks the Electron development dependency and GitHub Actions.

## Data and privacy

Application data is stored locally under the user's Documents folder in
`Pomodoro Timing`. The source in this repository does not require a server-side
API or account to operate.

## Repository layout

```text
.
├─ main.js                 Electron main process
├─ preload.js              context-isolated renderer bridge
├─ _startwatch.ps1         Windows Start-menu watcher
├─ renderer/               HTML/CSS/renderer JavaScript
├─ build/                  application icons
├─ packaging/windows/      launcher/install helper scripts
├─ scripts/                checks and portable build script
└─ .github/                CI, release, security, issue/PR templates
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), the
[Code of Conduct](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before
submitting changes.

## License

Pomodoro Timing is released under the [MIT License](LICENSE).
Third-party attribution is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
