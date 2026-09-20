# Release validation — 2.4.0-rc.2

## Local verification

- 112 Node tests passed: domain model, validation/migration, staffing/budgets/capacity, decision workflow, permissions, REST/MCP, native documents, updater state, journal recovery, consistent live backup/restore, scoped tokens and OIDC.
- 28 real-navigation browser regressions are included. Chromium passed all 28 locally; WebKit passed 27 with one capability-based writable-file skip. Firefox passed the preceding 27-test suite with the same skip, and the final CI matrix runs all 28 tests on every engine. Firefox/WebKit use downloaded backups when user-picked writable handles are unavailable.
- Browser coverage includes editing, scenario comparison/apply, people and assignments, imports, undo/redo, recovery, canceled/invalid opens, save failures, account isolation, concurrent tabs, shared-server conflicts, mobile dialogs, keyboard focus, large-chart rendering and actual PNG/PDF/CSV/HTML exports.
- Exported interactive HTML was opened offline with expansion/search/zoom, hostile text and excluded-field checks. Tests inspect exported bytes, not just the export button.
- Real Electron lifecycle regression passed: native open/save bridge, recent files, external modification refusal, full restart, moved portable location, complete planning/branding recovery and development updater status. Dialog return values are automated; operating-system permission prompts are not certified by this test.
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

This candidate is unsigned. A mocked updater proves state handling, not a real signed update. Clean-machine platform signing/notarization checks and signed N → N+1 upgrade testing remain required before promoting a stable release. Real provider configuration, backup scheduling, representative load and production operations require deployment-specific validation. The HTTP MCP subset is not certified for arbitrary remote clients.
