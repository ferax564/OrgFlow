# Production readiness — 2.4.0-rc.1

This is a release candidate. The code and automated release gates have been hardened, but **signed distribution and a real signed N → N+1 update remain external release gates**. Do not describe an unsigned candidate as a certified production desktop release.

## Review findings and resolutions

| Area | Issues found | Resolution |
| --- | --- | --- |
| Durable browser storage | localStorage quota could block edits; storage failures were hidden; concurrent tabs could overwrite; queued server edits were not atomic | IndexedDB is authoritative; serialized transactions commit the document and outbox together; compare-and-swap rejects stale tabs; cache failures are nonfatal and durable failures remain visible |
| Recovery | Failed checkpoints could allow replacement; checkpoints omitted view settings; unrelated revision sequences affected backup rotation | Require successful checkpoints before replacement; save full envelopes; compare workspace identities and timestamps; rotate by modification time; reject malformed journal payloads |
| Account isolation | Shared-browser caches/checkpoints/file links could cross account or scope boundaries | Partition by tenant, user, role, subtree and export permission; refuse local fallback on a known shared host; legacy unscoped pending records are never automatically replayed under a new identity |
| File management | Browser-dependent desktop pickers, lost links and external overwrite risk | Native desktop dialogs, recent charts, opaque file grants, atomic writes and external-change detection; browser handles require explicit reconnection |
| Export | Embedded viewer omitted its management dependency and failed offline; history/export permissions could expose scoped data | Embed the full dependency chain; redact before serialization; filter history and enforce export permission; exercise real exported HTML offline |
| Authentication | OIDC lacked browser-bound state and complete ID-token verification; email linking could confuse identities | Maintained OIDC client validates signed tokens, PKCE/state/nonce and verified identity; browser-bound login cookie; explicit bootstrap administrator and invitation-only membership |
| Server security | Static denylist, unlimited tokens, bearer administrative powers | Public asset allowlist with realpath checks; expiring scoped tokens; proposal-only integration writes; same-origin browser mutations; reject unsafe production configuration |
| Governance | Reviewers were arbitrary labels; retries could create duplicate proposals | Resolve reviewers to actual administrator memberships, enforce assigned approval, expose review queue, and store transactional idempotency receipts |
| Operations | No verified live backup/restore path, readiness or retention | Consistent SQLite snapshots and validated restore-to-new-destination; database readiness; graceful shutdown; bounded retention; non-root container |
| Release | Old Electron vulnerabilities, incomplete update artifacts, weak release checks | Electron 44.4.3; audited lockfile; native lifecycle and three-browser CI; Windows installer; universal Mac build; manifests/blockmaps; stable tags require signing secrets |

## Assessment of the supplied recommendations

The priorities were correct: recovery and trustworthy sharing come before new planning features. The random-port problem had already been replaced by a fixed `orgflow://app` origin. This release completes the surrounding durability, error handling, scope isolation and document workflows rather than replacing the existing planning model.

Documents use workspace identities, revisions and schema guards. Real v2.1.0 fixture migration is tested. Recovery checkpoints contain planning, photos, branding, theme, palette and view; restore-as-copy remains available. IndexedDB also retains identity-indexed document copies, although the UI remains a single active document plus recent files, not a multi-document library.

Interactive HTML embeds only selected records/fields with local viewer code. Collapsed descendants remain expandable; excluded records are absent. It works offline with search, zoom, pan, filters, details and a static fallback. Offline exports cannot be revoked. Hosted expiring links, notification delivery, ATS connectors and a multi-workspace library remain optional product roadmap items, not claims made by this release.

The OpenAPI contract covers the REST surface, authentication and core models. The stdio MCP bridge remains the supported integration route. The HTTP endpoint is a JSON-RPC subset, not a complete Streamable HTTP/SSE implementation; target-client interoperability must be verified before deployment promises.

## Documents and updates

Open validates and checkpoints before replacing; canceling or rejecting a file preserves the current document and destination. Save overwrites the linked document, Save As chooses a new destination, and recent desktop documents persist in OS app data. Browser restarts require reconnection before file autosave resumes. Desktop journals and browser checkpoints are recovery copies, not independent off-device backups.

Updates use Check → Download → Save and restart. Installation is blocked until document, pending server work, linked file and native journal saves succeed. Ordinary quit does not silently install. Windows automatic updating requires the NSIS-installed build; portable users replace the executable manually. Development builds explain the limitation. Stable users do not automatically receive prereleases.

## Remaining deployment gates

1. Configure `CSC_LINK`/`CSC_KEY_PASSWORD` (Developer ID), `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` in GitHub. Verify signatures/notarization on clean target machines. Stable-tag CI fails when required signing credentials are absent.
2. Exercise signed N → N+1 updates on installed Windows, macOS and Linux builds, including interrupted downloads, restart/save failures and byte-for-byte workspace recovery. Mocked updater tests do not certify delivery.
3. Configure the deployment's real HTTPS OIDC provider, bootstrap administrator, persistent volume and encrypted external backups. Run a restore drill and provider login/logout smoke test in that environment; the automated OIDC suite uses a real locally signed test provider, not customer credentials.
4. Choose operational capacity/SLOs and exercise representative organization sizes on the intended host. Existing large-chart tests validate bounded rendering, not an unlimited scale guarantee.

See [release validation](RELEASE_VALIDATION.md), [host operations](server/README.md), and [changes](CHANGELOG.md). No test suite can establish that every possible input or deployment is defect-free.
