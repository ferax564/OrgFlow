# OrgFlow

Interactive organization-chart and workforce-planning app. It runs entirely in the browser: positions, people, scenarios and logos stay on the device that opened the page.

![Harbor & Co organization chart](examples/harbor-and-co/chart.png)

## Why this build

The previous publish path stored the app as gzipped JavaScript chunks. This revision ships readable HTML, CSS and JavaScript, adds automated tests, and replaces the motorsport sample with two generic companies.

## Features

- Expandable org chart with level presets and search/highlighting
- Position types: heads, team leaders, engineers, specialists, graduates and interns
- Approval and hiring-state filters, including vacant and recruiting roles
- Optional start/end date filtering
- Positions kept separate from people
- FTE / capacity tracking
- Scenario planning and before/after comparison
- CSV import/export with validation and formula-prefixing
- Company branding and logo upload (processed locally)
- Light/dark modes and colour palettes, including Crimson, Graphite, Ocean and Emerald
- Branded PNG exports and per-group ZIP exports
- Workspace JSON backup/restore

## Example companies

Fictional product and retail samples — not motorsport teams. Load them from **Example companies** in the sidebar, or restore the JSON files from `examples/`.

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

More detail: [`examples/README.md`](examples/README.md).

## Run

Serve the repository root over HTTP (required for module-free static files and GitHub Pages):

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173/. Opening `index.html` as a file may block some browser features.

OrgFlow does not need a backend. Clearing site data removes the local workspace; export a JSON backup first.

## Using the app

- **Default sample** is Harbor & Co (17 positions). The sidebar can replace it with Northstar Commerce or a blank organization. Loading a sample overwrites this browser’s scenarios, people and branding — export a workspace backup first if you want to keep work.
- **Date filter** is off by default, so future-dated roles stay visible. Turn on **Respect position start / end dates** to hide roles that have not started (or have already ended) relative to the as-of date. New positions use today’s start date unless that filter is on.
- **Chart filters** (type, hiring, approval, depth, search) apply to the org chart and the Positions register. Compare uses full snapshots and ignores those filters. Loading an example or a blank organization resets filters so leftover chips cannot hide the new chart.
- **Narrow screens** hide the sidebar. Open it with the ☷ **Filters** control in the planning bar (next to scenario settings). It stays available on Org chart, Positions and Compare.
- **Workspace JSON** backups include every scenario, unassigned people, branding, palette and the current view. Restoring replaces all of that. A backup that omits `dateFilter` keeps all dates visible rather than turning the date filter on.

## Tests

```bash
npm test
```

The suite covers CSV parsing, spreadsheet-formula escaping, scenario validation, comparison diffs, example workspaces and filter-set migration (including Specialist after older saved views).

With Chrome and `puppeteer-core` installed locally:

```bash
python3 -m http.server 4173   # in one terminal
node scripts/browser-qa.cjs   # full UI pass against that server
node scripts/smoke.cjs        # shorter pass; starts its own server on 4174
```

## Privacy

People names, org structure and logos never leave the browser unless you export a file. Logos are rasterized locally; SVG uploads are sanitized before conversion to PNG.

## License

MIT. See [LICENSE](LICENSE).
