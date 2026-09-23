# Signed release and deployment operations

## Current evidence (2026-09-20)

The public static deployment at https://ferax564.github.io/OrgFlow/ passes the read-only deployment check: HTTPS, planner HTML and all ten JavaScript assets match the tested checkout. This deployment does not use the optional enterprise server; OIDC and database operations are not prerequisites for using the public browser-only planner.

GitHub repository signing secrets are absent. The local keychain contains Apple Development and Apple Distribution identities, but no Developer ID Application identity for direct macOS distribution. A different Apple certificate is not a substitute. No enterprise production URL or approved test account has been supplied. Signed artifacts, notarization and the signed-update drill therefore remain unverified; do not relabel the existing unsigned assets as stable.

## Release procedure

1. On a branch, bump `version` in `package.json` (`npm version <x.y.z[-rc.n]> --no-git-tag-version`), add a matching `## <version>` section to `CHANGELOG.md`, and update the download links in `README.md` and `index.html`.
2. Merge to `main`. The **Desktop binaries** workflow sees that `v<version>` does not exist yet, runs the full quality gate, builds Windows, macOS and Linux, then creates the tag at the merge commit and publishes the GitHub Release with the changelog section as notes.
3. Versions with a pre-release suffix (`-rc.n`) publish immediately as pre-releases. Stable versions require signing credentials, verify signatures, and are published as **drafts** until the signed-update drill below has been recorded.

Pushing a `v*` tag by hand still works; the tag must equal the `package.json` version. Pushes to `main` that do not change the version never release. GitHub Pages redeploys the web app on every push to `main`.

## Configure signing securely

Configure these in [repository Actions secrets](https://github.com/ferax564/OrgFlow/settings/secrets/actions). Do not put certificates, private keys or passwords in issues, commits or chat.

| Setting | Kind | Value to supply |
| --- | --- | --- |
| `CSC_LINK` | Secret | Base64 PKCS#12 Developer ID Application certificate **with private key**, exported from the authorized developer account |
| `CSC_KEY_PASSWORD` | Secret | Its export password |
| `APPLE_ID` | Secret | Apple account authorized to notarize for the certificate team |
| `APPLE_APP_SPECIFIC_PASSWORD` | Secret | Notarization app-specific password |
| `APPLE_TEAM_ID` | Secret | Developer ID certificate's team |
| `WIN_CSC_LINK` | Secret | Supported Windows code-signing certificate with private key, in the builder's PKCS#12 format |
| `WIN_CSC_KEY_PASSWORD` | Secret | Its export password |
| `WIN_PUBLISHER_NAME` | Repository variable | Exact Windows certificate simple publisher name, used to verify uploaded executables |

If the Windows certificate uses a hardware token or a cloud signing service, configure that provider's builder signing integration instead of attempting to export its non-exportable key. The current workflow expects PKCS#12; it does not claim cloud/HSM support.

The workflow checks required credentials before stable builds and verifies the actual distributables before upload. macOS verification extracts the final ZIP, checks the Developer ID/team and nested signatures, validates the stapled notarization ticket, and checks Gatekeeper. Windows verifies both the installer and portable executable with Authenticode, requires a timestamp and checks the configured publisher. Unsigned/invalid artifacts fail. These commands cannot create certificates or establish the publisher's legal identity.

```bash
npm run verify:release -- dist
```

Run on each respective build OS with the expected identity environment variables. Windows verification and successful notarization still require a credentialed build; checking that an unsigned artifact is rejected is only a negative test.

## Actual signed-update drill

Use an approved staging release feed and disposable Windows/macOS/Linux machines. Build and sign two successive versions with the same publisher identity, production fuses, updater and document code. Do not alter a published production tag or replace its assets to simulate an upgrade. Windows must use the installed NSIS edition; Linux must run its AppImage. On macOS verify both Intel and Apple Silicon target support.

1. Install version N and create a non-sensitive fixture containing multiple scenarios, photos, branding, saved views, budgets, dated staffing, a recovery checkpoint and a linked `.orgflow` document. Export a baseline bundle. Preserve the app-data directory.
2. Publish N+1 to the staging feed with matching update manifests/blockmaps. Through the installed UI, check, download, and save/restart. Verify the running version changed and compare planning, branding, views and checkpoints against the baseline. Test edits and reopening the linked file after restart.
3. Repeat with the download interrupted, then retried; with linked-file access revoked; with an externally modified file; and with recovery storage made unwritable. Failed saves must block restart, errors must remain visible, and the original workspace must remain recoverable.
4. If testing enterprise mode, queue edits while the test host is unavailable, restart, reconnect and confirm one authorized replay or an explicit recoverable conflict. Never use real employee data for this drill.
5. Retain OS versions, both artifact versions/hashes, signature reports, before/after documents, updater logs and outcomes. Only promote a stable release after these checks and the ordinary CI matrix pass. Existing mocked updater tests do not count as this drill.

A staging feed, signed builds and target machines have not been supplied/configured in this checkout. This procedure is not recorded as executed.

## Validate the actual deployment

For the public static site:

```bash
npm run check:deployment -- https://ferax564.github.io/OrgFlow/ static
```

For a supplied enterprise HTTPS host:

```bash
npm run check:deployment -- https://orgflow.example.com/ enterprise
```

The check is read-only and refuses plain HTTP. It checks the served planner/assets against the checkout; enterprise mode also checks readiness, OIDC mode, denial of unauthenticated data access and denial of private files. Run against the exact source revision being deployed.

Enterprise validation additionally requires an approved test account: actual provider login/logout, role and tenant access, durable save/reload, session expiry and a restore into a separate data directory/host using `npm run backup`. Test external backup retention and encryption, configure monitoring, and load-test the intended organization size. Never restore over the live production database. Public read-only probes cannot verify these authenticated or operational properties.
