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

### Desktop app

CI builds desktop binaries for each OS. **v2.5.0** is the current release. The Windows and macOS builds are not code-signed yet, so the first open shows a SmartScreen or Gatekeeper prompt (see each row below). Download it below, or browse [all GitHub Releases](https://github.com/ferax564/OrgFlow/releases) (or the **Desktop binaries** workflow artifacts). You do not install into Program Files or `/Applications`.

| OS | File | How to run |
| --- | --- | --- |
| Windows | [OrgFlow-2.5.0-windows.exe](https://github.com/ferax564/OrgFlow/releases/download/v2.5.0/OrgFlow-2.5.0-windows.exe) | Double-click the `.exe`. Windows may show SmartScreen on an unsigned build — More info → Run anyway. Workspace data is stored in `OrgFlow-data` next to the exe. |
| macOS | [OrgFlow-2.5.0-mac.zip](https://github.com/ferax564/OrgFlow/releases/download/v2.5.0/OrgFlow-2.5.0-mac.zip) | Unzip and double-click `OrgFlow.app`. You can leave it in Downloads; you do not need to drag it to Applications. If Gatekeeper blocks it, right-click → Open. |
| Linux | [OrgFlow-2.5.0-linux.AppImage](https://github.com/ferax564/OrgFlow/releases/download/v2.5.0/OrgFlow-2.5.0-linux.AppImage) | `chmod +x OrgFlow-*-linux.AppImage && ./OrgFlow-*-linux.AppImage` |

```bash
npm ci
npm run desktop          # run from this repo
npm run dist:linux       # AppImage (Linux host)
npm run dist:win         # NSIS installer + portable exe (Windows host)
npm run dist:mac         # .app zip (macOS host)
```

Tagged builds publish the binaries plus update manifests and blockmaps. Windows also includes an NSIS installer for automatic updates; the existing portable EXE remains available.

The desktop **⋯** menu has **Check for updates**, **Download update**, and **Save and restart to update**. Native **File → Open file…**, **Save**, **Save as…** and **Recent org charts** manage `.orgflow`/JSON documents. External file changes are detected before overwriting. Browser file autosave requires reconnection after restart.

See [signed release operations](RELEASE_OPERATIONS.md) for credential setup and deployment checks.

See [production readiness and release gates](PRODUCTION_READINESS.md) for signing setup, current limitations, review findings, and the prioritized next steps. Automatic update delivery requires a newly published compatible release; it is not enabled retroactively in older downloaded binaries.

The desktop app loads the planner from a fixed `orgflow://` origin, so restarts and updates always find the same browser storage. Every commit is additionally journaled by the app itself into `OrgFlow-data` next to the executable **and** the OS-standard app-data folder — moving the exe to a new folder still finds the workspace, and each directory keeps the ten most recent backups of the file.

On this public site there is no backend. IndexedDB is the authoritative document store, with full recovery checkpoints and an atomic pending-change queue. `localStorage` is an optional cache and preference store; its quota failure does not prevent durable saves. Concurrent stale tabs are refused rather than overwriting newer commits. Clearing *all* site data still removes everything; export a JSON backup first. An optional Node host can share one org — see [Enterprise host](#enterprise-host-optional).

Windows automatic updates require the [installer](https://github.com/ferax564/OrgFlow/releases/download/v2.5.0/OrgFlow-2.5.0-windows-setup.exe). The portable EXE uses manual replacement. See [release validation](RELEASE_VALIDATION.md), [changes](CHANGELOG.md), and [host operations](server/README.md).

## Using the planner

Harbor & Co (17 positions) loads on first visit. The **Start page** (File → New or open from template…) offers a blank organization, that sample, Northstar Commerce and smaller templates, plus **Open a saved file…** and recent files. Creating from a template replaces this browser’s scenarios, people and branding after checkpointing them.

### Files: open, save and back up

Everything about files lives in one place — the **File** menu, also opened by clicking the save-status chip next to the company name. The chip always answers “is my work safe, and where?”: an amber dot means the chart is only kept in this browser, green means it is saved to a file, a pulsing dot means a save is in progress, red means a save failed.

| Action | Shortcut | What it does |
| --- | --- | --- |
| New or open from template… | | Opens the Start page |
| Open file… | ⌘/Ctrl+O | Opens a `.json` workspace or `.orgflow` bundle; the current chart is checkpointed first |
| Save | ⌘/Ctrl+S | Writes to the linked file, or asks where to save the first time |
| Save as… | ⇧⌘/Ctrl+Shift+S | Always asks for a new file and links to it |
| Auto-save changes to the linked file | | Writes every change through to the linked file |
| Import positions from CSV… | | Reviews a CSV before it changes the active scenario |
| Download backup / bundle | | Portable JSON, or a `.orgflow` bundle with recovery checkpoints |
| Recovery & earlier versions… | | Checkpoints and earlier versions kept on this device |

You can also **drag a file onto the window**: `.json`/`.orgflow` opens it, `.csv` starts an import review. Browsers without the File System Access API (Firefox, Safari) download a copy on Save instead of keeping a file linked.

### Keyboard shortcuts

Press `?` for the full list. Besides the file shortcuts: `⌘/Ctrl+K` or `/` search, `N` add a position, `+`/`−` zoom, `0` fit the chart, `[` show or hide the filters panel, `1`–`5` switch between Org chart, Positions, Compare, Planning and Seating, `⌘/Ctrl+Z` undo. Single keys never fire while you type in a field.

### Working with the chart

- **Drag-and-drop** a card onto another manager to change reporting. Drop onto a **sibling** to reorder (left/top = before, right/bottom = after). If that side would leave the order unchanged, the two cards swap. Drops that would create a cycle are ignored. Set a **dotted-line** (matrix) manager in the position drawer; it draws dashed and does not change the tree layout.
- **Undo / redo** with ⌘Z / Ctrl+Z in this session (not while typing in a field). **File → Recovery & earlier versions** shows the workspace identity, revision and where it is stored; keeps the last ten planning snapshots as Earlier versions; and stores full checkpoints — with photos and branding — before every restore, import or sample load. Checkpoints can be restored in place or **as a copy** (a new workspace id) so recovery never overwrites current work. Edits that never reached a shared server are listed there as recoverable changes.
- **Cards** show the person (or vacant/recruiting), title, group, location, type, approval, hiring state and FTE. Optional photos are resized locally to a small PNG. **Direct reports and vacancies** (`N reports · N open`) is on by default; turn it off under **Card details** in the filters panel. Heads and Team Leaders can also show a cumulative people count.
- **Custom fields** on a position: location / site, cost center, job family. On a person: employee number and photo.
- **Date filter** is off by default, so future-dated roles stay visible and the date box shows "All dates". Turn on **Only show positions active on this date** to hide roles that have not started (or have already ended) relative to the as-of date; the toolbar pill then reads "As of …" instead of "All dates".
- **Filters panel** (left) keeps search and the capacity totals on top, then collapsible **Filter** sections (position type, group, site, hiring, approval, active date) and **Display** sections (levels shown, card details, saved views). Each section header shows a badge such as `All` or `2 of 5`, and the panel remembers which sections you opened. **Show all / Hide all** under a filter makes it quick to isolate one group: hide all, then click the one you want. Hide the whole panel with its toggle in the planning bar or `[`. Filters apply to the org chart and the Positions register. Click a selected **Group / team** or **Location / site** chip to hide that set. Positions with a blank group or site sit under No group / No site. Whenever filters or a search limit the view, a pinned bar above the workspace shows what is active and offers **Clear all filters & search**. Compare uses full snapshots and ignores those filters. Loading an example or a blank organization resets filters.
- **Search** highlights matching cards and the **path to the top**. Hovering a card does the same.
- **Multi-select** with ⌘/Ctrl-click or Shift-click (or the checkboxes on Positions). Open the bulk-edit sheet, choose Keep / Set / Clear per field, review the changes, then apply atomically. Keep is the default; Vacant/Recruiting explicitly unassigns a snapshot seat.
- **Position editor** opens from a card or the register's Edit. `Escape` or **Close** leaves it, `⌘/Ctrl+Enter` saves, and Tab cycles inside the drawer. Unsaved edits ask before they are discarded when you switch cards, views or scenarios.
- **People** in the header opens the directory, which lists everyone in the active scenario with their seat, and adds, edits or removes person records (name, employee number, photo). Seat assignment stays in the position editor.
- **Scenarios** can be renamed and deleted from **Scenario details**; archiving one drops it from the switcher and compare lists while keeping its data and frozen snapshot, and it restores from the same dialog.
- **Saved views** in the filters panel store filter, zoom and card-display presets on the workspace (up to 20). They travel with the JSON backup.
- **Card details** in the filters panel hides or shows FTE, site, group, position type, approval, hiring, span and cumulative people on every card. Long names wrap and that card grows. Last-level managers stack their reports in a column under the manager; uncheck **Stack direct reports** in the drawer to spread them. **Move up / Move down** changes sibling order immediately. Add a tag like Engineer, Graduate or Intern under **Position type → Manage custom tags**. These settings persist and apply to PNG, PDF and HTML exports.
- **Narrow screens** hide the filters panel. Open it with the panel toggle in the planning bar and close it with × or `Escape`; People and the colour palette move into the **⋯** menu. The chart pans with touch or by dragging empty space with the mouse.
- **Branding** (⋯ menu) stores company name, chart title and logos in this browser. Logos are sanitized and rasterized locally.

### Seating plans

The **Seating** tab (`5`) draws rooms and assigns desks. One floor plan is shared by every scenario. Desks are assigned to **positions**, not people, so each scenario shows who sits where in that plan. A desk can also be kept for a vacancy.

- **Rooms**: **＋ Room** creates a rectangle of the width and depth you enter. You can add as many rooms as you need, each with a floor or building label. Use **Room** (`Q`) to drag a new rectangle, or **Walls** (`W`) to click corner by corner. Walls snap to right angles (hold Shift for any angle), and the live length shows while you draw. Enter, double-clicking or clicking the first corner closes the shape. In **Select** (`V`), drag a corner to reshape the room, click ＋ on a wall to add a corner, or double-click a corner to remove it. Wall lengths and the area in m² are always shown.
- **Desks**: **Desk** (`D`) places one desk per click (hold Alt to turn it 90°). **Desk block** (`B`) fills a dragged area with as many desks as fit. Choose benches of two back to back or single rows, and set the desk size, gap and aisle in the room panel. Desks that would sit outside the walls or on another desk are skipped. Labels continue automatically (D1, D2…).
- **Editing**: drag desks to move them, or drag empty space to select several. `R` rotates, `⌘/Ctrl+D` duplicates, the arrow keys nudge by the snap grid (10 cm to 1 m), and Delete removes. Desks outside the walls or overlapping another desk are outlined in red. Every change can be undone.
- **Assigning**: drag a name from **People & positions** onto a desk, pick a position in the desk panel, or select a desk and click a name. Seating someone who already has a desk moves them. **Auto-seat by team** fills the free desks in reading order, keeping each group together. **Hot desks** are shared and cannot be assigned. The position editor shows each position's desk.
- **Export**: seating CSV (room, floor, desk, position, person, group, site) and a PNG of the room. Seating travels with the JSON backup and `.orgflow` bundle. Subtree-scoped members of a shared host do not receive the seating plan and cannot change it.

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
| Workspace backup (JSON) | Every scenario, unassigned people, branding, palette, saved views, seating plan and the current view |
| Seating CSV / PNG | From the Seating tab: one row per desk with its occupant in the active scenario, or a picture of the selected room |
| OrgFlow bundle (.orgflow) | Workspace plus checkpoints — the file you hand someone for editing and recovery. Older OrgFlow 2.0/2.1 builds refuse this document instead of silently dropping fields |
| File → Save | Overwrites the last JSON file you picked when the browser supports it; **Auto-save changes to the linked file** writes every change through to that file. The file link survives restarts but requires explicit reconnection — if the browser needs permission again, **Reconnect saved file** appears instead of silently going stale |
| Print / A3 pages (PDF) | Tiled A3 landscape pages of the visible chart |

A workspace JSON that omits `dateFilter` restores with all dates visible. Full JSON restore is local-only on the planner; use Draft imports or the proposal API for a shared organization.

Every workspace carries a document version (currently 3), schema, identity, revision and commit timestamp. This build still reads version-2 files and rewrites them as version 3. Older OrgFlow 2.0/2.1 writers that only accept version 2 refuse the new file instead of silently dropping fields. A file written with a **newer schema** is refused with an explicit message. Unknown fields on supported documents are preserved through load/save round-trips. When several stored copies disagree (browser storage, app storage, desktop journal), the newest revision wins and the others catch up on the next save. The desktop Recovery center also lists leftover `http://127.0.0.1:<port>` profiles from pre-`orgflow://` builds when they can be parsed.

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
- Print / A3 tiled PDF export; File → Save overwrites the last JSON file when the browser allows it
- Custom position tags (same kind as Engineer, Graduate, Intern) in addition to the built-in types
- Optional local photos and richer cards (location on the card)
- Dotted-line / matrix managers
- Undo, redo and earlier local versions
- Position types: Head, Team Leader, Engineer, Specialist, Graduate, Intern (plus levels you add)
- Approval and hiring-state filters, including vacant and recruiting seats
- Positions kept separate from people; FTE is position capacity, not salary
- Scenario planning and before/after comparison
- Seating plans: draw rooms, fill them with desk blocks, and assign desks to positions by dragging or auto-seating by team
- Company branding, light/dark modes, palettes (Indigo, Crimson, Graphite, Ocean, Emerald)
- Start page with starter templates (startup, agency, nonprofit), recent files and open-from-file
- Portable desktop app (Windows exe, macOS .app, Linux AppImage) with no installer

## Example companies and templates

Fictional product and retail samples — not motorsport teams. Load them from the **Start page** (File → New or open from template…), or open `workspace.json` from `examples/` with File → Open file….

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

Smaller orgs shipped in `js/templates.js`, also listed on the Start page:

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

The suite covers CSV parsing, spreadsheet-formula escaping, scenario validation, dotted-line rules, custom-field CSV round-trips, starter templates, comparison diffs, example workspaces, filter-set migration, stacked chart layout, sibling reordering, custom position levels, group/site chips, bulk edit, named views, A3 tiling, schema-version guards and forward-compatible field preservation, seating-plan geometry (walls, desk overlap, desk blocks, auto-seat and redaction), share-dataset redaction and subtree scoping, the journaled desktop workspace store (atomic writes, rotating backups, newest-revision selection), the desktop file server, and enterprise ACL/stress cases (forged cookies, path traversal, oversized bodies, last-admin protection, concurrent saves).

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
