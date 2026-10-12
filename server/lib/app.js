'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { openDatabase, createStore } = require('./db');
const { validateDocument, emptyDocument, MAX_BYTES } = require('./document');
const { filterDocument, mergeDocument, canWriteRole } = require('./subtree');
const query = require('./org-query');
const auth = require('./auth');
const governance = require('./governance');
const Management = require('../../js/management-core');
const OrgFlow = require('../../js/orgflow-core');
const Share = require('../../js/share-export');
const { createWorkplace } = require('./workplace');
const workplaceRoutes = require('./workplace-routes');
const { teamsConfig, createTeams } = require('./teams');

const ROOT = path.resolve(__dirname, '../..');
const APP_VERSION = require('../../package.json').version;
const MCP_PROTOCOL = '2025-11-25';
const EXPORT_KINDS = ['png', 'groups', 'pdf', 'html', 'csv', 'people', 'workspace', 'compare', 'interactive', 'bundle', 'seating-png', 'seating-csv'];

function visExtra(vis, membership, url) {
  return {
    scenario: url?.searchParams?.get('scenario') || vis.doc.planning.activeScenarioId,
    asOf: url?.searchParams?.get('asOf') || undefined,
    serverVersion: APP_VERSION,
    serverDocumentVersion: vis.version,
    scopePositionId: membership.scope_position_id || ''
  };
}

function send(res, status, body, headers = {}) {
  let payload;
  if (Buffer.isBuffer(body)) payload = body;
  else if (typeof body === 'string') payload = Buffer.from(body);
  else payload = Buffer.from(JSON.stringify(body));
  const all = {
    'content-type': headers['content-type'] || 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': headers['cache-control'] || 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    ...headers
  };
  for (const key of Object.keys(all)) if (all[key] == null) delete all[key];
  res.writeHead(status, all);
  res.end(payload);
}

function sendError(res, status, message, extra = {}) {
  send(res, status, { error: message, ...extra });
}

function readBody(req, limit = MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = err => { if (!done) { done = true; reject(err); } };
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        fail(Object.assign(new Error('Request is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', fail);
  });
}

async function readJson(req, res, limit = 16 * 1024) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendError(res, 400, 'JSON object required.');
      return null;
    }
    return parsed;
  } catch {
    sendError(res, 400, 'Body must be JSON.');
    return null;
  }
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.md': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function safeStatic(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent((urlPath || '').split('?')[0]); } catch { return null; }
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (rel.includes('\0') || rel.includes('\\') || rel.split('/').includes('..')) return null;
  const top = rel.split('/')[0];
  const pages = new Set(['index.html','app.html','login.html','admin.html','workplace.html','404.html','manifest.webmanifest','robots.txt','teams/auth-start.html','teams/auth-end.html']);
  if (!pages.has(rel) && !['css','js','assets','examples'].includes(top)) return null;
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  try { if (!fs.realpathSync(abs).startsWith(ROOT + path.sep)) return null; } catch { return null; }
  return abs;
}

