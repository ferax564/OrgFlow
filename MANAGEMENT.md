# OrgFlow 2.1: decisions, capacity and safe persistence

## Run and verify

Node **22.16 or newer** is required for the shared host and its SQLite tests. The static planner remains a browser app with no runtime dependency installation. Back up an existing workspace as JSON before upgrading. Version-2 workspace files migrate in memory: missing collections become empty, old position assignments remain snapshots, and new proposals start in Draft. Current builds write document version 3. They still read version 2. Older OrgFlow builds that only accept version 2 refuse the file instead of silently dropping fields. Unknown fields on a supported document survive load/save round-trips. Schema numbers above this build are refused (`SCHEMA_TOO_NEW`).

```sh
npm run check
npm run lint                       # pinned ESLint 9.39.1
npm test
python3 -m pip install playwright==1.57.0
python3 -m playwright install chromium firefox webkit
python3 tests/browser-regressions.py --browser chromium
```

CI also runs Firefox and WebKit. The explicit `--dom` option is a restricted-environment fallback, not a substitute for real browser navigation: storage/network are mocked and native-file, download and shared-host browser checks are skipped. File tests use native origin-private writable handles where available; they do not automate the operating system's chosen-file permission dialog. Desktop build checks do not replace hands-on testing of each operating system's packaged UI.

## Saving, restoring and sharing

The save indicator distinguishes the browser, a linked file, and the shared server. File writes are serialized and revision-aware. Undo, redo, data replacement, view changes and branding update the linked file when automatic saving is enabled. Disabling it cancels queued automatic writes; a write already committed cannot be reversed. Errors remain visible until corrected. Retry or manually save before closing an unsaved workspace.

A restore keeps its candidate file separate until validation and confirmation succeed. Cancelled or invalid restores never become the save destination. Local examples and blank-workspace replacement keep the existing file link and therefore update that file when automatic saving is enabled. Unlink it first to preserve the previous file. The operating system still controls file access permissions, and browsers without the chosen-file API download JSON copies instead.

**Share chart (HTML)** contains the visible SVG, not the underlying workspace. It is not restorable and does not contain hidden or archived scenarios. The visible labels, photographs, branding and visible contextual manager cards are still shared. SVG, PNG and PDF are also visual exports. CSV explicitly exports position snapshots for the active scenario. **Workspace backup (JSON)** contains every scenario, people, photos, budgets, timelines, discussions and planning records: treat it as a sensitive backup, not a redacted presentation.

Whole-workspace restore, examples and replacement are local-only. On a shared host, import changes into a Draft or use the proposal API rather than replacing protected decision records. Server failures and stale revisions do not silently discard local edits. The conflict dialog performs a three-way reconciliation and asks for explicit resolution of overlapping changes.

## Planning views

The Planning tab has Overview, Forecast, Timeline, Decisions and Imports sections. Its scope is the selected scenario, independently of chart-only filters. The register and directory render pages of 100 records. Large charts cache their layout and render viewport-visible cards, with overscan and automatic reveal of search matches. Exports still include the complete visible chart, not merely the viewport.

The compact selection bar opens a bulk-edit sheet. Fields default to **Keep**; optional values have explicit **Set** and **Clear** modes. Review the changed fields before applying them. Setting a seat to Vacant or Recruiting explicitly unassigns its occupant but retains the person record. Snapshot bulk staffing edits are blocked for timeline-managed seats.

## Scenario decisions

The decision lifecycle is **Draft → In review → Approved → Scheduled → Applied**. Owner, reviewer names, rationale, effective date, discussion and decision history travel with the scenario. Metadata and actions are distinct from the position's ordinary Approved/Not approved label.

A proposal retains its original comparison snapshot and a separate application baseline against Current. Before application, the proposed changes, baseline and latest Current are merged field by field. Unrelated Current edits survive; overlapping edits require reconciliation and a fresh review. Changed proposals under review, approved or scheduled return to Draft. Applied proposals are immutable: archive them, or create a new rollback proposal, rather than rewriting their history. Rollback itself never applies automatically.

In local mode these are **planning records, not authenticated approvals**: anyone with the file can edit it. The shared host authorizes workflow actions on the server. An unscoped editor can create and submit proposals and discuss them; only an unscoped administrator can approve, schedule or apply them. Subtree members cannot issue organization-wide decisions. Author identities and audit events are recorded by the server; a generic workspace save cannot forge them. Named reviewers are planning metadata, not automatic invitations or a multi-signature policy engine.

**Scheduling records an effective date; it does not run a background job.** Application is explicit and blocked before that date. Approval alone never changes Current. The server validates the complete merged organization and commits the workspace revision and audit entry in the same database transaction.

