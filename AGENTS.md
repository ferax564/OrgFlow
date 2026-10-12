# OrgFlow — guide for coding agents

OrgFlow is an organization-chart and workforce-planning app. It runs entirely in the browser (GitHub Pages), as an Electron desktop app, and on an optional shared Node host that adds members, an API, MCP tools, workplace planning (work locations, vacation approval, desk sharing) and a Microsoft Teams app.

## Layout

| Path | What |
| --- | --- |
| `index.html`, `app.html`, `js/app.js`, `js/*-ui.js`, `css/` | The planner and landing page (no build step) |
| `js/*-core.js` | Pure rules shared by browser, server and CLI |
| `workplace.html`, `js/workplace-ui.js` | Workplace screens, also the Teams tab |
| `admin.html`, `login.html` | Shared host administration and sign-in |
| `server/` | Shared host: `server/index.js`, `server/lib/*` (API, auth, SQLite store, workplace, Teams), `server/mcp-stdio.js` |
| `bin/orgflow.cjs` | `orgflow` command line for people and coding agents |
| `desktop/` | Electron main process, document store, updates |
| `teams/` | Teams app package sources and sign-in pages |
| `tests/` | `node --test` suites and `browser-regressions.py` |
| `scripts/` | Checks, end-to-end runs, packaging, release verification |
| `.claude/skills/`, `.agents/skills/` | Agent skills (identical copies for Claude Code and Codex) |

Product documentation: `README.md`, `WORKPLACE.md`, `TEAMS.md`, `MANAGEMENT.md`, `server/README.md`, `RELEASE_OPERATIONS.md`.

## Commands

```bash
npm ci                      # install (Node 22.16+)
npm run check               # syntax, HTML ids, script references, CSP
npm run lint                # ESLint
npm test                    # all node --test suites
npm run start:enterprise    # shared host on http://127.0.0.1:8787 (dev sign-in: any email, first is admin)
npm run test:workplace      # browser run of the workplace screens and Teams tab (CHROMIUM_PATH=…)
python3 tests/browser-regressions.py --browser chromium
npm run cli -- --help       # the orgflow CLI from this checkout
```

Run `check`, `lint` and `test` before every push.

## Conventions

- CommonJS, no bundler, no new runtime dependencies without a strong reason. Match the surrounding style.
- The server enforces every permission and rule; UI and CLI only explain them.
- Scheduling-only `employee` members never receive organization-chart data. API tokens carry scopes: `read`, `export`, `propose`, `workplace`.
- Workplace features are full days only.
- Tests run against the in-memory host with fixed dates.
- Do not commit secrets, tokens or real employee data. Do not push to `main`; open a pull request.

## Skills

| Skill | Use it for |
| --- | --- |
| `orgflow-workplace` | Plan work locations, vacation, desk bookings and approvals with the `orgflow` CLI |
| `orgflow-org` | Read the organization chart and draft proposals (never approve or apply) |
| `orgflow-develop` | Change, test and release this repository |

`orgflow skills install` copies the first two into your home directory so they work in every project.
