# OrgFlow enterprise host

The public site (`index.html` / `app.html` on [GitHub Pages](https://ferax564.github.io/OrgFlow/)) stays **browser-only**. This Node host is optional: one shared workspace per tenant, login, then OrgFlow decides what each person may see.

## Start locally (no Keycloak)

Requires Node 22+ (`node:sqlite`). Default auth is local email sign-in. Do not run Keycloak for this.

```bash
npm run start:enterprise
```

Then open http://127.0.0.1:8787/login.html

- Any email works.
- The **first** sign-in is always **admin** (even if you pick viewer).
- Later emails can sign in as editor or viewer. They cannot make themselves admin.
- Bound to `127.0.0.1` so the port is not on the LAN.
- Data: `data/orgflow.sqlite` (gitignored).

`AUTH_MODE=dev` is the default. **Do not deploy that mode** to a public address — anyone who can reach `/auth/dev/login` can create a session.

## Test with local Keycloak

```bash
docker compose up
AUTH_MODE=oidc ALLOW_INSECURE_OIDC=true BOOTSTRAP_ADMIN_EMAIL=admin@example.com SESSION_SECRET=$(openssl rand -hex 32) \
  KEYCLOAK_ISSUER=http://localhost:8080/realms/orgflow \
  KEYCLOAK_CLIENT_ID=orgflow KEYCLOAK_CLIENT_SECRET=orgflow-dev-secret \
  KEYCLOAK_REDIRECT_URI=http://127.0.0.1:8787/auth/callback \
  PUBLIC_URL=http://127.0.0.1:8787 HOST=127.0.0.1 \
  node server/index.js
```

- Keycloak: http://localhost:8080 (`admin` / `admin`)
- OrgFlow: http://127.0.0.1:8787/auth/login
- Imported user: `admin@example.com` / `admin`
- OIDC will not start without `KEYCLOAK_ISSUER` and a real `SESSION_SECRET`
- `AUTH_MODE=oidc` disables `/auth/dev/login`

Only the verified email in `BOOTSTRAP_ADMIN_EMAIL` can initialize an empty production tenant. All other users require an invitation from an administrator. OIDC verifies provider signatures, issuer, audience, expiry, nonce, state, PKCE, and the verified email; login state is bound to the initiating browser.

On AWS: Node 22 container, Keycloak in the VPC, HTTPS `PUBLIC_URL`, `SECURE_COOKIES=1`, `HOST=0.0.0.0`, volume on `/app/data`.

## Roles

| Role | Load | Save | Replace examples | Members / audit |
| --- | --- | --- | --- | --- |
| admin | yes | yes | yes | yes |
| editor | yes | yes (whole org, or subtree if scoped) | no | no |
| viewer | yes | no | no | no |

**Export** is a separate flag. A viewer can be allowed to download; an editor can be denied.

**Subtree scope** is a position id (Harbor `POS-003` = Head of Engineering). The API never sends other seats or names. Scoped saves merge back into that branch only.

## MCP (Cursor / Claude)

On `/admin.html` create a token:

```json
{
  "mcpServers": {
    "orgflow": {
      "command": "node",
      "args": ["server/mcp-stdio.js"],
      "env": {
        "ORGFLOW_API_URL": "http://127.0.0.1:8787",
        "ORGFLOW_API_TOKEN": "ofk_..."
      }
    }
  }
}
```

Read tools: `get_org`, `search_positions`, `get_person`, `span_of_control`, `dotted_lines`, `list_vacancies`, `diff_scenarios`. Same ACL as the planner.

## What the host refuses

- Tampered session cookies and unknown API tokens
- Path traversal into `server/`, `data/`, `.git`, tests
- Oversized bodies (12 MB workspace cap)
- Invalid JSON (400, not a crash)
- Viewers saving; people without export downloading
- Last-admin demotion or removal
- Self-promotion to admin after the first local user
- Stale saves (409 version conflict)
- Dev sign-in when `AUTH_MODE=oidc`

Load, save, and export are written to the audit log.

## Version 2.1 management safeguards

See [Management guide](../MANAGEMENT.md) for version-required writes, transactional decision/audit updates, proposal-only AI/API writes, dated subtree access, forecast assumptions, and browser test commands. Node 22.16+ is required. The stdio MCP bridge now uses newline-delimited JSON-RPC; `ORGFLOW_ALLOW_PROPOSALS=true` explicitly enables Draft proposal creation for authorized unscoped editors/admins. The default remains read-only.

## Production operations

Use Node 22.16+ behind an HTTPS reverse proxy. Configure `AUTH_MODE=oidc`, `PUBLIC_URL`, `KEYCLOAK_REDIRECT_URI`, an HTTPS issuer, `SECURE_COOKIES=1`, and a random `SESSION_SECRET` of at least 32 characters. Non-loopback dev authentication and insecure production configuration fail at startup. Do not use the demonstration Keycloak passwords or client secret. The container runs as `node`; make its persistent `/app/data` volume writable by that user. Keep the database volume outside disposable containers.

`GET /healthz` and `/readyz` check the database. Graceful SIGTERM closes the listener and database. Expired authentication records are pruned periodically; audit history retains 365 days and idempotency receipts 90 days. Export audit evidence before retention removes it if longer retention is required.

Back up a running database consistently:

```bash
npm run backup -- backup data/orgflow.sqlite /secure-backups/orgflow.sqlite
npm run backup -- restore /secure-backups/orgflow.sqlite /new-data/orgflow.sqlite
```

The destination must not exist. Backups use SQLite's consistent snapshot operation; both commands validate database integrity and workspace schemas. To recover, stop the host, point `DATA_DIR` at the new directory, and restart. Keep encrypted backups outside the host and rehearse restoration regularly. Backups include authentication records: restrict access and rotate sessions/tokens after a security incident.

## Integration contract

`/api/openapi.json` describes routes, models, authentication, version conflicts, and idempotency. Browser writes require a session and same-origin requests. API tokens expire (maximum 90 days), default to `read`, and optionally grant `export` and `propose`; membership restrictions still apply. Tokens cannot administer members, overwrite the workspace, or approve decisions. Legacy tokens migrate to read-only and expire within 30 days. Revoke unused tokens in administration.

Use `Idempotency-Key` when posting proposals: an identical retry returns the original result, and a different request reusing the key fails with 409. Reviewers must be actual unscoped administrators; only assigned reviewers may approve. `/api/reviews` and the administration page show the signed-in reviewer's queue.

The stdio bridge supports newline-delimited JSON-RPC and explicit proposal opt-in. The HTTP `/mcp` endpoint implements the documented request/response subset, not full Streamable HTTP session/SSE support. Use the stdio bridge for clients requiring that transport; do not advertise generic remote MCP interoperability without testing the target client. Notifications receive no JSON-RPC reply. Never expose an API token in a public browser bundle.