/** Pages Microsoft Teams may embed (the personal tab and its sign-in pop-up). Everything else stays unframeable. */
const EMBEDDABLE = new Set(['workplace.html', 'teams/auth-start.html', 'teams/auth-end.html']);
const TEAMS_FRAME_ANCESTORS = "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://teams.cloud.microsoft https://*.cloud.microsoft https://*.office.com https://*.microsoft365.com https://*.skype.com";
function frameHeaders(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  return EMBEDDABLE.has(rel) ? { 'x-frame-options': null, 'content-security-policy': TEAMS_FRAME_ANCESTORS } : {};
}
/** Where sign-in may send the browser afterwards: only our own planner, workplace and Teams pages. */
function safeReturn(value) {
  const v = String(value || '');
  return /^\/(?:app\.html|workplace\.html|teams\/auth-end\.html)(?:[?#][^\s]*)?$/.test(v) && !v.includes('//') ? v : '';
}
function landingFor(membership) { return membership?.role === 'employee' ? '/workplace.html' : '/app.html'; }

const INSECURE_SECRET = 'dev-insecure-orgflow-secret-change-me';

function loadConfig(env = process.env) {
  const authMode = (env.AUTH_MODE || 'dev').toLowerCase() === 'oidc' ? 'oidc' : 'dev';
  const port = Number(env.PORT || 8787);
  const host = env.HOST || (authMode === 'dev' ? '127.0.0.1' : '0.0.0.0');
  return {
    authMode,
    host,
    port,
    publicUrl: (env.PUBLIC_URL || `http://127.0.0.1:${port}`).replace(/\/$/, ''),
    sessionSecret: env.SESSION_SECRET || INSECURE_SECRET,
    secureCookies: env.SECURE_COOKIES === '1' || env.SECURE_COOKIES === 'true',
    issuer: env.KEYCLOAK_ISSUER || '',
    clientId: env.KEYCLOAK_CLIENT_ID || 'orgflow',
    clientSecret: env.KEYCLOAK_CLIENT_SECRET || '',
    redirectUri: env.KEYCLOAK_REDIRECT_URI || '',
    tenantName: env.TENANT_NAME || 'Organization',
    tenantSlug: env.TENANT_SLUG || 'default',
    bootstrapAdminEmail: String(env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase(),
    allowInsecureOidc: env.ALLOW_INSECURE_OIDC === 'true',
    dataDir: env.DATA_DIR || path.join(ROOT, 'data')
  };
}

function assertProductionConfig(cfg) {
  if (cfg.authMode !== 'oidc') {
    if (!['localhost','127.0.0.1','::1'].includes(cfg.host)) throw new Error('Development authentication must bind to loopback.');
    return;
  }
  if (!cfg.issuer) throw new Error('KEYCLOAK_ISSUER is required when AUTH_MODE=oidc.');
  if (!cfg.sessionSecret || cfg.sessionSecret === INSECURE_SECRET) {
    throw new Error('SESSION_SECRET must be set to a long random value when AUTH_MODE=oidc.');
  }
  if (!['localhost','127.0.0.1','[::1]'].includes(new URL(cfg.publicUrl).hostname)) {
    if (!cfg.secureCookies || !cfg.publicUrl.startsWith('https:') || cfg.sessionSecret.length < 32 || !cfg.issuer.startsWith('https:')) throw new Error('Production OIDC requires HTTPS, secure cookies and a session secret of at least 32 characters.');
  }
}

function visibleDocument(store, membership) {
  const row = store.getWorkspaceRow();
  const doc = JSON.parse(row.document);
  const filtered = filterDocument(doc, membership.scope_position_id || '');
  return { doc: filtered, version: row.version, updatedAt: row.updated_at, stored: doc };
}

function identityFromReq(req, store, cfg) {
  const bearer = (req.headers.authorization || '').match(/^Bearer\s+(\S+)/i);
  if (bearer) {
    const token = store.findToken(bearer[1]);
    if (!token) return { error: 401, message: 'Invalid API token.' };
    const membership = store.getMembership(token.user_id);
    if (!membership) return { error: 403, message: 'This token is not a member of the organization.' };
    const scopes=JSON.parse(token.scopes);
    return { user: { id: token.user_id, email: token.email, name: token.name }, membership:{...membership,can_export:membership.can_export&&scopes.includes('export')?1:0}, scopes, via: 'token' };
  }
  const cookies = auth.parseCookies(req.headers.cookie);
  // Teams tabs run in a third-party frame where cookies are unreliable; they send the signed session in a header instead.
  // An explicit header always decides, so an unrelated cookie in the same webview can never pick the account.
  const header = typeof req.headers['x-orgflow-session'] === 'string' ? req.headers['x-orgflow-session'] : null;
  const sid = auth.unsignSid(header ?? cookies[auth.COOKIE], cfg.sessionSecret);
  const session = store.getSession(sid);
  if (!session) return { error: 401, message: 'Sign in required.' };
  const membership = store.getMembership(session.user_id);
  if (!membership) return { error: 403, message: 'Signed in, but not a member of this organization.' };
  return { user: { id: session.user_id, email: session.email, name: session.name }, membership, session, via: 'cookie' };
}

function requireMember(req, res, store, cfg) {
  const ident = identityFromReq(req, store, cfg);
  if (ident.error) {
    sendError(res, ident.error, ident.message);
    return null;
  }
  return ident;
}

function setSessionCookie(res, store, userId, cfg) {
  const session = store.createSession(userId);
  return auth.cookieHeader(session.id, cfg.sessionSecret, { secure: cfg.secureCookies, maxAgeSec: 12 * 60 * 60 });
}

async function handleOidcLogin(req, res, store, cfg, oidc, requestUrl) {
  const { verifier, challenge, state, nonce } = auth.pkce();
  store.saveOauthState({
    state,
    nonce,
    returnTo: safeReturn(requestUrl?.searchParams.get('return')),
    codeVerifier: verifier,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
  const url = await auth.authorizationUrl(oidc, {
    redirect_uri: cfg.redirectUri || cfg.publicUrl + '/auth/callback',
    response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: challenge, code_challenge_method: 'S256'
  });
  const binding = `orgflow_oidc=${auth.signSid(state,cfg.sessionSecret)}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=600${cfg.secureCookies?'; Secure':''}`;
  res.writeHead(302, { location: url.toString(), 'cache-control': 'no-store', 'set-cookie': binding });
  res.end();
}

async function handleOidcCallback(req, res, store, cfg, oidc, url, enroll = () => null) {
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const bound=auth.unsignSid(auth.parseCookies(req.headers.cookie).orgflow_oidc,cfg.sessionSecret);
  if (!state || bound !== state) { sendError(res,400,'Sign-in does not belong to this browser. Start again.'); return; }
  const saved = store.takeOauthState(state);
  if (!saved || !code) {
    sendError(res, 400, 'Sign-in state is missing or expired. Start again from /auth/login.');
    return;
  }
  let profile;
  try { profile = await auth.validateCallback(oidc,url,saved); }
  catch { sendError(res,401,'Identity validation failed. Sign in again with a verified account.'); return; }
  const email = String(profile.email || '').trim().toLowerCase();
  if (!email) {
    sendError(res, 400, 'Keycloak did not return an email address for this user.');
    return;
  }
  const user = store.upsertUser({
    issuerSub: cfg.issuer + '#' + profile.sub,
    email,
    name: profile.name || profile.preferred_username || email
  });
  const membership = store.getMembership(user.id) || (email === cfg.bootstrapAdminEmail ? store.ensureMembership(user,{role:'admin'}) : enroll(user, email));
  if (!membership) {
    res.writeHead(302, { location: '/login.html?error=not_member', 'cache-control': 'no-store' });
    res.end();
    return;
  }
  store.audit({ userId: user.id, action: 'login', detail: { via: 'oidc' } });
  res.writeHead(302, {
    location: safeReturn(saved.return_to) || landingFor(membership),
    'set-cookie': [setSessionCookie(res, store, user.id, cfg), 'orgflow_oidc=; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=0'+(cfg.secureCookies?'; Secure':'')],
    'cache-control': 'no-store'
  });
  res.end();
}

function createApp(options = {}) {
  const cfg = { ...loadConfig(options.env || process.env), ...options.config };
  const db = options.db || openDatabase(options.databasePath || (options.memory ? ':memory:' : path.join(cfg.dataDir, 'orgflow.sqlite')));
  const store = options.store || createStore(db, { tenantName: cfg.tenantName, tenantSlug: cfg.tenantSlug });
  let oidcCache = null;
  const workplace = createWorkplace(store, { env: options.env || process.env, now: options.now, channel: null });
  store.workplace = workplace;
  const teamsCfg = { ...teamsConfig(options.env || process.env), ...options.teams };
  workplace.hooks.channel = teamsCfg.botEnabled ? 'teams' : null;
  const teams = createTeams({ cfg: teamsCfg, store, workplace, publicUrl: cfg.publicUrl, fetchImpl: options.fetch, now: options.now ? () => options.now().getTime() : undefined });
  const handleWorkplace = workplaceRoutes.routes(workplace);
  /** Optional (WORKPLACE_AUTO_ENROLL=true): a verified directory account whose email matches exactly one
   *  unlinked employee in Current gets a scheduling-only membership. Everyone else still needs an invitation. */
  function enrollEmployee(user, email) {
    if (!teamsCfg.autoEnroll) return null;
    const matches = workplace.org().findByEmail(email).filter(e => !workplace.userForEmployee(e.id));
    if (matches.length !== 1) return null;
    const member = store.putMembership({ email, name: user.name, role: 'employee', employeeId: matches[0].id, issuerSub: user.issuer_sub });
    store.audit({ userId: user.id, action: 'workplace.enroll', detail: { employeeId: matches[0].id, via: 'oidc' } });
    return member;
  }

  async function oidcConfig() {
    if (!cfg.issuer) throw new Error('KEYCLOAK_ISSUER is not set.');
    if (!oidcCache) oidcCache = await auth.discoverIssuer(cfg.issuer,cfg.clientId,cfg.clientSecret,cfg.allowInsecureOidc||['localhost','127.0.0.1','[::1]'].includes(new URL(cfg.issuer).hostname));
    return oidcCache;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, cfg.publicUrl);
      const method = req.method || 'GET';
      const p = url.pathname;

      if (p === '/healthz' || p === '/readyz') {
        try { if(p==='/readyz')db.prepare('SELECT 1').get();send(res,200,{status:'ok',version:APP_VERSION}); }
        catch { sendError(res,503,'Database unavailable.'); } return;
      }
      if (req.headers.origin && !['GET','HEAD','OPTIONS'].includes(method) && req.headers.origin !== new URL(cfg.publicUrl).origin) { sendError(res,403,'Cross-origin mutation denied.');return; }
      if (p === '/api/meta' && method === 'GET') {
        send(res, 200, {
          enterprise: true,
          auth: cfg.authMode,
          loginUrl: '/auth/login',
          logoutUrl: '/auth/logout',
          teams: { sso: teamsCfg.ssoEnabled, notifications: teamsCfg.botEnabled, appId: teamsCfg.appId || '' }
        });
        return;
      }

      if (p === '/auth/login' && method === 'GET') {
        if (cfg.authMode === 'dev') {
          const back = safeReturn(url.searchParams.get('return'));
          res.writeHead(302, { location: '/login.html' + (back ? '?return=' + encodeURIComponent(back) : ''), 'cache-control': 'no-store' });
          res.end();
          return;
        }
        await handleOidcLogin(req, res, store, cfg, await oidcConfig(), url);
        return;
      }

      if (p === '/auth/callback' && method === 'GET') {
        await handleOidcCallback(req, res, store, cfg, await oidcConfig(), url, enrollEmployee);
        return;
      }

      if (p === '/auth/logout' && (method === 'GET' || method === 'POST')) {
        const cookies = auth.parseCookies(req.headers.cookie);
        const sid = auth.unsignSid(cookies[auth.COOKIE], cfg.sessionSecret);
        store.deleteSession(sid);
        res.writeHead(302, {
          location: cfg.authMode === 'dev' ? '/login.html' : '/auth/login',
          'set-cookie': auth.clearCookieHeader(cfg.secureCookies),
          'cache-control': 'no-store'
        });
        res.end();
        return;
      }

      if (p === '/auth/teams/sso' && method === 'POST') {
        const body = await readJson(req, res, 32 * 1024);
        if (!body) return;
        try {
          const { user, membership } = await teams.signIn(String(body.token || ''));
          const session = store.createSession(user.id);
          send(res, 200, { sessionToken: auth.signSid(session.id, cfg.sessionSecret), expiresAt: session.expiresAt, landing: landingFor(membership), session: auth.publicSession(user, membership, store.getTenant()) });
        } catch (err) {
          if (!err.status) throw err;
          sendError(res, err.status, err.message, { code: err.code });
        }
        return;
      }
      // Hands a signed session to the Teams sign-in pop-up after a normal browser sign-in.
      if (p === '/auth/session-token' && method === 'POST') {
        const ident = requireMember(req, res, store, cfg);
        if (!ident) return;
        if (ident.via !== 'cookie') { sendError(res, 403, 'Browser session required.'); return; }
        const session = store.createSession(ident.user.id);
        store.audit({ userId: ident.user.id, action: 'login', detail: { via: 'teams-popup' } });
        send(res, 200, { sessionToken: auth.signSid(session.id, cfg.sessionSecret), expiresAt: session.expiresAt });
        return;
      }
      if (p === '/api/teams/messages' && method === 'POST') {
        const body = await readJson(req, res, 256 * 1024);
        if (!body) return;
        try { send(res, 200, await teams.receiveActivity(req.headers.authorization, body)); }
        catch (err) { if (!err.status) throw err; sendError(res, err.status, err.message); }
        return;
      }

      if (p === '/auth/dev/login' && method === 'POST') {
        if (cfg.authMode !== 'dev') {
          sendError(res, 404, 'Dev sign-in is disabled.');
          return;
        }
        const body = await readJson(req, res, 64 * 1024);
        if (!body) return;
        const email = String(body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@') || email.length > 200) {
          sendError(res, 400, 'A valid email is required.');
          return;
        }
        const user = store.upsertUser({
          issuerSub: 'dev:' + email,
          email,
          name: String(body.name || email).slice(0, 120)
        });
        const existing = store.getMembership(user.id);
        if (!existing) {
          const count = store.listMembers().length;
          if (count === 0) {
            store.putMembership({
              email,
              name: user.name,
              role: 'admin',
              canExport: true,
              scopePositionId: '',
              issuerSub: 'dev:' + email
            });
          } else {
            const requested = body.role;
            if (requested === 'admin') {
              sendError(res, 403, 'The first local sign-in is admin. Later admin access is granted on the Admin page.');
              return;
            }
            if (requested && !['editor', 'viewer', 'employee'].includes(requested)) {
              sendError(res, 400, 'Role must be editor, viewer or employee.');
              return;
            }
            store.putMembership({
              email,
              name: user.name,
              role: requested || 'viewer',
              canExport: body.canExport,
              scopePositionId: String(body.scopePositionId || '').slice(0, 150),
              issuerSub: 'dev:' + email
            });
          }
        }
        const cookie = setSessionCookie(res, store, user.id, cfg);
        store.audit({ userId: user.id, action: 'login', detail: { via: 'dev' } });
        send(res, 200, auth.publicSession(user, store.getMembership(user.id), store.getTenant()), { 'set-cookie': cookie });
        return;
      }

      if (p.startsWith('/api/')) {
        const ident = requireMember(req, res, store, cfg);
        if (!ident) return;
        const { membership, user } = ident;
        if (ident.via === 'token') {
          const readRoute = method === 'GET' && (p === '/api/workspace' || p.startsWith('/api/org/') || p === '/api/openapi.json');
          const exportRoute = method === 'POST' && ['/api/org/share-snapshot','/api/exports'].includes(p);
          const proposalRoute = method === 'POST' && ['/api/proposals','/api/org/preview-proposal','/api/org/validate-proposal'].includes(p);
          const mcpRoute = p === '/api/mcp' && method === 'POST';
          const workplaceRoute = p.startsWith('/api/workplace/');
          const sessionRoute = p === '/api/session' && method === 'GET';
          if (!(sessionRoute || readRoute&&ident.scopes.includes('read') || exportRoute&&ident.scopes.includes('export') || proposalRoute&&ident.scopes.includes('propose') || mcpRoute&&ident.scopes.includes('read') || workplaceRoute&&ident.scopes.includes('workplace'))) {sendError(res,403,'Token scope does not allow this operation.');return;}
        }
        const tenant = store.getTenant();

        if (p === '/api/session' && method === 'GET') {
          send(res, 200, auth.publicSession(user, membership, tenant));
          return;
        }
        if (p.startsWith('/api/workplace/')) {
          await handleWorkplace(req, res, { ident, url, send, readJson });
          return;
        }
        // Scheduling-only members never receive organization-chart data or tools. They may manage their own
        // workplace-only tokens for the CLI and coding agents.
        if (membership.role === 'employee' && !(p === '/api/tokens' || p.startsWith('/api/tokens/'))) {
          sendError(res, 403, 'Your account can plan work locations, vacation and desks, but not open the organization chart.');
          return;
        }

        if (p === '/api/workspace' && method === 'GET') {
          const vis = visibleDocument(store, membership);
          store.audit({ userId: user.id, action: 'load', detail: { version: vis.version, scoped: Boolean(membership.scope_position_id) } });
          send(res, 200, { workspace: vis.doc, version: vis.version, updatedAt: vis.updatedAt, session: auth.publicSession(user, membership, tenant) });
          return;
        }

        if (p === '/api/workspace' && method === 'PUT') {
          if (!canWriteRole(membership.role)) {
            sendError(res, 403, 'Viewers cannot save the organization.');
            return;
          }
          const raw = await readBody(req);
          const parsed = (() => {
            try { return JSON.parse(raw.toString('utf8') || '{}'); }
            catch { return null; }
          })();
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            sendError(res, 400, 'Body must be JSON.');
            return;
          }
          let incoming;
          try { incoming = validateDocument(parsed.workspace || parsed, raw.length); }
          catch (err) { sendError(res, 400, err.message); return; }
          const expected = parsed.workspace ? parsed.version ?? Number(String(req.headers['if-match'] || '').replace(/"/g, '')) : Number(String(req.headers['if-match'] || '').replace(/"/g, ''));
          try {
            const saved = governance.atomicSave(store, incoming, membership, user, expected, { acknowledgeReservations: parsed.acknowledgeReservations === true });
            send(res, 200, { ok: true, ...saved, workspace: filterDocument(saved.workspace, membership.scope_position_id || '') });
          } catch (err) {
            sendError(res, err.status || 400, err.message, { code: err.code, currentVersion: err.currentVersion, ...err.extra });
          }
          return;
        }

        if (p === '/api/proposals' && method === 'POST') {
          const body=await readJson(req,res,1024*1024);if(!body)return;
          try { send(res,201,governance.proposalCommand(store,body,membership,user,req.headers['idempotency-key'])); }
          catch(error) { sendError(res,error.status||400,error.message,{currentVersion:error.currentVersion,code:error.code}); }
          return;
        }

        const decisionMatch = p.match(/^\/api\/scenarios\/([^/]+)\/decision$/);
        if (decisionMatch && method === 'POST') {
          const body = await readJson(req, res, 1024 * 1024);if (!body) return;
          try {
            const saved = governance.decisionCommand(store, decodeURIComponent(decisionMatch[1]), body.action, body.input || {}, membership, user, body.version);
            send(res, 200, { ok: true, ...saved });
          } catch (err) {
            sendError(res, err.status || 400, err.message, { code: err.code, currentVersion: err.currentVersion, conflicts: err.conflicts, ...err.extra });
          }
          return;
        }

        if (p === '/api/org/forecast' && method === 'GET') {
          const vis = visibleDocument(store, membership);
          const extra = visExtra(vis, membership, url);
          const scenario = vis.doc.planning.scenarios.find(s => s.id === extra.scenario);
          if (!scenario) { sendError(res, 404, 'Scenario not found.');return; }
          try { send(res, 200, query.withContext(vis.doc, { scenario: scenario.id, version: vis.version, rows: Management.forecast(scenario, { startMonth: url.searchParams.get('month') || undefined, months: Number(url.searchParams.get('months') || 12), group: url.searchParams.get('group') || '' }) }, extra)); }
          catch (err) { sendError(res, 400, err.message); }
          return;
        }

        if (p === '/api/exports' && method === 'POST') {
          if (!membership.can_export) {
            sendError(res, 403, 'You are not allowed to export this organization.');
            return;
          }
          const body = await readJson(req, res);
          if (!body) return;
          const kind = EXPORT_KINDS.includes(body.kind) ? body.kind : 'workspace';
          store.audit({ userId: user.id, action: 'export', detail: { kind } });
          send(res, 200, { ok: true, kind });
          return;
        }

        if (p === '/api/org/summary' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          send(res,200,query.withContext(vis.doc,{...query.summary(vis.doc,extra.scenario),version:vis.version},extra));
          return;
        }
        if (p === '/api/org/status' && method === 'GET') {
          const vis=visibleDocument(store,membership);
          send(res,200,query.workspaceStatus(vis.doc,visExtra(vis,membership,url)));
          return;
        }
        if (p === '/api/org/positions' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          send(res, 200, query.withContext(vis.doc,{ positions: query.searchPositions(vis.doc, url.searchParams.get('q') || '', extra.scenario) }, extra));
          return;
        }
        if (p.startsWith('/api/org/people/') && method === 'GET') {
          const id = decodeURIComponent(p.slice('/api/org/people/'.length));
          if (!id) { sendError(res, 400, 'Person id required.'); return; }
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          try { send(res, 200, query.withContext(vis.doc, query.getPerson(vis.doc, id, extra.scenario), extra)); }
          catch (err) { sendError(res, 404, err.message); }
          return;
        }
        if (p.startsWith('/api/org/span/') && method === 'GET') {
          const id = decodeURIComponent(p.slice('/api/org/span/'.length));
          if (!id) { sendError(res, 400, 'Position id required.'); return; }
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          try { send(res, 200, query.withContext(vis.doc, query.spanOfControl(vis.doc, id, extra.scenario), extra)); }
          catch (err) { sendError(res, 404, err.message); }
          return;
        }
        if (p === '/api/org/dotted-lines' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          send(res, 200, query.withContext(vis.doc,{ items: query.dottedLines(vis.doc, extra.scenario) }, extra));
          return;
        }
        if (p === '/api/org/vacancies' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          send(res, 200, query.withContext(vis.doc,{ items: query.vacancies(vis.doc, extra.scenario) }, extra));
          return;
        }
        if (p === '/api/org/diff' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          try {
            send(res, 200, query.withContext(vis.doc,{
              changes: query.diffScenarios(vis.doc, url.searchParams.get('from') || 'current', url.searchParams.get('to') || '')
            }, extra));
          } catch (err) { sendError(res, 400, err.message); }
          return;
        }
        if (p === '/api/org/changes' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          const since=Number(url.searchParams.get('sinceVersion')||url.searchParams.get('sinceRevision'));
          if(!Number.isInteger(since) || since < 1){ sendError(res,400,'sinceVersion is required.'); return; }
          const prev=store.getWorkspaceRevision(since);
          if(!prev){ sendError(res,404,'No stored document for that server version.',{available:store.listWorkspaceRevisions()}); return; }
          try {
            const previous=filterDocument(validateDocument(JSON.parse(prev.document)),membership.scope_position_id||'');
            send(res,200,query.withContext(vis.doc,{sinceVersion:since,currentVersion:vis.version,changes:query.positionChangesSince(vis.doc,previous,extra.scenario)},extra));
          } catch (err) { sendError(res,400,err.message); }
          return;
        }
        if (p === '/api/org/capacity-gap' && method === 'GET') {
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          try {
            send(res,200,query.withContext(vis.doc,query.capacityGap(vis.doc,{scenario:extra.scenario,month:url.searchParams.get('month')||undefined,months:Number(url.searchParams.get('months')||12),group:url.searchParams.get('group')||''}),extra));
          } catch (err) { sendError(res,400,err.message); }
          return;
        }
        if (p === '/api/org/preview-proposal' && method === 'POST') {
          const body=await readJson(req,res,1024*1024);if(!body)return;
          try { send(res,200,governance.previewProposal(store,body,membership,user)); }
          catch (err) { sendError(res,err.status||400,err.message); }
          return;
        }
        if (p === '/api/org/validate-proposal' && method === 'POST') {
          const body=await readJson(req,res,1024*1024);if(!body)return;
          const result=governance.validateProposal(store,body,membership,user);
          send(res, result.ok ? 200 : (result.status || 400), result);
          return;
        }
        if (p === '/api/org/share-snapshot' && method === 'POST') {
          if (!membership.can_export) { sendError(res, 403, 'You are not allowed to export this organization.'); return; }
          const body=await readJson(req,res,1024*1024);if(!body)return;
          const vis=visibleDocument(store,membership);const extra=visExtra(vis,membership,url);
          try {
            const include = body.include && typeof body.include === 'object' ? body.include : {};
            const dataset = OrgFlow.buildShareDataset(vis.doc.planning, {
              scenarioId: body.scenario || extra.scenario,
              rootId: body.rootId || '',
              include,
              initialDepth: body.initialDepth,
              companyName: vis.doc.branding?.companyName,
              chartTitle: vis.doc.branding?.chartTitle
            });
            store.audit({ userId: user.id, action: 'export', detail: { kind: 'interactive', positions: dataset.positions.length } });
            let html = '';
            if (body.html) {
              const coreSrc = fs.readFileSync(path.join(ROOT, 'js/orgflow-core.js'), 'utf8');
              const viewerSrc = fs.readFileSync(path.join(ROOT, 'js/share-viewer.js'), 'utf8');
              html = Share.buildShareHtml(dataset, { managementSrc:fs.readFileSync(path.join(ROOT,'js/management-core.js'),'utf8'),coreSrc, viewerSrc, staticSvg: Share.shareStaticSvg(dataset) });
            }
            send(res, 200, query.withContext(vis.doc, { dataset, html: html || undefined }, extra));
          } catch (err) { sendError(res, 400, err.message); }
          return;
        }
        if (p === '/api/openapi.json' && method === 'GET') {
          send(res, 200, openApiSpec(), { 'content-type': 'application/json; charset=utf-8' });
          return;
        }

        if (p === '/api/reviews' && method === 'GET') {
          const vis=visibleDocument(store,membership);
          send(res,200,{reviews:vis.doc.planning.scenarios.filter(s=>s.workflow?.state==='In review'&&s.workflow.reviewers.includes(user.email)).map(s=>({id:s.id,name:s.name,owner:s.workflow.owner,submittedAt:s.workflow.events.filter(e=>e.action==='submitted').at(-1)?.at||''}))});return;
        }
        if (p === '/api/members' && method === 'GET') {
          if (membership.role !== 'admin') { sendError(res, 403, 'Only admins can list members.'); return; }
          send(res, 200, { members: store.listMembers() });
          return;
        }
        if (p === '/api/members' && method === 'PUT') {
          if (membership.role !== 'admin') { sendError(res, 403, 'Only admins can change members.'); return; }
          const body = await readJson(req, res);
          if (!body) return;
          try {
            const member = store.putMembership({
              email: body.email,
              name: body.name,
              role: body.role,
              canExport: body.canExport,
              scopePositionId: body.scopePositionId || '',
              employeeId: body.employeeId,
              workplaceAdmin: body.workplaceAdmin
            });
            store.audit({ userId: user.id, action: 'member.update', detail: { email: member.email, role: member.role, canExport: member.can_export, scopePositionId: member.scope_position_id, employeeId: member.employee_id, workplaceAdmin: Boolean(member.workplace_admin) } });
            send(res, 200, { member });
          } catch (err) { sendError(res, 400, err.message); }
          return;
        }
        if (p.startsWith('/api/members/') && method === 'DELETE') {
          if (membership.role !== 'admin') { sendError(res, 403, 'Only admins can remove members.'); return; }
          const userId = decodeURIComponent(p.slice('/api/members/'.length));
          if (!userId) { sendError(res, 400, 'Member id required.'); return; }
          try {
            store.deleteMembership(userId);
            store.audit({ userId: user.id, action: 'member.remove', detail: { userId } });
            send(res, 200, { ok: true });
          } catch (err) { sendError(res, 400, err.message); }
          return;
        }

        if (p === '/api/audit' && method === 'GET') {
          if (membership.role !== 'admin') { sendError(res, 403, 'Only admins can read the audit log.'); return; }
          send(res, 200, { events: store.listAudit(url.searchParams.get('limit')) });
          return;
        }

        if (p === '/api/tokens' && method === 'GET') {
          send(res, 200, { tokens: store.listTokens(user.id, membership.role === 'admin') });
          return;
        }
        if (p === '/api/tokens' && method === 'POST') {
          const body = await readJson(req, res);
          if (!body) return;
          if (membership.role === 'employee' && (!Array.isArray(body.scopes) || body.scopes.some(s => s !== 'workplace'))) { sendError(res, 403, 'Scheduling-only members can create workplace tokens only.'); return; }
          let created;try{created = store.createApiToken(user.id, body.name || 'MCP', {scopes:body.scopes,expiresInDays:body.expiresInDays});}catch(error){sendError(res,400,error.message);return;}
          store.audit({ userId: user.id, action: 'token.create', detail: { id: created.id, name: body.name || 'MCP' } });
          send(res, 201, { id: created.id, token: created.token, prefix: created.prefix, expiresAt:created.expiresAt, scopes:created.scopes, warning: 'Copy this token now. It is not shown again.' });
          return;
        }
        if (p.startsWith('/api/tokens/') && method === 'DELETE') {
          const id = decodeURIComponent(p.slice('/api/tokens/'.length));
          if (!id) { sendError(res, 400, 'Token id required.'); return; }
          store.deleteToken(id, user.id, membership.role === 'admin');
          store.audit({ userId: user.id, action: 'token.revoke', detail: { id } });
          send(res, 200, { ok: true });
          return;
        }

        if (p === '/api/mcp' && method === 'POST') {
          const body = await readJson(req, res, 1024 * 1024);
          if (!body) return;
          if(ident.via==='token'&&['preview_proposal','validate_proposal'].includes(body.params?.name)&&!ident.scopes.includes('propose')){sendError(res,403,'Token requires propose scope.');return;}
          const result=handleMcp(body, () => visibleDocument(store, membership), membership, store);
          if(result===null){res.writeHead(202);res.end();}else send(res, 200, result);
          return;
        }

        sendError(res, 404, 'Unknown API route.');
        return;
      }

      if (method !== 'GET' && method !== 'HEAD') {
        sendError(res, 405, 'Method not allowed.');
        return;
      }
      const file = safeStatic(p);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        sendError(res, 404, 'Not found.');
        return;
      }
      const buf = fs.readFileSync(file);
      if (method === 'HEAD') {
        const head = {
          'content-type': mime(file),
          'content-length': buf.length,
          'cache-control': path.extname(file) === '.html' ? 'no-store' : 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer',
          ...frameHeaders(file)
        };
        for (const key of Object.keys(head)) if (head[key] == null) delete head[key];
        res.writeHead(200, head);
        res.end();
        return;
      }
      send(res, 200, buf, { 'content-type': mime(file), 'cache-control': path.extname(file) === '.html' ? 'no-store' : 'public, max-age=300', ...frameHeaders(file) });
    } catch (err) {
      if (err.status) {
        sendError(res, err.status, err.message);
        return;
      }
      console.error(err);
      sendError(res, 500, 'Server error.');
    }
  });

  return { server, store, db, config: cfg, workplace, teams };
}

