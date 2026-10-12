# OrgFlow — current product (as of Oct 2026, from repo docs)

Open-source-style org chart + workforce planning app. Runs in browser (GitHub Pages, local-first JSON files, no account), as Electron desktop app, and on an optional self-hosted shared Node host (SQLite) with members, API, MCP tools, CLI, workplace planning and a Microsoft Teams app.

Org chart / design:
- Expandable chart, search, drag to reorder/re-parent, dotted-line/matrix managers, custom tags, photos, branding, named views, filters by group/site/type/approval/hiring state, bulk edit, A3 tiled PDF/print export, CSV positions import/export
- Positions separate from people; FTE is position capacity; vacancies & recruiting seats
- Scenario planning with before/after comparison; decision workflow Draft → In review → Approved → Scheduled → Applied, with field-level merge vs. Current, audit trail, rollback proposals
- Dated timeline: assignments, reporting lines, position budgets (per 1.0 FTE), project allocations, commitments; inclusive date intervals; capacity validation
- Forecast 1–36 months: headcount, FTE, staffed FTE, cost (no FX conversion), missing-budget visibility
- People directory with declared capacity, declared skills, external ID; capability & single-person-dependency summaries
- Seating plans: draw rooms, desk blocks, assign desks to positions, auto-seat by team
- Large-chart virtualization; starter templates

Shared host / enterprise:
- Members with roles (admin, editor, subtree-scoped editor, scheduling-only employee), OIDC (bring your own), API tokens with scopes (read, export, propose, workplace), optimistic concurrency, audit log
- REST API incl. safe POST /api/proposals; MCP server (read org chart, draft proposals only); `orgflow` CLI; Claude Code / Codex agent skills
- CSV import into Draft with reusable source-mapping profiles. NO vendor HRIS connectors (Workday, SAP, BambooHR, Personio, HiBob...), no SCIM.

Workplace (hybrid work):
- My week: plan work location per day (office/remote etc.), full days only
- Vacation requests and manager approval; team absence view
- Desk sharing / desk booking, visitor reservations (internal), notifications, records/retention
- Microsoft Teams tab + notification bot
- Explicitly NOT yet: vacation balances/accrual, payroll/HRIS integration, half days, auto-release of unused bookings, occupancy sensors, external visitors, Outlook work-location sync, Teams chat commands

Not present at all (as far as docs show): Slack/Google Workspace integration, mobile app, compensation planning, hiring-plan/ATS integration, analytics dashboards (diversity, span-of-control benchmarks, attrition), AI assistant inside UI, room booking, SSO/SCIM provisioning, multi-language UI, SaaS hosted offering.
