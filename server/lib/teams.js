'use strict';
/** Microsoft Teams: single sign-on for the personal tab and a notification-only bot.
 *  Requested permissions stay at sign-in (openid, profile, email, access_as_user) and bot messaging.
 *  The in-app notification list is authoritative; Teams delivery is an outbox with bounded retries. */
const jwt = require('./jwt');

const TEAMS_CLIENTS = ['1fec8e78-bce4-4aaf-ab1b-5451cc387264', '5e3ce6c0-2b1f-4285-8d4b-75ee78787346'];
const SERVICE_HOSTS = ['smba.trafficmanager.net', '.botframework.com', '.teams.microsoft.com', '.botframework.azure.us', '.teams.microsoft.us'];

function teamsConfig(env = process.env) {
  const tenantId = String(env.TEAMS_TENANT_ID || '').trim(), clientId = String(env.TEAMS_CLIENT_ID || '').trim();
  const botId = String(env.TEAMS_BOT_ID || '').trim(), botPassword = String(env.TEAMS_BOT_PASSWORD || '');
  return {
    tenantId, clientId, appIdUri: String(env.TEAMS_APP_ID_URI || '').trim(), appId: String(env.TEAMS_APP_ID || '').trim(), botId, botPassword,
    authority: String(env.TEAMS_AUTHORITY || 'https://login.microsoftonline.com').replace(/\/$/, ''),
    botOpenId: env.TEAMS_BOT_OPENID || 'https://login.botframework.com/v1/.well-known/openidconfiguration',
    serviceHosts: env.TEAMS_SERVICE_HOSTS ? env.TEAMS_SERVICE_HOSTS.split(',').map(x => x.trim()).filter(Boolean) : SERVICE_HOSTS,
    allowHttpServiceUrl: env.TEAMS_ALLOW_HTTP_SERVICE_URL === 'true',
    autoEnroll: env.WORKPLACE_AUTO_ENROLL === 'true',
    // Entra client IDs allowed to exchange a token: Teams desktop/mobile and web, plus any listed extras.
    allowedClients: [...TEAMS_CLIENTS, ...String(env.TEAMS_ALLOWED_CLIENT_IDS || '').split(',').map(x => x.trim()).filter(Boolean)],
    ssoEnabled: Boolean(tenantId && clientId),
    botEnabled: Boolean(tenantId && botId && botPassword)
  };
}

