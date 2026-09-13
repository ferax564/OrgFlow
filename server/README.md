# OrgFlow enterprise host

The public site (`index.html` / `app.html` on GitHub Pages or here.now) stays **browser-only**. This Node host is optional: one shared workspace per tenant, login, then OrgFlow decides what each person may see.

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

## Start with Keycloak (production)

```bash
docker compose up
AUTH_MODE=oidc SESSION_SECRET=$(openssl rand -hex 32) \
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

The first OIDC user on an empty tenant becomes admin. After that, only admins add emails on `/admin.html`.

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
