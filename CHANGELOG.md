# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog principles, and the project uses
Semantic Versioning for release tags.

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