function createTeams({ cfg, store, workplace, publicUrl, fetchImpl = (...args) => fetch(...args), now = () => Date.now() }) {
  const db = store.db, T = store.tenantId;
  const ssoKeys = jwt.keySet({ jwksUri: `${cfg.authority}/${cfg.tenantId}/discovery/v2.0/keys`, fetchImpl, now });
  const botKeys = jwt.keySet({ openIdConfiguration: cfg.botOpenId, fetchImpl, now });
  const identity = oid => `entra:${cfg.tenantId}:${oid}`;

  // ---- Single sign-on --------------------------------------------------------------------
  async function validateSso(token) {
    if (!cfg.ssoEnabled) throw Object.assign(new Error('Teams sign-in is not configured on this host.'), { status: 404 });
    const claims = await jwt.verify(token, {
      keys: ssoKeys, now,
      issuers: [`${cfg.authority}/${cfg.tenantId}/v2.0`, `https://sts.windows.net/${cfg.tenantId}/`],
      audiences: [cfg.clientId, cfg.appIdUri, `api://${cfg.clientId}`].filter(Boolean)
    });
    if (claims.tid !== cfg.tenantId) throw Object.assign(new Error('This Microsoft 365 organization is not allowed.'), { status: 403 });
    if (!String(claims.scp || '').split(' ').includes('access_as_user')) throw Object.assign(new Error('Token lacks the access_as_user scope.'), { status: 401 });
    if (!claims.oid) throw Object.assign(new Error('Token has no object ID.'), { status: 401 });
    // The API scope is pre-authorized for Teams; a token another application obtained is not a Teams sign-in.
    const client = claims.azp || claims.appid;
    if (!(cfg.allowedClients || TEAMS_CLIENTS).includes(client)) throw Object.assign(new Error('Token was not issued to Microsoft Teams.'), { status: 401 });
    return claims;
  }
  /** Maps a validated Entra ID user to their OrgFlow member. The tenant is the company's own
   *  directory, so its user principal name is used once to find the invited member; later
   *  sign-ins use the immutable object ID. Nothing the client sends besides the signed token counts. */
  async function signIn(token) {
    const claims = await validateSso(token);
    let user = store.userForIdentity(identity(claims.oid));
    if (!user) {
      const email = String(claims.preferred_username || claims.upn || claims.email || '').trim().toLowerCase();
      let member = email.includes('@') ? store.memberByEmail(email) : null;
      if (!member && cfg.autoEnroll && email.includes('@')) {
        const matches = workplace.org().findByEmail(email).filter(e => !workplace.userForEmployee(e.id));
        if (matches.length === 1) {
          member = store.putMembership({ email, name: claims.name || email, role: 'employee', employeeId: matches[0].id });
          store.audit({ userId: member.user_id, action: 'workplace.enroll', detail: { employeeId: matches[0].id, via: 'teams' } });
        }
      }
      if (!member) throw Object.assign(new Error('Signed in with Microsoft, but you are not a member of this OrgFlow organization. Ask an administrator to add you.'), { status: 403, code: 'not_member' });
      store.linkIdentity(identity(claims.oid), member.user_id);
      user = { id: member.user_id, email: member.email, name: member.name };
    }
    const membership = store.getMembership(user.id);
    if (!membership) throw Object.assign(new Error('Your OrgFlow membership was removed.'), { status: 403, code: 'not_member' });
    store.audit({ userId: user.id, action: 'login', detail: { via: 'teams-sso' } });
    return { user, membership };
  }

  // ---- Bot: conversation references from installation events ------------------------------------
  function trustedServiceUrl(value) {
    let u;
    try { u = new URL(value); } catch { return false; }
    if (u.protocol !== 'https:' && !(cfg.allowHttpServiceUrl && u.protocol === 'http:')) return false;
    return cfg.serviceHosts.some(h => h.startsWith('.') ? u.hostname.endsWith(h) : u.hostname === h);
  }
  async function receiveActivity(authorization, activity) {
    if (!cfg.botEnabled) throw Object.assign(new Error('The Teams notification bot is not configured.'), { status: 404 });
    const bearer = String(authorization || '').match(/^Bearer\s+(\S+)$/i);
    if (!bearer) throw Object.assign(new Error('Missing bot token.'), { status: 401 });
    if (!activity || typeof activity !== 'object' || typeof activity.serviceUrl !== 'string') throw Object.assign(new Error('Invalid activity.'), { status: 400 });
    const claims = await jwt.verify(bearer[1], {
      keys: botKeys, now, issuers: ['https://api.botframework.com'], audiences: [cfg.botId],
      keyCheck: jwk => { if (Array.isArray(jwk.endorsements) && activity.channelId && !jwk.endorsements.includes(activity.channelId)) throw Object.assign(new Error('Signing key is not endorsed for this channel.'), { status: 401 }); }
    });
    if ((claims.serviceurl || claims.serviceUrl) !== activity.serviceUrl) throw Object.assign(new Error('Service URL does not match the token.'), { status: 401 });
    if (!trustedServiceUrl(activity.serviceUrl)) throw Object.assign(new Error('Untrusted service URL.'), { status: 403 });
    if (activity.channelData?.tenant?.id !== cfg.tenantId) throw Object.assign(new Error('This Microsoft 365 organization is not allowed.'), { status: 403 });
    const oid = activity.from?.aadObjectId, personal = activity.conversation?.conversationType === 'personal';
    if (oid && personal && activity.conversation?.id) {
      if (activity.type === 'installationUpdate' && /^remove/.test(activity.action || '')) db.prepare('DELETE FROM teams_conversations WHERE tenant_id = ? AND aad_object_id = ?').run(T, oid);
      else db.prepare('INSERT INTO teams_conversations (tenant_id, aad_object_id, conversation_id, service_url, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, aad_object_id) DO UPDATE SET conversation_id = excluded.conversation_id, service_url = excluded.service_url, updated_at = excluded.updated_at')
        .run(T, oid, activity.conversation.id, activity.serviceUrl, new Date(now()).toISOString());
      if (activity.from.id && !store.userForIdentity(identity(oid))) await linkInstaller(activity).catch(() => {});
    }
    return {};
  }
  /** Apps installed by policy reach people who may never open the tab. The connector's member lookup
   *  (bot token, no Graph permission) gives the installer's principal name, which links them once. */
  async function linkInstaller(activity) {
    const res = await fetchImpl(`${activity.serviceUrl.replace(/\/$/, '')}/v3/conversations/${encodeURIComponent(activity.conversation.id)}/members/${encodeURIComponent(activity.from.id)}`, { headers: { authorization: 'Bearer ' + await botToken() } });
    if (!res.ok) return;
    const member = await res.json();
    if (member.aadObjectId !== activity.from.aadObjectId) return;
    const found = store.memberByEmail(String(member.userPrincipalName || member.email || '').toLowerCase());
    if (found) { store.linkIdentity(identity(activity.from.aadObjectId), found.user_id); store.audit({ userId: found.user_id, action: 'teams.install', detail: { linked: true } }); }
  }

  // ---- Outbound ------------------------------------------------------------------------------
  let token = null;
  async function botToken() {
    if (token && token.expires > now() + 300000) return token.value;
    const res = await fetchImpl(`${cfg.authority}/${cfg.tenantId}/oauth2/v2.0/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.botId, client_secret: cfg.botPassword, scope: 'https://api.botframework.com/.default' }).toString() });
    if (!res.ok) throw Object.assign(new Error('Bot sign-in failed (' + res.status + ').'), { retryable: res.status >= 500 || res.status === 429 });
    const body = await res.json();
    token = { value: body.access_token, expires: now() + (Number(body.expires_in) || 3600) * 1000 };
    return token.value;
  }
  function links(route) {
    const web = `${publicUrl}/workplace.html#${route}`;
    const teams = cfg.appId ? `https://teams.microsoft.com/l/entity/${encodeURIComponent(cfg.appId)}/workplace?webUrl=${encodeURIComponent(web)}&label=OrgFlow&context=${encodeURIComponent(JSON.stringify({ subEntityId: route }))}` : '';
    return { web, teams };
  }
  /** Minimal content: a one-line title and links to the authenticated screen. No names, dates or notes. */
  function card(title, route) {
    const { web, teams } = links(route);
    return {
      type: 'message', summary: title, attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: {
        type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4',
        body: [{ type: 'TextBlock', text: 'OrgFlow', weight: 'Bolder', size: 'Small', isSubtle: true }, { type: 'TextBlock', text: title, wrap: true }],
        actions: [...(teams ? [{ type: 'Action.OpenUrl', title: 'Open in Teams', url: teams }] : []), { type: 'Action.OpenUrl', title: 'Open in browser', url: web }]
      } }]
    };
  }
  function conversationFor(userId) {
    const prefix = `entra:${cfg.tenantId}:`;
    for (const row of db.prepare('SELECT issuer_sub FROM user_identities WHERE user_id = ?').all(userId)) {
      if (!row.issuer_sub.startsWith(prefix)) continue;
      const conv = db.prepare('SELECT * FROM teams_conversations WHERE tenant_id = ? AND aad_object_id = ?').get(T, row.issuer_sub.slice(prefix.length));
      if (conv) return conv;
    }
    return null;
  }
  async function send(conv, activity) {
    if (!trustedServiceUrl(conv.service_url)) throw Object.assign(new Error('Untrusted service URL.'), { retryable: false });
    let res;
    try {
      res = await fetchImpl(`${conv.service_url.replace(/\/$/, '')}/v3/conversations/${encodeURIComponent(conv.conversation_id)}/activities`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + await botToken() }, body: JSON.stringify(activity) });
    } catch (error) { throw Object.assign(new Error(error.message || 'Network error'), { retryable: error.retryable !== false }); }
    if (res.status === 401) token = null;
    if (!res.ok) throw Object.assign(new Error('Teams returned ' + res.status), { retryable: res.status >= 500 || res.status === 429 || res.status === 401 });
  }
  let running = null;
  /** Each notification is sent at most once: a claimed row is never resent after an interrupted
   *  attempt (it becomes "uncertain"), and only definite failures are retried with backoff. */
  async function deliverPending({ limit = 25 } = {}) {
    if (!cfg.botEnabled) return { sent: 0 };
    if (running) return running;
    running = (async () => {
      const at = new Date(now()).toISOString(), stats = { sent: 0, retry: 0, failed: 0, skipped: 0 };
      db.prepare("UPDATE notification_deliveries SET status = 'uncertain', last_error = 'Interrupted while sending; not retried to avoid a duplicate message.' WHERE status = 'sending' AND lease_until < ?").run(at);
      const due = db.prepare(`SELECT d.notification_id, d.attempts, n.user_id, n.title, n.route FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
        WHERE d.channel = 'teams' AND d.status IN ('pending','retry') AND d.next_attempt_at <= ? AND n.tenant_id = ? ORDER BY d.next_attempt_at LIMIT ?`).all(at, T, limit);
      for (const row of due) {
        const claimed = db.prepare("UPDATE notification_deliveries SET status = 'sending', lease_until = ?, attempts = attempts + 1 WHERE notification_id = ? AND status IN ('pending','retry')").run(new Date(now() + 120000).toISOString(), row.notification_id);
        if (!claimed.changes) continue;
        const conv = conversationFor(row.user_id);
        if (!conv) { db.prepare("UPDATE notification_deliveries SET status = 'skipped', last_error = 'Recipient has not installed the OrgFlow Teams app or not signed in from Teams yet.' WHERE notification_id = ?").run(row.notification_id); stats.skipped++; continue; }
        try {
          await send(conv, card(row.title, row.route));
          db.prepare("UPDATE notification_deliveries SET status = 'sent', sent_at = ?, last_error = '' WHERE notification_id = ?").run(new Date(now()).toISOString(), row.notification_id);
          stats.sent++;
        } catch (error) {
          const attempts = row.attempts + 1, retry = error.retryable && attempts < 6;
          db.prepare('UPDATE notification_deliveries SET status = ?, next_attempt_at = ?, last_error = ? WHERE notification_id = ?')
            .run(retry ? 'retry' : 'failed', new Date(now() + 30000 * 2 ** attempts).toISOString(), String(error.message).slice(0, 300), row.notification_id);
          stats[retry ? 'retry' : 'failed']++;
        }
      }
      return stats;
    })().finally(() => { running = null; });
    return running;
  }
  function deliveryStatus() {
    return db.prepare("SELECT d.status, COUNT(*) AS n FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id WHERE n.tenant_id = ? GROUP BY d.status").all(T);
  }
  let timer = null, kicked = false;
  function start() {
    if (!cfg.botEnabled || timer) return;
    const log = error => console.error(JSON.stringify({ level: 'error', event: 'teams_delivery_failed', message: error.message }));
    workplace.hooks.afterNotify = () => { if (kicked) return; kicked = true; setImmediate(() => { kicked = false; deliverPending().catch(log); }); };
    timer = setInterval(() => deliverPending().catch(log), 30000);
    timer.unref();
  }
  function stop() { clearInterval(timer); timer = null; }

  return { cfg, validateSso, signIn, receiveActivity, deliverPending, deliveryStatus, card, links, start, stop, TEAMS_CLIENTS };
}

module.exports = { teamsConfig, createTeams, TEAMS_CLIENTS };
