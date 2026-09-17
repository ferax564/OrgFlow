# OrgFlow

Private organization charts and workforce planning in the browser. Positions stay separate from people. Scenarios copy Current instead of overwriting it. Names, photos and logos stay on the device that opened the page until you export a file.

**Public site:** [ferax564.github.io/OrgFlow](https://ferax564.github.io/OrgFlow/) · **Planner:** [app.html](https://ferax564.github.io/OrgFlow/app.html)

![Harbor & Co organization chart](examples/harbor-and-co/chart.png)

## Open it

The repository root is a static site:

| Path | What it is |
| --- | --- |
| `index.html` | Product landing page (public docs + two ways to run) |
| `app.html` | The planner |
| `login.html` / `admin.html` | Enterprise sign-in and members (not on GitHub Pages) |
| `css/`, `js/`, `assets/`, `examples/` | Styles, logic, icons and samples |

Serve the root over HTTP (GitHub Pages does this in production):

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173/ or http://localhost:4173/app.html. Opening the files as `file://` may block image processing and some exports.

### Desktop app (no installer)

CI builds a portable binary for each OS. Download **v2.1.1** below, or browse [all GitHub Releases](https://github.com/ferax564/OrgFlow/releases) (or the **Desktop binaries** workflow artifacts). You do not install into Program Files or `/Applications`.

| OS | File | How to run |
| --- | --- | --- |
| Windows | [OrgFlow-2.1.1-windows.exe](https://github.com/ferax564/OrgFlow/releases/download/v2.1.1/OrgFlow-2.1.1-windows.exe) | Double-click the `.exe`. Windows may show SmartScreen on an unsigned build — More info → Run anyway. Workspace data is stored in `OrgFlow-data` next to the exe. |
| macOS | [OrgFlow-2.1.1-mac.zip](https://github.com/ferax564/OrgFlow/releases/download/v2.1.1/OrgFlow-2.1.1-mac.zip) | Unzip and double-click `OrgFlow.app`. You can leave it in Downloads; you do not need to drag it to Applications. If Gatekeeper blocks it, right-click → Open. |
| Linux | [OrgFlow-2.1.1-linux.AppImage](https://github.com/ferax564/OrgFlow/releases/download/v2.1.1/OrgFlow-2.1.1-linux.AppImage) | `chmod +x OrgFlow-*-linux.AppImage && ./OrgFlow-*-linux.AppImage` |

```bash
npm ci
npm run desktop          # run from this repo
npm run dist:linux       # AppImage (Linux host)
npm run dist:win         # portable exe (Windows host)
npm run dist:mac         # .app zip (macOS host)
```

Tagged versions (`v2.1.1`) publish those three files onto the GitHub Release.

The desktop app loads the planner from a fixed `orgflow://` origin, so restarts and updates always find the same browser storage. Every commit is additionally journaled by the app itself into `OrgFlow-data` next to the executable **and** the OS-standard app-data folder — moving the exe to a new folder still finds the workspace, and each directory keeps the ten most recent backups of the file.

On this public site there is no backend. The workspace is kept in two places — `localStorage` plus an IndexedDB copy with checkpoints — so losing one storage area does not lose the organization. Clearing *all* site data still removes everything; export a JSON backup first. An optional Node host can share one org — see [Enterprise host](#enterprise-host-optional).

## Using the planner

Harbor & Co (17 positions) loads on first visit. A tour offers that sample, Northstar Commerce, and smaller templates. Loading a sample overwrites this browser’s scenarios, people and branding.

- **Drag-and-drop** a card onto another manager to change reporting. Drop onto a **sibling** to reorder (left/top = before, right/bottom = after). If that side would leave the order unchanged, the two cards swap. Drops that would create a cycle are ignored. Set a **dotted-line** (matrix) manager in the position drawer; it draws dashed and does not change the tree layout.
- **Undo / redo** with ⌘Z / Ctrl+Z in this session (not while typing in a field). **Recovery & backups** in the sidebar shows the workspace identity, revision and where it is stored; keeps the last ten planning snapshots as Earlier versions; and stores full checkpoints — with photos and branding — before every restore, import or sample load. Checkpoints can be restored in place or **as a copy** (a new workspace id) so recovery never overwrites current work. Edits that never reached a shared server are listed there as recoverable changes.
- **Cards** show the person (or vacant/recruiting), title, group, location, type, approval, hiring state and FTE. Optional photos are resized locally to a small PNG. **Direct reports and vacancies** (`N reports · N open`) is on by default; turn it off under Chart display. Heads and Team Leaders can also show a cumulative people count.
- **Custom fields** on a position: location / site, cost center, job family. On a person: employee number and photo.
- **Date filter** is off by default, so future-dated roles stay visible and the date box shows "All dates". Turn on **Only show positions active on this date** to hide roles that have not started (or have already ended) relative to the as-of date; the toolbar pill then reads "As of …" instead of "All dates".
- **Chart filters** (type, hiring, approval, group, site, depth, search) apply to the org chart and the Positions register. Click a selected **Group / team** or **Location / site** chip to hide that set. Positions with a blank group or site sit under No group / No site. Whenever filters or a search limit the view, a pinned bar above the workspace shows what is active and offers **Clear all filters & search**. Compare uses full snapshots and ignores those filters. Loading an example or a blank organization resets filters.
- **Search** highlights matching cards and the **path to the top**. Hovering a card does the same.
- **Multi-select** with ⌘/Ctrl-click or Shift-click (or the checkboxes on Positions). Open the bulk-edit sheet, choose Keep / Set / Clear per field, review the changes, then apply atomically. Keep is the default; Vacant/Recruiting explicitly unassigns a snapshot seat.
- **Position editor** opens from a card or the register's Edit. `Escape` or **Close** leaves it, `⌘/Ctrl+Enter` saves, and Tab cycles inside the drawer. Unsaved edits ask before they are discarded when you switch cards, views or scenarios.
- **People directory** in the sidebar lists everyone in the active scenario with their seat, and adds, edits or removes person records (name, employee number, photo). Seat assignment stays in the position editor.
- **Scenarios** can be renamed and deleted from **Scenario details**; archiving one drops it from the switcher and compare lists while keeping its data and frozen snapshot, and it restores from the same dialog.
- **Named views** in the sidebar store filter, zoom and card-display presets on the workspace (up to 20). They travel with the JSON backup.
- **Chart display** in the sidebar hides or shows FTE, site, group, position type, approval, hiring, span and cumulative people on every card. Long names wrap and that card grows. Last-level managers stack their reports in a column under the manager; uncheck **Stack direct reports** in the drawer to spread them. **Move up / Move down** changes sibling order immediately. Add a tag like Engineer, Graduate or Intern under **Position type**. These settings persist and apply to PNG, PDF and HTML exports.
- **Narrow screens** hide the sidebar. Open it with the ☷ **Filters** control in the planning bar — a badge counts active filters — and close it with `Escape`. The chart pans with touch or by dragging empty space with the mouse.
- **Branding** stores company name, chart title and logos in this browser. Logos are sanitized and rasterized locally.

### Export

| Export | Contents |
| --- | --- |
| Current view as PNG | Visible chart, optionally branded |
| One PNG per group (ZIP) | One chart file per group |
| Board pack (PDF) | Cover sheet, current chart, scenario comparison when a second scenario exists |
| Interactive HTML | Self-contained read-only viewer — opens offline with pan, zoom, fit, expand/collapse, depth presets, search, group/site/type filters and position details. A share dialog picks the scope (whole org or one team's subtree), which fields to include, and the initial depth; excluded data is not embedded. Shows a static chart when scripts are blocked |
| Chart-only HTML | Self-contained visible chart without workspace JSON or hidden scenarios; not a restorable backup |
| Shareable HTML snapshot | Self-contained page with the chart inline and workspace JSON for restore |
| Positions + assignments (CSV) | Active scenario, including custom fields |
| People directory (CSV) | People in the active scenario |
| Workspace backup (JSON) | Every scenario, unassigned people, branding, palette, saved views and the current view |
| Save workspace | Overwrites the last JSON file you picked when the browser supports it; the **Autosave** checkbox beside it writes every change through to that file. The file link survives restarts — if the browser needs permission again, **Reconnect saved file** appears instead of silently going stale |
| Print / A3 pages (PDF) | Tiled A3 landscape pages of the visible chart |

A workspace JSON that omits `dateFilter` restores with all dates visible. Full JSON restore is local-only on the planner; use Draft imports or the proposal API for a shared organization.

Every workspace carries a schema version, identity, revision and commit timestamp. Older builds open newer files only when the schema is unchanged — a file written by a **newer schema** is refused with an explicit message rather than silently dropping fields it does not understand, and unknown fields on supported documents are preserved through load/save round-trips. When several stored copies disagree (browser storage, app storage, desktop journal), the newest revision wins and the others catch up on the next save.

### Positions CSV columns

`positionId`, `reportsToPositionId`, `secondaryManagerId`, `title`, `type`, `group`, `fte`, `approval`, `hiringState`, `personId`, `name`, `employeeNumber`, `startDate`, `endDate`, `location`, `costCenter`, `jobFamily`, `sortOrder`, `stacked`

Import can replace, append, or update by position ID, and defaults to a new Draft proposal. The review step validates every row, previews the result and maps each source column to an OrgFlow field — unrecognized headers can be remapped or ignored before applying. Spreadsheet formulas in cells are prefixed so they stay text.

## Features

- Expandable org chart with level presets and search; hover or search highlights the path to the top
- Drag onto a sibling to reorder; drag onto another card to re-parent; cycle detection
- Last-level managers stack reports by default; optional left-side trunk layout
- Move siblings up or down; reporting order and stacking persist
- Optional wrapping cards with hide/show for FTE, site, group, type, approval, hiring, span and cumulative people
- Group and site filter chips, including No group / No site
- Multi-select bulk edit for type, group, site and approval
- Direct-report and vacancy counts on cards
- Named views stored in the workspace backup
- Print / A3 tiled PDF export; Save workspace overwrites the last JSON file when the browser allows it
- Custom position tags (same kind as Engineer, Graduate, Intern) in addition to the built-in types
- Optional local photos and richer cards (location on the card)
- Dotted-line / matrix managers
- Undo, redo and earlier local versions
- Position types: Head, Team Leader, Engineer, Specialist, Graduate, Intern (plus levels you add)
- Approval and hiring-state filters, including vacant and recruiting seats
- Positions kept separate from people; FTE is position capacity, not salary
- Scenario planning and before/after comparison
- Company branding, light/dark modes, palettes (Indigo, Crimson, Graphite, Ocean, Emerald)
- First-run tour and starter templates (startup, agency, nonprofit)
- Portable desktop app (Windows exe, macOS .app, Linux AppImage) with no installer

## Example companies and templates

Fictional product and retail samples — not motorsport teams. Load them from **Example companies** in the sidebar, from the welcome tour, or by restoring JSON from `examples/`.

### Harbor & Co

Product organization across Leadership, Product, Engineering, Design and Customer Success. Includes an **FY27 growth** scenario.

| Org chart | Position register | Scenario compare |
| --- | --- | --- |
| <img alt="Harbor & Co org chart" src="examples/harbor-and-co/chart.png" /> | <img alt="Harbor & Co positions" src="examples/harbor-and-co/positions.png" /> | <img alt="Harbor & Co comparison" src="examples/harbor-and-co/compare.png" /> |

### Northstar Commerce

Retail operations across Stores, Merchandising, E-commerce and People. Includes a **Peak season** scenario.

| Org chart | Position register | Scenario compare |
| --- | --- | --- |
| <img alt="Northstar Commerce org chart" src="examples/northstar-commerce/chart.png" /> | <img alt="Northstar Commerce positions" src="examples/northstar-commerce/positions.png" /> | <img alt="Northstar Commerce comparison" src="examples/northstar-commerce/compare.png" /> |

### Starter templates

Smaller orgs shipped in `js/templates.js`, also listed in the sidebar and the first-run tour:

| Template | Shape |
| --- | --- |
| **First Light** | Startup · 8 seats · dotted line from Product Manager to Head of Engineering |
| **Lumen Studio** | Agency · 9 seats · producer dotted to Creative Director |
| **Cedar & Kind** | Nonprofit · 7 seats · partnerships dotted to the Executive Director |

More detail: [`examples/README.md`](examples/README.md).

## GitHub Pages

Pushing to `main` runs `.github/workflows/pages.yml`. That job copies `index.html`, `app.html`, CSS, JS, assets, examples and `.nojekyll` into a `gh-pages` branch. Asset paths are relative so the site works at `https://ferax564.github.io/OrgFlow/` once Pages is serving that branch.

The Actions `GITHUB_TOKEN` cannot turn Pages on (the Pages create API is an admin operation). One-time, in the GitHub UI:

1. **Settings → Pages**
2. **Build and deployment → Source:** Deploy from a branch
3. **Branch:** `gh-pages` / `/ (root)` → Save

That one-time save is already done for this repo. The public site is [ferax564.github.io/OrgFlow](https://ferax564.github.io/OrgFlow/). `login.html` and `admin.html` are not copied onto Pages; they belong to the optional Node host.

## Enterprise host (optional)

The GitHub Pages site stays private and local. For a **shared** organization on your machine or AWS, run the Node host. **Keycloak is not required locally.** The landing page (`index.html`) documents both modes; when that host is running it rewrites Open-app links to `login.html`.

```bash
npm run start:enterprise
```

Open http://127.0.0.1:8787/login.html — any email, first person is admin. The process binds to localhost.

That host also provides:

- Workspace API (save/load the existing `orgflow.workspace` JSON; one org per tenant)
- Optional Keycloak OIDC in production (`AUTH_MODE=oidc`) with an **httpOnly** session cookie
- Members: **admin / editor / viewer**, plus a separate **export** permission
- Optional **subtree scope** (a position id): the API never sends seats outside that branch
- Audit log of load, save and export
- MCP read tools for Cursor / Claude, including workforce forecasts (`npm run mcp` with a member token); a separately enabled proposal-only tool never approves or applies changes

Details, hardening notes, Docker Keycloak, AWS: [`server/README.md`](server/README.md).

## Management and data-integrity release (2.1)

The Planning tab adds scenario decisions, conflict-aware application and rollback proposals, dated staffing/reporting, declared capabilities, project allocation, commitments and monthly position-budget forecasts. Saving is revision-aware; sharing a chart no longer embeds a workspace backup. CSV source mappings create Draft proposals by default.

See **[MANAGEMENT.md](MANAGEMENT.md)** for workflows, authorization, migration, forecast assumptions, API examples and limitations. The shared host requires Node 22.16 or later. Scheduled scenarios require explicit application; local approval records are not authenticated approvals.

## Tests

```bash
npm run check
npm run lint
npm test
python3 -m pip install playwright==1.57.0
python3 -m playwright install chromium firefox webkit
python3 tests/browser-regressions.py --browser chromium
```

The suite covers CSV parsing, spreadsheet-formula escaping, scenario validation, dotted-line rules, custom-field CSV round-trips, starter templates, comparison diffs, example workspaces, filter-set migration, stacked chart layout, sibling reordering, custom position levels, group/site chips, bulk edit, named views, A3 tiling, schema-version guards and forward-compatible field preservation, share-dataset redaction and subtree scoping, the journaled desktop workspace store (atomic writes, rotating backups, newest-revision selection), the desktop file server, and enterprise ACL/stress cases (forged cookies, path traversal, oversized bodies, last-admin protection, concurrent saves).

With Chrome and `puppeteer-core` installed locally:

```bash
python3 -m http.server 4173   # in one terminal
node scripts/browser-qa.cjs   # full UI pass against that server
node scripts/smoke.cjs        # landing page plus planner; starts its own server on 4174
```

## Privacy

On GitHub Pages, people names, reporting lines, photos and logos never leave the browser unless you export a file. Logos and photos are processed locally; SVG uploads are sanitized before conversion to PNG. That host serves only the program, not your roster.

The optional enterprise host stores one workspace in SQLite on that machine after sign-in. Roles and subtree scope decide who can load, save or export.

## License

MIT. See [LICENSE](LICENSE).