function mcpTools({ allowProposals = false } = {}) {
  const tools = [
    { name: 'get_workspace_status', description: 'Workspace identity, revision, last commit and where the copy lives. Use this to confirm the agent is looking at the same organization as the UI.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' } } } },
    { name: 'get_org', description: 'Summary of the visible organization (counts, groups, active scenario). Includes a context object with workspace id, revision and as-of date.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' }, asOf: { type: 'string' } } } },
    { name: 'search_positions', description: 'Search visible positions by title, name, group or id.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, scenario: { type: 'string' } } } },
    { name: 'get_person', description: 'Look up one visible person and their seat.', inputSchema: { type: 'object', properties: { personId: { type: 'string' }, scenario: { type: 'string' } }, required: ['personId'] } },
    { name: 'span_of_control', description: 'Direct reports and descendant count for a visible position.', inputSchema: { type: 'object', properties: { positionId: { type: 'string' }, scenario: { type: 'string' } }, required: ['positionId'] } },
    { name: 'dotted_lines', description: 'Matrix / dotted-line reporting in the visible organization.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' } } } },
    { name: 'list_vacancies', description: 'Vacant and recruiting seats in the visible organization.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' } } } },
    { name: 'diff_scenarios', description: 'Position changes between two scenarios the caller can see.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['to'] } },
    { name: 'get_changes_since', description: 'Position changes since a previous server document version.', inputSchema: { type: 'object', properties: { sinceVersion: { type: 'integer', minimum: 1 }, scenario: { type: 'string' } }, required: ['sinceVersion'] } },
    { name: 'explain_capacity_gap', description: 'Months where commitments or planned seats exceed available/filled FTE. Deterministic; not an LLM estimate.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' }, month: { type: 'string' }, months: { type: 'integer', minimum: 1, maximum: 36 }, group: { type: 'string' } } } },
    { name: 'preview_proposal', description: 'Show what a Draft proposal would change without saving it.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, rationale: { type: 'string' }, changes: { type: 'array' } } } },
    { name: 'validate_proposal', description: 'Validate a Draft proposal without saving. Returns ok or the validation error.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, rationale: { type: 'string' }, changes: { type: 'array' } } } },
    { name: 'create_share_snapshot', description: 'Build a redacted interactive-share dataset (and optional HTML). Excluded fields are not embedded.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' }, rootId: { type: 'string' }, include: { type: 'object', additionalProperties: { type: 'boolean' } }, initialDepth: { type: 'integer' }, html: { type: 'boolean' } } } }
  ];
  tools.push({name:'workforce_forecast',description:'Read monthly headcount, capacity and position budget assumptions. Currencies remain separate.',inputSchema:{type:'object',properties:{scenario:{type:'string'},month:{type:'string'},months:{type:'integer',minimum:1,maximum:36},group:{type:'string'}}}});
  for(const tool of tools)tool.annotations={readOnlyHint:true,destructiveHint:false};
  if(allowProposals)tools.push({name:'propose_changes',description:'Create a Draft proposal only. Does not change Current, approve or apply. Requires an unscoped editor/admin and the current workspace version.',annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},inputSchema:{type:'object',required:['version','name','rationale','changes'],properties:{idempotencyKey:{type:'string',maxLength:150},version:{type:'integer',minimum:1},name:{type:'string',maxLength:80},rationale:{type:'string',maxLength:3000},changes:{type:'array',maxItems:500,items:{type:'object',required:['entity','id','operation'],properties:{entity:{type:'string',enum:Management.COLLECTIONS},id:{type:'string'},operation:{type:'string',enum:['upsert','remove']},values:{type:'object'}}}}}}});
  return tools;
}

