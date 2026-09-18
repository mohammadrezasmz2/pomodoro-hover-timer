# Open-Source Preparation Audit

Prepared from the supplied Pomodoro Timing 1.6.3 portable Windows archive on
2026-09-18.

## What was retained

- Electron application source (`main.js`, `preload.js`, renderer HTML/CSS/JS)
- Windows Start-menu watcher
- application icons
- existing Windows helper scripts for shortcuts/startup
- version `1.6.3` and author name from the supplied package metadata

## What was intentionally removed from source control

The bundled Electron runtime and `Pomodoro Timing.exe` were not copied into this
repository package. The supplied executable is larger than GitHub's normal Git
file-size limit, and generated runtimes are better distributed as Release assets.
The release build script reproduces the portable runtime from the official
Electron 31.7.7 distribution.

## Secret / network review

A text scan of the application source found no API keys, bearer tokens, service
credentials, or application network endpoints. The application source does not
require a backend API to run.

This is a best-effort source review, not a formal security audit.

## Third-party attribution

The Jalali date conversion code in `renderer/jalali.js` closely follows the
MIT-licensed `jalaali-js` / Borkowski algorithm implementation. Attribution and
its MIT notice were added to `THIRD_PARTY_NOTICES.md` and to the source header.

The release runtime is Electron and retains the Electron/Chromium license files
provided in the official distribution.

## Validation performed

- JavaScript syntax checks for application source
- required-file checks
- scan for common credential / secret patterns
- Git-friendly exclusion rules for binaries, user data, logs, and environment files

## Manual pre-publication checks

- The application's About panel contains a developer contact email. Confirm that you want this address to be public before publishing the repository.
- Confirm that you own or have permission to redistribute the icon/image assets in `build/`.
- Consider Windows code signing for public binary releases.
