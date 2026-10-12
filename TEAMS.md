# OrgFlow in Microsoft Teams: administrator guide

The OrgFlow Teams app is a personal tab (**Workplace**: My week, Vacation, Book a desk, Team, Approvals) plus a notification-only bot. It embeds the same OrgFlow screens and server rules as the browser, so everything works in Teams desktop and Teams web. On mobile, or wherever embedding is unavailable, people use `https://<host>/workplace.html` in a browser.

## 1. Hosting and embedding

- Run the OrgFlow enterprise host (`npm run start:enterprise`) in production mode: `AUTH_MODE=oidc`, `SECURE_COOKIES=1`, HTTPS `PUBLIC_URL` (see [server/README.md](server/README.md)). Teams only embeds HTTPS pages, and the public address must be reachable from employees' Teams clients.
- `workplace.html` and `teams/auth-start.html` / `teams/auth-end.html` are the only pages that may be framed. They send `Content-Security-Policy: frame-ancestors` for Teams and Microsoft 365 (`teams.microsoft.com`, `*.teams.microsoft.com`, `teams.cloud.microsoft`, `*.cloud.microsoft`, `*.office.com`, `*.microsoft365.com`, `*.skype.com`). All other pages keep `X-Frame-Options: DENY`. Make sure your reverse proxy does not add `X-Frame-Options` to those three pages.
- The tab does not rely on cookies inside Teams (browsers often block them in frames). After sign-in it sends a signed OrgFlow session in the `X-OrgFlow-Session` header. Sessions last 12 hours.
- The Teams JavaScript SDK is served from the host itself (`js/vendor/MicrosoftTeams.min.js`, version 2.56.0, MIT licence), so no CDN access is needed.
- Outbound from the host: `login.microsoftonline.com` (sign-in keys, bot token), `login.botframework.com` (bot keys) and the Bot Framework service URLs (`smba.trafficmanager.net`, `*.botframework.com`). Inbound: Bot Framework calls `https://<host>/api/teams/messages`.

## 2. Authentication and permissions

Teams users sign in with the company's Microsoft Entra ID account. OrgFlow validates every token on the server (signature against Entra's published keys, issuer, audience, expiry, tenant and the `access_as_user` scope) and maps the user's immutable object ID to their OrgFlow member. A name, email or employee ID sent by the client is never trusted on its own. The first time, the member is found by the user principal name from the validated token; the account must already be a member (or be auto-enrolled, below), and the Entra tenant must be the configured one.

**Register one app in Microsoft Entra ID** (App registrations → New registration, *single tenant*):

1. **Expose an API**: set the Application ID URI to `api://<host>/<client-id>` (for example `api://orgflow.example.com/aaaaaaaa-…`). Add the scope `access_as_user` (admins and users can consent).
2. **Authorized client applications** for that scope: Teams desktop and mobile `1fec8e78-bce4-4aaf-ab1b-5451cc387264` and Teams web `5e3ce6c0-2b1f-4285-8d4b-75ee78787346`.
3. **API permissions**: Microsoft Graph delegated `openid` and `profile` only. OrgFlow does not call Microsoft Graph and does not read chats, mail, calendars or files.
4. Optionally set `"accessTokenAcceptedVersion": 2` in the app manifest. OrgFlow accepts both v1 and v2 tokens.

**Fallback sign-in**: when single sign-on cannot complete (for example consent was not granted yet), the tab offers **Sign in**, which opens a Teams pop-up running OrgFlow's normal company sign-in (`/auth/login`, your configured OIDC provider) and hands the session back to the tab. No extra redirect URI is needed beyond the existing `KEYCLOAK_REDIRECT_URI` (`/auth/callback`). If your OIDC provider is not Entra ID, the email it returns must match the member's email.

