# Changelog

## 2.5.0-rc.1

Unsigned release candidate focused on ease of use: one place for files, a tidy filters panel and faster keyboard work. Workspace data format is unchanged (document version 3); 2.4 files open as-is.

- **File menu** in the header gathers New, Open (⌘O), recent files, Save (⌘S), Save as… (⇧⌘S), auto-save, CSV import, backups and Recovery. The Share menu now only shares and exports charts and data.
- **Save-status chip** next to the company name shows at a glance whether the chart is saved to a file (green), only kept in this browser (amber), saving (pulsing) or failed (red). The tab title shows the file name and a • for unsaved file changes. First Save suggests a file name from the company name.
- **Start page** replaces the welcome tour: continue the current chart, open a file or a recent file, or create from a blank organization, the two samples or three starter templates.
- **Drag and drop** a `.json`/`.orgflow` file anywhere to open it, or a `.csv` to review an import.
- **Reorganised filters panel**: search and capacity totals stay pinned on top; filters (type, group, site, hiring, approval, date) and display settings (levels, card details, saved views) are collapsible sections with `All` / `2 of 5` badges and remembered open state. **Show all / Hide all** per filter. Custom tag management moved under Position type. Data, examples and update buttons left the panel.
- **Hide the panel** on desktop with the new toggle in the planning bar or `[` (remembered); on phones the same control opens it as an overlay with a close button.
- **Keyboard shortcuts** dialog (`?`) and new single-key shortcuts: `/` search, `N` add position, `+`/`−` zoom, `0` fit, `1`–`4` switch views, arrow keys inside menus. Single keys never fire while typing.
- Header decluttered: **People** button, undo/redo icons, branding and help in a **⋯** menu (which also carries People and the palette on phones). Distinct icons for expand/collapse versus zoom in the chart toolbar.
- Browser regression suite grows to 32 tests covering the File menu, sidebar badges and persistence, Start page, shortcuts and file drop.

### Upgrade notes

No data migration. Panel layout preferences are stored per browser. Scripts or bookmarks that clicked sidebar buttons such as *Load Harbor & Co* should open the Start page first (`openWelcome(true)`); element IDs are unchanged.

## 2.4.0-rc.2

Unsigned release candidate for storage, document management and security hardening. Production distribution still requires platform signing and a real update drill.

- Add desktop Check for updates, Download, and Save and restart, with save failures blocking installation; publish installer/update metadata.
- Add native Open/Save As, persistent recent org charts, external file-change protection and explicit browser file reconnection.
- Make IndexedDB authoritative with atomic outbox commits, stale-tab protection, isolated account caches and complete recovery checkpoints.
- Open recovered charts directly without a first-run sample chooser; preserve checkpoint views in bundles.
- Fix offline interactive HTML, scoped history/export authorization, journal backup ordering and corrupt-copy handling.
- Validate OIDC through openid-client, bind login to the initiating browser, require verified invited identities, and restrict production configuration.
- Add expiring read/export/propose API tokens, proposal idempotency, assigned-reviewer approval and review queues.
- Add public static-asset allowlisting, health/readiness, retention, safe backup/restore, a non-root container and expanded OpenAPI documentation.
- Upgrade Electron to 44.4.3; gate builds on domain/server, Chromium/Firefox/WebKit and native desktop lifecycle tests.

### Upgrade notes

Export a `.orgflow` backup before updating. Keep the old data directory until you verify recovery. Existing browser workspaces migrate into authoritative IndexedDB. Shared-host caches are isolated under the authenticated identity; old unscoped pending records are retained but not replayed automatically. Legacy API tokens become read-only and expire within 30 days; create explicitly scoped replacements. Production OIDC requires `BOOTSTRAP_ADMIN_EMAIL` for an empty tenant. Reviewer entries must be administrator email addresses. Windows portable builds do not self-update: install the setup executable to enter the automatic-update channel. Older schema readers must not be used to rewrite new documents.
