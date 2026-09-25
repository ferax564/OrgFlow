# Release validation — 2.6.0

## Local verification

- 131 Node tests passed: domain model, validation/migration, staffing/budgets/capacity, decision workflow, permissions, REST/MCP, native documents, updater state, journal recovery, consistent live backup/restore, scoped tokens and OIDC, plus 19 seating tests (room outlines including crossing and touching walls, rotated-desk overlap, desk blocks, 45° wall snapping, shape presets and resizing, assignment and auto-seat, floor-plan validation and calibration, undo image packing, history stripping, subtree redaction and conflict merge).
- 38 real-navigation browser regressions (32 carried over plus six seating tests: drawing walls and rectangle rooms; desk blocks, move, rotate, duplicate and delete; assignment across scenarios with CSV/PNG export and reload; touch panning; floor-plan import, scaling, move, opacity, undo, drop onto an existing room and restore of an earlier version; non-rectangular rooms). Chromium passed all 38 locally. Firefox and WebKit could not be downloaded in the validation environment (network policy); their results come from the CI matrix, where all three engines passed on the final PR commit (bd43e73). The merge commit has the same tree.
- Browser coverage includes editing, scenario comparison/apply, people and assignments, imports, undo/redo, recovery, canceled/invalid opens, save failures, account isolation, concurrent tabs, shared-server conflicts, mobile dialogs, keyboard focus, large-chart rendering and actual PNG/PDF/CSV/HTML exports.
- Exported interactive HTML was opened offline with expansion/search/zoom, hostile text and excluded-field checks. Tests inspect exported bytes, not just the export button.
- The Electron lifecycle regression (native open/save bridge, recent files, external modification refusal, restart, moved portable location, planning/branding recovery, updater status) could not run locally because the Electron binary download is blocked there. It passed on Windows, macOS and Linux in the desktop workflow on the final PR commit. 2.6.0 changes no desktop main-process code; the seating feature is browser code packaged with the app.
- Carried over from 2.5.0, not repeated for 2.6.0: the shipped 2.5.0-rc.1 Linux AppImage was driven under a virtual display (Start page, File menu, restart with an edited chart), and a real N → N+1 update drill on Linux took the published 2.5.0-rc.1 AppImage to the published v2.5.0 through the in-app updater, preserving the edited chart and creating the *Before application update* checkpoint. No 2.6.0 update drill has been run; Windows and macOS drills have never been run, and unsigned macOS builds cannot self-update.
- Syntax/wiring checks and ESLint passed. The CI dependency audit passed.
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

2.6.0 ships unsigned by the owner's decision. Signing/notarization checks on clean machines apply once certificates are configured. Real provider configuration, backup scheduling, representative load and production operations require deployment-specific validation. The HTTP MCP subset is not certified for arbitrary remote clients.