function callMcpTool(name, args, vis, membership, store) {
  const doc = vis.doc;
  const extra = { scenario: args.scenario, asOf: args.asOf, serverVersion: APP_VERSION, serverDocumentVersion: vis.version, scopePositionId: membership?.scope_position_id || '' };
  switch (name) {
    case 'get_workspace_status': return query.workspaceStatus(doc, extra);
    case 'workforce_forecast': {const s=doc.planning.scenarios.find(s=>s.id===(args.scenario||'current'));if(!s)throw new Error('Scenario not found.');return query.withContext(doc,{rows:Management.forecast(s,{startMonth:args.month,months:args.months??12,group:args.group||''})},extra);}
    case 'get_org': return query.withContext(doc, query.summary(doc, args.scenario), extra);
    case 'search_positions': return query.withContext(doc, { positions: query.searchPositions(doc, args.q, args.scenario) }, extra);
    case 'get_person': return query.withContext(doc, query.getPerson(doc, args.personId, args.scenario), extra);
    case 'span_of_control': return query.withContext(doc, query.spanOfControl(doc, args.positionId, args.scenario), extra);
    case 'dotted_lines': return query.withContext(doc, { items: query.dottedLines(doc, args.scenario) }, extra);
    case 'list_vacancies': return query.withContext(doc, { items: query.vacancies(doc, args.scenario) }, extra);
    case 'diff_scenarios': return query.withContext(doc, { changes: query.diffScenarios(doc, args.from || 'current', args.to) }, extra);
    case 'get_changes_since': {
      if (!store) throw new Error('Change history is only available on the shared host.');
      const prev = store.getWorkspaceRevision(args.sinceVersion);
      if (!prev) throw new Error('No stored document for that server version.');
      const previous = filterDocument(validateDocument(JSON.parse(prev.document)), membership?.scope_position_id || '');
      return query.withContext(doc, { sinceVersion: args.sinceVersion, currentVersion: vis.version, changes: query.positionChangesSince(doc, previous, args.scenario) }, extra);
    }
    case 'explain_capacity_gap': return query.withContext(doc, query.capacityGap(doc, args), extra);
    case 'preview_proposal': return governance.previewProposal(store, args, membership, { email: membership?.email || 'mcp' });
    case 'validate_proposal': return governance.validateProposal(store, args, membership, { email: membership?.email || 'mcp' });
    case 'create_share_snapshot': {
      if (!membership?.can_export) throw new Error('You are not allowed to export this organization.');
      const dataset = OrgFlow.buildShareDataset(doc.planning, {
        scenarioId: args.scenario, rootId: args.rootId || '', include: args.include || {},
        initialDepth: args.initialDepth, companyName: doc.branding?.companyName, chartTitle: doc.branding?.chartTitle
      });
      let html = '';
      if (args.html) {
        html = Share.buildShareHtml(dataset, {
          managementSrc: fs.readFileSync(path.join(ROOT, 'js/management-core.js'), 'utf8'),
          coreSrc: fs.readFileSync(path.join(ROOT, 'js/orgflow-core.js'), 'utf8'),
          viewerSrc: fs.readFileSync(path.join(ROOT, 'js/share-viewer.js'), 'utf8'),
          staticSvg: Share.shareStaticSvg(dataset)
        });
      }
      return query.withContext(doc, { dataset, html: html || undefined }, extra);
    }
    default: throw new Error('Unknown tool: ' + name);
  }
}

function handleMcp(message, getVis, membership, store) {
  if(!message||typeof message!=='object'||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}};
  const id = message.id ?? null;
  const method = message.method;
  if(!Object.hasOwn(message,'id'))return null;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: MCP_PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: 'orgflow', version: APP_VERSION } } };
  }
  if (method === 'notifications/initialized' || method === 'initialized') {
    return { jsonrpc: '2.0', id, result: {} };
  }
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: mcpTools() } };
  }
  if (method === 'tools/call') {
    try {
      const vis = typeof getVis === 'function' ? getVis() : { doc: getVis, version: null };
      const docVis = vis.doc ? vis : { doc: vis, version: vis?.version ?? null };
      const result = callMcpTool(message.params?.name, message.params?.arguments || {}, docVis, membership, store);
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

function openApiSpec() { return require('./openapi').spec(APP_VERSION); }

module.exports = { createApp, loadConfig, assertProductionConfig, mcpTools, callMcpTool, handleMcp, emptyDocument, safeStatic, safeReturn, APP_VERSION, MCP_PROTOCOL };
