# Release validation — 2.7.0

## Local verification

- 155 Node tests passed, 23 of them new for this release: workplace rules (calendar arithmetic across daylight-saving changes, office time zones, plan precedence, desk states), the workplace API against the acceptance criteria (recurring remote days, day overrides, missing plans, pending versus approved vacation, reservations that never touch seating, simultaneous bookings, an owner's return raising a conflict, permissions, scenario isolation, migration and backup of an older database, retention), routing when reporting lines are wrong (no approver, "Not my report", pinned and remembered routing, reports, stale corrections), and Teams (Entra ID token validation including the Teams client restriction, header session precedence, Bot Framework activity authentication, install-time linking, delivery retry without duplicates, frame headers and the app package).
- 38 real-navigation browser regressions passed in Chromium locally. Firefox and WebKit cannot be downloaded in the validation environment (network policy); their results come from the CI matrix. One planner test (`test_12`) had started failing in Firefox and WebKit in October because it relied on the current month; it was reproduced in Chromium with a text month field and fixed.
- `npm run test:workplace` drove the workplace screens in Chromium against a seeded host: My week with a seating conflict, booking a borrowed desk, approvals, "Not my report" and the routing queue, reporting a wrong desk, workplace administration, the phone layout, the planner's availability overlay, the scheduling-only redirect, and the Teams tab signed in through single sign-on only (no cookies) approving a deep-linked request. Screenshots are in `docs/workplace/`.
- The Teams package built by `npm run teams:package` was verified with Python's `zipfile` (valid archive, manifest and both icons).
- Syntax/wiring checks, ESLint and `npm audit --audit-level=high` passed.
- Not verified: a real Microsoft 365 tenant. Teams sign-in and the bot were exercised with locally signed tokens and a stand-in SDK; a pilot installation should confirm Teams desktop and web before broad rollout. The Electron lifecycle regression cannot run locally (Electron download blocked); it runs in the desktop workflow. 2.7.0 changes no desktop main-process code. No update drill has been run for 2.7.0; Windows and macOS drills have never been run, and unsigned macOS builds cannot self-update.

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
npm run test:workplace
npm run test:desktop # Linux: xvfb-run -a npm run test:desktop
```

Browser results/screenshots/downloads are saved under `test-results`; CI uploads these even on failures. Desktop test profiles are temporary and never use a production profile.

## Limits and publication gates

CI reruns the suites on Linux and native lifecycle/build jobs on Windows, macOS and Linux. A passing local suite does not imply those remote jobs passed; use the release's linked Actions run as evidence. Release artifacts include Windows portable and NSIS installer, universal macOS ZIP, Linux AppImage and channel metadata/blockmaps.

2.7.0 ships unsigned by the owner's decision. Signing/notarization checks on clean machines apply once certificates are configured. Real identity-provider and Teams tenant configuration, backup scheduling, representative load and production operations require deployment-specific validation. The HTTP MCP subset is not certified for arbitrary remote clients.
