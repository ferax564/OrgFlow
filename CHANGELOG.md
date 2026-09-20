# Changelog

## 2.4.0-rc.1

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
