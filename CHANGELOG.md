# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog principles, and the project uses
Semantic Versioning for release tags.

## [1.7.4] - 2026-09-28

### Added

- Import the author-supplied 1.7.3 update: three named note tabs, per-tab text backups, bounded note scrolling, daily repeating reminders, improved Jalali reminder dates and horizontal window positioning.
- Add a Persian/English Settings switch for top-center hover. It is off for both fresh installs and upgrades unless explicitly enabled; tray, Start-menu and shortcut access remain available.

### Fixed

- Retain atomic saves, backup recovery, immediate note/title persistence, deadline-based timers, sandboxed IPC and stale-hide protection from the published version.
- Clamp horizontal movement to the active monitor and restore the selected position after restart.
- Save per-tab exports atomically and avoid replacing unrelated files that share a note title.
- Update the Windows installer help and user guide to describe manual opening.

## [1.6.7] - 2026-09-22

### Changed

- Publish the supplied 1.6.7 interface updates, including the intermediate 1.6.5/1.6.6 fixes.
- Keep note history fixed to the viewport, with its header visible and a scrollable list.
- Request a note-history window height that fits the current monitor.
- Correct Persian text direction in settings, daily statistics and the weekly empty state.
- Align the embedded Pomodoro empty message with the top of the other daily columns.
- Remove the redundant hide button; closing to the tray remains available.
- Synchronize the About panel, package metadata and download links to 1.6.7.

The persistence, hover, timer, security and packaging fixes released in 1.6.4 are retained.

## [1.6.4] - 2026-09-19

### Fixed

- Flush the renderer's current edits before quitting or restarting; save notes and titles on input.
- Store JSON through a flushed temporary file and keep a valid backup for recovery.
- Restore the newer local/disk snapshot using revision metadata.
- Restore top-center hover access on all monitors and ignore stale hide acknowledgements.
- Use countdown deadlines so delayed callbacks and Windows sleep do not slow the timer.
- Fit the panel inside each work area, with scrolling layouts for narrow displays.
- Replace forced task termination and fragile quoted launcher paths with graceful commands.

### Security and development

- Upgrade Electron to 44.4.3 and use package.json as the runtime version source for packaging.
- Add a dependency lockfile and verify the official runtime checksum before extraction.
- Restrict IPC to the main panel; validate payloads and hide IPC events from renderer callbacks.
- Add CSP, deny new windows/unexpected navigation and deny unnecessary permissions.
- Add behavior tests and a real Electron Windows smoke test for loading, IPC, layout, quit and restore.

## [1.6.3] - 2026-09-18

### Open-source packaging

- Prepared the existing 1.6.3 application source for public GitHub hosting.
- Added MIT licensing and third-party attribution.
- Added Windows portable build automation and GitHub release workflow.
- Added CI, CodeQL, Dependabot, contribution, security, support, issue, and PR files.
- Excluded the bundled Electron runtime from source control; releases are built from the official Electron runtime instead.

### Application

- Application behavior and UI source are preserved from the supplied 1.6.3 build.
