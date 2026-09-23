# Release validation — 2.5.0

## Local verification

- 112 Node tests passed: domain model, validation/migration, staffing/budgets/capacity, decision workflow, permissions, REST/MCP, native documents, updater state, journal recovery, consistent live backup/restore, scoped tokens and OIDC.
- 32 real-navigation browser regressions (28 carried over plus File menu/status chip, sidebar badges and persistence, Start page and shortcuts, file drop). Chromium passed all 32 locally for 2.5.0. Firefox and WebKit could not be downloaded in the validation environment (network policy), so for this candidate their results come only from the CI matrix on the release commit; the drop test skips on engines that cannot synthesize file drags.
- Browser coverage includes editing, scenario comparison/apply, people and assignments, imports, undo/redo, recovery, canceled/invalid opens, save failures, account isolation, concurrent tabs, shared-server conflicts, mobile dialogs, keyboard focus, large-chart rendering and actual PNG/PDF/CSV/HTML exports.
- Exported interactive HTML was opened offline with expansion/search/zoom, hostile text and excluded-field checks. Tests inspect exported bytes, not just the export button.
- The Electron lifecycle regression (native open/save bridge, recent files, external modification refusal, restart, moved portable location, planning/branding recovery, updater status) was not re-run locally for 2.5.0 because the Electron binary download is blocked there; it runs on Windows, macOS and Linux in the desktop workflow before artifacts are built. This candidate changes no desktop main-process code.
- The shipped 2.5.0-rc.1 Linux AppImage (identical application code to 2.5.0) was downloaded from the GitHub Release and driven under a virtual display: it loads from `orgflow://app`, shows the Start page on a fresh profile, exposes the File menu, status chip, shortcuts and filter controls without page errors, and after a full restart on the same profile restores an edited position and company name without offering a first-run sample. The in-app update check reached the network layer; the validation environment's intercepting proxy prevented it from reaching GitHub.
- **Real N → N+1 update drill (Linux, shipped binaries), 2026-09-23.** The published 2.5.0-rc.1 AppImage was installed with a profile holding an edited chart. Its update feed was pointed at a local server hosting the unmodified published v2.5.0 `latest-linux.yml` and AppImage; the GitHub feed itself is blocked by the validation environment's proxy, and no application code was changed. Through the UI: Check found 2.5.0 → Download completed and passed electron-updater's SHA-512 check → Save and restart replaced the installed AppImage, which then matched the v2.5.0 release byte-for-byte. Relaunched, the app reported 2.5.0, kept the edited position and company name, showed no first-run page, had created the *Before application update* recovery checkpoint, accepted new edits, and raised no page errors. The automatic relaunch itself was not observed because the environment runs as root, where Chromium requires `--no-sandbox`. Windows and macOS update drills were not run; macOS builds are unsigned and cannot self-update.
- Syntax/wiring checks and ESLint passed. Dependency audit after upgrading Electron reported zero vulnerabilities.
- The v2.1.0 fixture comes from `git show v2.1.0:examples/harbor-and-co/workspace.json`; migration is tested against that released data, not only generated fixtures.

## Reproduce

```bash
npm ci
npm run check
npm run lint
npm test
npm audit --audit-level=high
python3 -m pip install playwright==1.57.0
python3 -m playwright install --with-deps
python3 tests/browser-regressions.py --browser chromium
python3 tests/browser-regressions.py --browser firefox
python3 tests/browser-regressions.py --browser webkit
npm run test:desktop # Linux: xvfb-run -a npm run test:desktop
```

Browser results/screenshots/downloads are saved under `test-results`; CI uploads these even on failures. Desktop test profiles are temporary and never use a production profile.

## Limits and publication gates

CI reruns the suites on Linux and native lifecycle/build jobs on Windows, macOS and Linux. A passing local suite does not imply those remote jobs passed; use the release's linked Actions run as evidence. Release artifacts include Windows portable and NSIS installer, universal macOS ZIP, Linux AppImage and channel metadata/blockmaps.

2.5.0 ships unsigned by the owner's decision. Signing/notarization checks on clean machines apply once certificates are configured. Real provider configuration, backup scheduling, representative load and production operations require deployment-specific validation. The HTTP MCP subset is not certified for arbitrary remote clients.