## Dates, people and capacity

Position lifecycle, people, dated assignments and reporting relationships are separate. Existing snapshots are not fabricated employment history. Adding the first dated assignment or reporting line switches that seat into timeline mode. For a future change, the UI preserves the current snapshot from today until the day before the new interval, rather than claiming knowledge of earlier history.

Intervals use ISO dates and **inclusive end dates**. Overlapping seat assignments, invalid reporting cycles, out-of-lifecycle staffing and allocations exceeding a person's declared capacity are rejected atomically. A person can have non-overlapping or fractional assignments subject to capacity; position-authorized FTE, staffing FTE and project allocation are distinct quantities. Old snapshot seats consume the corresponding position FTE while occupied.

The people directory stores declared capacity FTE, declared skills and an optional external ID. Timeline records support staffing, solid/dotted reporting, position budgets, project allocations and commitments. Ending a staffing interval does not delete the person. Removing a referenced person is prevented. Capability and single-person-dependency summaries use declared data, not inferred employee performance or suitability.

Shared subtree access follows the effective organization on the server's current date, including dated reporting. Global decision notes, out-of-scope seats and budgets, source profiles and outside context are redacted. A subtree editor cannot move its root or its root's dated reporting line to escape the authorization boundary.

## Forecast assumptions

Forecasts cover 1–36 months. Each row shows month-end headcount plus average daily position FTE, staffed FTE, project allocation and commitment demand. The drilldown identifies contributing positions, missing budgets and the date interval. An annual position budget is a budget **per 1.0 FTE**, not a person's salary. Monthly amounts are annual budget × position FTE ÷ 12, prorated by the active days in that month. Approved and proposed budgets are separated; currencies are never silently combined or converted. Missing-cost FTE remains visible instead of being interpreted as free capacity.

This is organizational planning, not payroll, a historical HR ledger, an FX engine or an automatic resource optimizer. Commitments and capability coverage help identify questions for a manager; they do not assign people to jobs automatically.

## Imports and integrations

CSV imports default to a new Draft, leaving Current untouched. Stable position and person IDs control updates; names are labels, not identities. Header conflicts remain recoverable in the mapping UI. Map only the fields owned by the source and save reusable source mappings; ignored/omitted fields remain unchanged in update mode. A source profile stores the header map and import mode, not credentials or a live data connection. Timeline records and extended capacity fields are retained during ordinary CSV updates and travel through JSON/API operations.

No vendor-specific Workday, SAP or other HRIS connection is configured by this release. Use the generic authenticated APIs or repeatable CSV workflow. Production identity-provider setup still requires your own OIDC configuration.

### Authenticated API

`GET /api/workspace` returns a document and revision. Writes must include the expected `version` (or the supported `If-Match` header); a stale revision returns HTTP 409 without replacing either side. `GET /api/org/summary` includes the revision. `GET /api/org/forecast` returns scoped forecast data. The decision endpoint is `POST /api/scenarios/:id/decision` with `{action, input, version}`.

`POST /api/proposals` is a safe integration path for an unscoped editor or administrator. It always creates a validated Draft from Current. It cannot approve or apply. Up to 500 record changes are accepted. An example using existing IDs:

```json
{
  "name": "Engineering capacity proposal",
  "rationale": "Evaluate a proposed cost-center change before applying it",
  "version": 7,
  "changes": [
    {"entity": "positions", "id": "POS-001", "operation": "upsert", "values": {"costCenter": "ENG"}}
  ]
}
```

Collections are `positions`, `employees`, `assignments`, `reportingLines`, `costs`, `allocations` and `commitments`; operations are `upsert` and `remove`. Invalid references and capacity conflicts reject the whole request. General saves and proposals preserve authorization, version and audit safeguards. A retry after a successful proposal with the same old revision fails with 409 rather than duplicating it unnoticed.

### MCP

The stdio bridge uses newline-delimited JSON-RPC. Existing member-token authorization still applies. Its default tools remain read-only, including `workforce_forecast`.

```sh
ORGFLOW_API_URL=http://127.0.0.1:8787 ORGFLOW_API_TOKEN=YOUR_MEMBER_TOKEN npm run mcp
# Explicitly expose the proposal-only write tool:
ORGFLOW_ALLOW_PROPOSALS=true ORGFLOW_API_URL=http://127.0.0.1:8787 ORGFLOW_API_TOKEN=YOUR_MEMBER_TOKEN npm run mcp
```

`propose_changes` routes through `/api/proposals` with the member's actual permissions. The opt-in does not grant extra authorization. No MCP tool approves, applies or silently edits Current. Protect the token like a password. The older HTTP MCP endpoint remains read-only.
