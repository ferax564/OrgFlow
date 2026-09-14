# Example companies and templates

These workspaces are fictional. They are the screenshots and sample data shipped with OrgFlow — not motorsport teams.

Load a sample from **Example companies** in the planner sidebar, from the first-run tour, or by restoring `workspace.json` from the Export menu. Loading a sample overwrites this browser’s scenarios, people and branding. It also resets chart filters (including the date filter) so the full tree is visible.

## Full samples (`examples/`)

Each folder contains:

- `workspace.json` — full OrgFlow backup (scenarios, people, branding, palette, named views)
- `positions.csv` — Current-scenario export
- `logo.png` — company mark used in the header and PNG exports
- `chart.png`, `positions.png`, `compare.png` — captured from the running app

### Harbor & Co

A product company with Leadership, Product, Engineering, Design and Customer Success (17 positions). The **FY27 growth** scenario approves a pending engineer, fills a vacant platform role, restores a designer to full-time and opens a second customer-success seat.

Tom Becker’s Senior Software Engineer role starts 2026-10-01; enabling **Respect position start / end dates** before that day hides it.

### Northstar Commerce

A retail operator with Stores, Merchandising, E-commerce and People (14 positions). The **Peak season** scenario staffs a people partner, fills a recruiting store manager, restores digital design to full-time and plans a second southern store.

## Starter templates (`js/templates.js`)

Smaller Current-only orgs used by the welcome tour and the sidebar. They demonstrate location, cost center, job family, employee number and a dotted-line manager.

| Id | Company | Palette | Notes |
| --- | --- | --- | --- |
| `first-light` | First Light | Indigo | Startup, 8 seats. Product Manager dotted-line to Head of Engineering. One recruiting engineer. |
| `lumen-studio` | Lumen Studio | Graphite | Agency, 9 seats. Producer dotted-line to Creative Director. |
| `cedar-kind` | Cedar & Kind | Emerald | Nonprofit, 7 seats. Partnerships manager dotted-line to the Executive Director. |

They are not stored as `examples/*/workspace.json`. Export a workspace backup from the planner if you want a portable copy after loading one.
