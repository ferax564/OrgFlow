# OrgFlow enterprise host

The public site (`index.html` / `app.html` on GitHub Pages or here.now) stays **browser-only**. This Node host is an optional private deployment: one shared workspace per tenant, Keycloak for sign-in, OrgFlow for authorization.

## Run locally (no Keycloak)

Requires Node 22+ (`node:sqlite`).

```bash
cp .env.example .env
AUTH_MODE=dev node server/index.js
```

Open http://127.0.0.1:8787/login.html and sign in with any email. The first user becomes admin. Then open `/app.html`.

## Run with Keycloak

```bash
docker compose up
AUTH_MODE=oidc KEYCLOAK_ISSUER=http://localhost:8080/realms/orgflow \
  KEYCLOAK_CLIENT_ID=orgflow KEYCLOAK_CLIENT_SECRET=orgflow-dev-secret \
  KEYCLOAK_REDIRECT_URI=http://127.0.0.1:8787/auth/callback \
  PUBLIC_URL=http://127.0.0.1:8787 node server/index.js
```

- Keycloak: http://localhost:8080 (`admin` / `admin`)
- OrgFlow: http://127.0.0.1:8787/auth/login
- Imported user: `admin@example.com` / `admin`

The first person who signs in with OIDC and has no members yet is granted **admin**. After that, only admins can add emails on `/admin.html`.

On AWS: run this container (ECS/Fargate or EC2), put Keycloak in the same VPC, set `PUBLIC_URL` and `KEYCLOAK_REDIRECT_URI` to the HTTPS origin, `SECURE_COOKIES=1`, and mount `/app/data` on a volume. SQLite is the default store; one organization per process.

## Roles

| Role | Load workspace | Save | Replace from examples | Manage members / audit |
| --- | --- | --- | --- | --- |
| admin | yes | yes | yes | yes |
| editor | yes | yes (whole org, or subtree if scoped) | no | no |
| viewer | yes | no | no | no |

**Export** is a separate flag (`can_export`). A viewer can be allowed to download PDF/CSV/JSON; an editor can be denied.

**Subtree scope** is a position id (for example Harbor `POS-003` = Head of Engineering). The API **strips every other seat and person** before the browser or MCP sees the JSON. Saves from a scoped editor are merged back into that branch only; they cannot retitle the CEO by adding that card locally.

## MCP (Cursor / Claude)

On `/admin.html` create a token, then:

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

Read tools: `get_org`, `search_positions`, `get_person`, `span_of_control`, `dotted_lines`, `list_vacancies`, `diff_scenarios`. They use the same ACL as the planner. Load/save/export are written to the audit log.