**Who may use the app**: only OrgFlow members. Invite people on the Admin page (role **employee** gives scheduling only) and link each to their employee ID. Alternatively set `WORKPLACE_AUTO_ENROLL=true`: a validated sign-in from your tenant whose email matches exactly one unlinked employee in Current (an `email` field on the person record) gets a scheduling-only membership automatically. Everyone else is refused.

## 3. Notification bot

1. In Azure, create an **Azure Bot** resource, type *Single tenant*, with a Microsoft App ID (a new app registration or the one above) and a client secret.
2. Messaging endpoint: `https://<host>/api/teams/messages`. Enable the **Microsoft Teams** channel.
3. The bot needs no Graph permissions. It is notification-only: it receives installation events (to know where to send personal messages) and sends messages; it does not read or answer chats.

The host validates every Bot Framework request (signature, issuer `https://api.botframework.com`, audience = bot ID, the token's service URL, the channel endorsement and your tenant ID). When the app is installed for a person, OrgFlow stores that personal conversation and looks up the installer's principal name through the bot connector to link them to their member account, so notifications work even before they open the tab.

Messages contain one line ("A vacation request is awaiting your review.") and two buttons, **Open in Teams** (a deep link to the OrgFlow tab and the right record) and **Open in browser**. No names, dates or notes are sent. Approval happens on the OrgFlow screen. The in-app list is authoritative: delivery is an outbox with up to six attempts and exponential backoff on network or server errors, an interrupted send is never repeated, and a failure leaves everything visible in OrgFlow. People who have not installed the app are skipped.

## 4. Configure the host

```bash
TEAMS_TENANT_ID=<directory (tenant) ID>
TEAMS_CLIENT_ID=<app registration client ID>
TEAMS_APP_ID_URI=api://orgflow.example.com/<client ID>
TEAMS_APP_ID=<Teams app ID from the manifest; used for deep links>
TEAMS_BOT_ID=<bot Microsoft App ID>          # optional: without it there are no Teams messages
TEAMS_BOT_PASSWORD=<bot client secret>
# Optional
WORKPLACE_AUTO_ENROLL=true
```

`/api/meta` reports whether Teams sign-in and notifications are enabled. Without `TEAMS_TENANT_ID` and `TEAMS_CLIENT_ID` the Teams endpoints return 404 and the tab falls back to the pop-up sign-in.

## 5. Build the app package

```bash
npm run teams:package -- \
  --app-id <new GUID for the Teams app> \
  --public-url https://orgflow.example.com \
  --client-id <app registration client ID> \
  --bot-id <bot app ID> \
  --company "Example AG" --privacy-url https://example.com/privacy --terms-url https://example.com/terms
```

This writes `dist/teams/manifest.json` and `dist/teams/orgflow-teams.zip` (manifest schema 1.17, the personal tab, the notification-only bot, `webApplicationInfo` for single sign-on, and the icons). Omit `--bot-id` for a sign-in-only package. Increase `--version` whenever you upload a changed package.

## 6. Install for employees and managers

1. **Teams admin center → Teams apps → Manage apps → Upload new app**, choose `orgflow-teams.zip`.
2. Allow the app in the relevant **permission policies**.
3. To install it for everyone, add OrgFlow under **Setup policies → Installed apps**. To also pin it to the left rail, add it under **Pinned apps** in the same policy (optional). Otherwise people install it from **Apps → Built for your org**.
4. The first time someone opens the tab, Teams may ask them to consent to sign-in unless an administrator granted consent for the organization (Entra ID → Enterprise applications → OrgFlow → Permissions → Grant admin consent).

Managers use the same app; the **Approvals** view appears for anyone with people reporting to them.

## 7. Checks after deployment

- Open the tab in Teams desktop and Teams web: My week loads without a sign-in prompt.
- Submit a vacation request as an employee: the manager gets a Teams message, **Open in Teams** opens the request in the tab, and approval there notifies the employee.
- `GET /api/meta` shows `teams.sso: true` and `teams.notifications: true`.
- The audit log shows `login` with `via: teams-sso`.
