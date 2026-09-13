# OrgFlow

Private organization charts and workforce planning in the browser. Positions stay separate from people. Scenarios copy Current instead of overwriting it. Names, photos and logos stay on the device that opened the page until you export a file.

**Live site:** [ferax564.github.io/OrgFlow](https://ferax564.github.io/OrgFlow/) · **Planner:** [app.html](https://ferax564.github.io/OrgFlow/app.html)

![Harbor & Co organization chart](examples/harbor-and-co/chart.png)

## Open it

The repository root is a static site:

| Path | What it is |
| --- | --- |
| `index.html` | Product landing page |
| `app.html` | The planner |
| `css/`, `js/`, `assets/`, `examples/` | Styles, logic, icons and samples |

Serve the root over HTTP (GitHub Pages does this in production):

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173/ or http://localhost:4173/app.html. Opening the files as `file://` may block image processing and some exports.

There is no backend. Clearing site data removes the workspace; export a JSON backup first.

## Using the planner

Harbor & Co (17 positions) loads on first visit. A tour offers that sample, Northstar Commerce, and smaller templates. Loading a sample overwrites this browser’s scenarios, people and branding.

- **Drag-and-drop** a card onto another card to change reporting. Drops that would create a cycle are ignored. Set a **dotted-line** (matrix) manager in the position drawer; it draws dashed and does not change the tree layout.
- **Undo / redo** with ⌘Z / Ctrl+Z in this session (not while typing in a field). **Earlier versions** in the sidebar keeps the last ten planning snapshots in this browser, without photos or logos.
- **Cards** show the person (or vacant/recruiting), title, group, location, type, approval, hiring state and FTE. Optional photos are resized locally to a small PNG.
- **Custom fields** on a position: location / site, cost center, job family. On a person: employee number and photo.
- **Date filter** is off by default, so future-dated roles stay visible. Turn on **Respect position start / end dates** to hide roles that have not started (or have already ended) relative to the as-of date.
- **Chart filters** (type, hiring, approval, depth, search) apply to the org chart and the Positions register. Compare uses full snapshots and ignores those filters. Loading an example or a blank organization resets filters.
- **Narrow screens** hide the sidebar. Open it with the ☷ **Filters** control in the planning bar. It stays available on Org chart, Positions and Compare.
- **Branding** stores company name, chart title and logos in this browser. Logos are sanitized and rasterized locally.

### Export

| Export | Contents |
| --- | --- |
| Current view as PNG | Visible chart, optionally branded |
| One PNG per group (ZIP) | One chart file per group |
| Board pack (PDF) | Cover sheet, current chart, scenario comparison when a second scenario exists |
| Shareable HTML snapshot | Self-contained page with the chart inline and workspace JSON for restore |
| Positions + assignments (CSV) | Active scenario, including custom fields |
| People directory (CSV) | People in the active scenario |
| Workspace backup (JSON) | Every scenario, unassigned people, branding, palette and the current view |

A workspace JSON that omits `dateFilter` restores with all dates visible.

### Positions CSV columns

`positionId`, `reportsToPositionId`, `secondaryManagerId`, `title`, `type`, `group`, `fte`, `approval`, `hiringState`, `personId`, `name`, `employeeNumber`, `startDate`, `endDate`, `location`, `costCenter`, `jobFamily`

Import can replace, append, or update by position ID. Spreadsheet formulas in cells are prefixed so they stay text.

## Features

- Expandable org chart with level presets and search
- Drag to re-parent; cycle detection
- Optional local photos and richer cards (location on the card)
- Dotted-line / matrix managers
- Undo, redo and earlier local versions
- Position types: Head, Team Leader, Engineer, Specialist, Graduate, Intern
- Approval and hiring-state filters, including vacant and recruiting seats
- Positions kept separate from people; FTE is position capacity, not salary
- Scenario planning and before/after comparison
- Company branding, light/dark modes, palettes (Indigo, Crimson, Graphite, Ocean, Emerald)
- First-run tour and starter templates (startup, agency, nonprofit)

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

Pushing to `main` runs `.github/workflows/pages.yml`. It enables GitHub Pages for the repository if it is not already on, copies `index.html`, `app.html`, CSS, JS, assets and examples into a `site/` folder with `.nojekyll`, and deploys that folder. Asset paths are relative so the site works at `https://ferax564.github.io/OrgFlow/`.

## Tests

```bash
npm test
```

The suite covers CSV parsing, spreadsheet-formula escaping, scenario validation, dotted-line rules, custom-field CSV round-trips, starter templates, comparison diffs, example workspaces and filter-set migration (including Specialist after older saved views).

With Chrome and `puppeteer-core` installed locally:

```bash
python3 -m http.server 4173   # in one terminal
node scripts/browser-qa.cjs   # full UI pass against that server
node scripts/smoke.cjs        # landing page plus planner; starts its own server on 4174
```

## Privacy

People names, reporting lines, photos and logos never leave the browser unless you export a file. Logos and photos are processed locally; SVG uploads are sanitized before conversion to PNG. GitHub Pages hosts only the program, not your roster.

## License

MIT. See [LICENSE](LICENSE).
