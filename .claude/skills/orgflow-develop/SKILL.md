---
name: orgflow-develop
description: Work on the OrgFlow codebase itself - where things live, which checks to run before pushing, how to test the workplace screens, the CLI and the Teams tab, and how a release is cut. Use when changing, testing or releasing code in this repository.
---

# Developing OrgFlow

Read `AGENTS.md` at the repository root first; it holds the layout and conventions. This skill is the working checklist.

## Before you push

Run these, in this order, and fix everything they report:

```bash
npm run check        # syntax of every script, HTML ids, script references, no inline handlers (CSP)
npm run lint         # ESLint 9 flat config: eslint.config.cjs
npm test             # node --test tests/*.test.cjs: core rules, API, ACL, workplace, Teams, CLI, desktop store
```

When the change touches the browser UI, also run the real-browser suites (Chromium is enough locally; CI runs Firefox and WebKit too):

```bash
python3 tests/browser-regressions.py --browser chromium [--executable /path/to/chromium]
CHROMIUM_PATH=/path/to/chromium npm run test:workplace [-- docs/workplace]   # workplace screens and the Teams tab; a directory argument refreshes the screenshots
```

`npm run test:desktop` needs Electron's downloaded binary and a display (`xvfb-run -a` on Linux); CI runs it on Windows, macOS and Linux.

## Where to change things

- Pure rules shared by browser, server and CLI: `js/*-core.js` (no DOM, no I/O). Test them in `tests/*-core.test.cjs`.
- Workplace planning: rules in `js/workplace-core.js`, store and commands in `server/lib/workplace*.js`, routes in `server/lib/workplace-routes.js`, screens in `js/workplace-ui.js` + `workplace.html` + `css/workplace.css`. Every rule is enforced on the server; the UI only explains it.
- Organization chart API, tokens, members, scopes: `server/lib/app.js`, `server/lib/db.js`, OpenAPI in `server/lib/openapi.js` (keep it in step with request bodies).
- Teams: `server/lib/teams.js`, `server/lib/jwt.js`, `teams/`, `scripts/teams-package.cjs`.
- CLI: `bin/orgflow.cjs` (dependency-free; only `js/workplace-core.js` and `package.json` at run time). Tests: `tests/cli.test.cjs`.
- Agent skills: `.claude/skills/<name>/SKILL.md` and an identical copy in `.agents/skills/<name>/SKILL.md`. `tests/skills.test.cjs` fails if the copies differ. Edit both, or edit one and copy it over.

## Conventions

- Node 22.16+ (`node:sqlite`), CommonJS, no build step and no new runtime dependencies without a strong reason.
- New workplace tables live beside the workspace document; the document format stays at version 3 unless a release says otherwise.
- Pages served in Teams must not use `confirm`/`prompt`/`alert`; use the in-page dialog. No inline event handlers (CSP).
- Database writes that must stay consistent go through the `tx()` helper; one booking per desk and per person per day is enforced by unique indexes, not by the UI.
- Full days only: do not introduce times of day without a product decision.
- Tests use the in-memory host (`createApp({ memory: true, env: { AUTH_MODE: 'dev' } })`) and fixed dates; never depend on the real clock.

## Releasing

Follow `RELEASE_OPERATIONS.md`:

1. On a branch: `npm version X.Y.Z --no-git-tag-version`, add a `## X.Y.Z` section at the top of `CHANGELOG.md` (it becomes the release notes), and update the versioned download links in `README.md` and `index.html` (search for the previous version).
2. Open a pull request; merge it once CI (checks, lint, unit tests, three browsers, desktop builds) is green.
3. Merging to `main` makes the **Desktop binaries** workflow build Windows, macOS and Linux, tag `vX.Y.Z` and publish the GitHub Release; **GitHub Pages** redeploys the web app. Check both runs finish.

Never push to `main` directly, never skip or disable a failing test, and never commit tokens, `.env` files or real employee data.
