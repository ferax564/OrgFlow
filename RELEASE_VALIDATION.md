# Release validation — 2.8.0

## Local verification

- 164 Node tests passed, 9 of them new for this release: the `orgflow` CLI against an in-memory host (planning, weekly pattern, desk availability, booking and its conflicts, cancellation, vacation request and manager approval, team calendar, notifications, token scope separation between the organization chart and workplace, login with an owner-only config file, refusal of plain http, exit codes, skills installation and the MCP bridge) and the agent skills (identical Claude Code and Codex copies, portable frontmatter, every command they show exists, `AGENTS.md`/`CLAUDE.md`).
- `npm run test:workplace` passed in Chromium, now including a scheduling-only member creating a workplace token under **CLI & agents**, using it with the CLI and revoking it (the revoked token is refused). The 2.7.0 runs are unchanged; `docs/workplace/agents.png` is new.
- 38 real-navigation browser regressions passed in Chromium. Firefox and WebKit come from the CI matrix.
- Syntax/wiring checks, ESLint and `npm audit --audit-level=high` passed.
- Desktop: the lifecycle test's dialog handler no longer throws when a dialog closes during shutdown, the cause of the intermittent Windows failure on `main` after 2.7.0. The Electron download is blocked in the validation environment, so the fix is confirmed by the desktop workflow on Windows, macOS and Linux, not locally. 2.8.0 changes no desktop main-process code.
- Not verified: a real Microsoft 365 tenant (unchanged from 2.7.0); Claude Code and Codex loading the skills on a user's machine (the files follow both tools' `SKILL.md` format and are checked for structure only). No update drill has been run for 2.8.0.

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
node --test tests/cli.test.cjs tests/skills.test.cjs
npm run test:desktop # Linux: xvfb-run -a npm run test:desktop
```

Browser results/screenshots/downloads are saved under `test-results`; CI uploads these even on failures. Desktop test profiles are temporary and never use a production profile.

## Limits and publication gates

CI reruns the suites on Linux and native lifecycle/build jobs on Windows, macOS and Linux. A passing local suite does not imply those remote jobs passed; use the release's linked Actions run as evidence. Release artifacts include Windows portable and NSIS installer, universal macOS ZIP, Linux AppImage and channel metadata/blockmaps.

2.8.0 ships unsigned by the owner's decision. Signing/notarization checks on clean machines apply once certificates are configured. Real identity-provider and Teams tenant configuration, backup scheduling, representative load and production operations require deployment-specific validation. The HTTP MCP subset is not certified for arbitrary remote clients.
