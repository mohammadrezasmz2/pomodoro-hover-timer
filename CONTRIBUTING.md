# Contributing

Thank you for contributing to Pomodoro Timing.

## Before opening a change

1. Search existing issues and pull requests first.
2. For larger behavior changes, open an issue describing the problem and proposed approach.
3. Keep pull requests focused on one problem when practical.

## Development setup

```bash
npm install
npm start
```

Windows is required to fully test tray integration, autostart, PowerShell-based
Start-menu detection, and the release packaging flow.

## Checks

Run before submitting a pull request:

```bash
npm run check
```

If the change affects packaging, also run on Windows:

```powershell
npm run build:windows
```

Then extract the generated ZIP and test `Install.bat`, `Run.bat`, `Restart.bat`,
and `Uninstall.bat` in a non-production folder.

## Code guidelines

- Preserve `contextIsolation: true` and `nodeIntegration: false` unless a security-reviewed change requires otherwise.
- Expose only narrowly scoped IPC methods through `preload.js`.
- Do not add secrets, tokens, personal user data, generated logs, or packaged runtimes to the repository.
- Prefer DOM `textContent` for user-controlled strings rather than assigning them to `innerHTML`.
- Keep Persian and English UI strings in sync when adding visible features.
- Update `CHANGELOG.md` for user-visible changes.

## Pull requests

A pull request should explain what changed, why it changed, how it was tested,
and include screenshots for visible UI changes when possible.

By submitting a contribution, you agree that your contribution is licensed
under the repository's MIT License.
