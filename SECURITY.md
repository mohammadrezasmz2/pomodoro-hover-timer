# Security Policy

## Supported versions

Security fixes are normally applied to the latest released version of Pomodoro
Timing. Older builds may not receive fixes.

## Reporting a vulnerability

Please do **not** open a public issue for an undisclosed security vulnerability.
Use GitHub's private vulnerability reporting / Security Advisory feature for
this repository when available. If that feature is not enabled, contact the
repository maintainer privately through their GitHub profile.

Include:

- affected version
- operating system and architecture
- reproduction steps or proof of concept
- expected impact
- any suggested mitigation

Do not include unrelated personal data or secrets in the report.

## Security notes for maintainers

- The app intentionally uses Electron context isolation and disables renderer Node integration.
- Release binaries should be built from the tagged source using the repository workflow.
- Keep Electron and GitHub Actions updated after compatibility testing.
- Consider code signing Windows releases before broad distribution.
