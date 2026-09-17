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

const ROOT = path.resolve(__dirname, '../..');
const APP_VERSION = require('../../package.json').version;
const MCP_PROTOCOL = '2025-11-25';
const EXPORT_KINDS = ['png', 'groups', 'pdf', 'html', 'csv', 'people', 'workspace', 'compare', 'interactive', 'bundle'];

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
  res.writeHead(status, {
    'content-type': headers['content-type'] || 'application/json; charset=utf-8',
    'content-length': payload.length,
    'cache-control': headers['cache-control'] || 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    ...headers
  });
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
  try { decoded = decodeURIComponent((urlPath || '').split('?')[0]); }
  catch { return null; }
  let rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (rel.includes('\0') || rel.split(/[/\\]/).some(p => p === '..')) return null;
  const top = rel.split('/')[0];
  if (!top || top.startsWith('.') || ['server', 'data', 'node_modules', 'tests', 'Dockerfile', 'docker-compose.yml'].includes(top)) return null;
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return null;
  const relToRoot = path.relative(ROOT, abs);
  if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return null;
  return abs;
}

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
    dataDir: env.DATA_DIR || path.join(ROOT, 'data')
  };
}

function assertProductionConfig(cfg) {
  if (cfg.authMode !== 'oidc') return;
  if (!cfg.issuer) throw new Error('KEYCLOAK_ISSUER is required when AUTH_MODE=oidc.');
  if (!cfg.sessionSecret || cfg.sessionSecret === INSECURE_SECRET) {
    throw new Error('SESSION_SECRET must be set to a long random value when AUTH_MODE=oidc.');
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
    return { user: { id: token.user_id, email: token.email, name: token.name }, membership, via: 'token' };
  }
  const cookies = auth.parseCookies(req.headers.cookie);
  const sid = auth.unsignSid(cookies[auth.COOKIE], cfg.sessionSecret);
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

async function handleOidcLogin(req, res, store, cfg, oidc) {
  const { verifier, challenge, state, nonce } = auth.pkce();
  store.saveOauthState({
    state,
    nonce,
    codeVerifier: verifier,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
  const url = new URL(oidc.authorization_endpoint);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri || cfg.publicUrl + '/auth/callback');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  res.writeHead(302, { location: url.toString(), 'cache-control': 'no-store' });
  res.end();
}

async function handleOidcCallback(req, res, store, cfg, oidc, url) {
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const saved = store.takeOauthState(state);
  if (!saved || !code) {
    sendError(res, 400, 'Sign-in state is missing or expired. Start again from /auth/login.');
    return;
  }
  const tokens = await auth.exchangeCode(oidc, {
    code,
    verifier: saved.code_verifier,
    redirectUri: cfg.redirectUri || cfg.publicUrl + '/auth/callback',
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret
  });
  const profile = await auth.fetchUserInfo(oidc, tokens.access_token);
  const email = String(profile.email || '').trim().toLowerCase();
  if (!email) {
    sendError(res, 400, 'Keycloak did not return an email address for this user.');
    return;
  }
  const user = store.upsertUser({
    issuerSub: String(profile.sub || email),
    email,
    name: profile.name || profile.preferred_username || email
  });
  const membership = store.ensureMembership(user);
  if (!membership) {
    res.writeHead(302, { location: '/login.html?error=not_member', 'cache-control': 'no-store' });
    res.end();
    return;
  }
  store.audit({ userId: user.id, action: 'login', detail: { via: 'oidc' } });
  res.writeHead(302, {
    location: '/app.html',
    'set-cookie': setSessionCookie(res, store, user.id, cfg),
    'cache-control': 'no-store'
  });
  res.end();
}

function createApp(options = {}) {
  const cfg = { ...loadConfig(options.env || process.env), ...options.config };
  const db = options.db || openDatabase(options.databasePath || (options.memory ? ':memory:' : path.join(cfg.dataDir, 'orgflow.sqlite')));
  const store = options.store || createStore(db, { tenantName: cfg.tenantName, tenantSlug: cfg.tenantSlug });
  let oidcCache = null;

  async function oidcConfig() {
    if (!cfg.issuer) throw new Error('KEYCLOAK_ISSUER is not set.');
    if (!oidcCache) oidcCache = await auth.discoverIssuer(cfg.issuer);
    return oidcCache;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, cfg.publicUrl);
      const method = req.method || 'GET';
      const p = url.pathname;

      if (p === '/api/meta' && method === 'GET') {
        send(res, 200, {
          enterprise: true,
          auth: cfg.authMode,
          loginUrl: '/auth/login',
          logoutUrl: '/auth/logout'
        });
        return;
      }

      if (p === '/auth/login' && method === 'GET') {
        if (cfg.authMode === 'dev') {
          res.writeHead(302, { location: '/login.html', 'cache-control': 'no-store' });
          res.end();
          return;
        }
        await handleOidcLogin(req, res, store, cfg, await oidcConfig());
        return;
      }

      if (p === '/auth/callback' && method === 'GET') {
        await handleOidcCallback(req, res, store, cfg, await oidcConfig(), url);
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
            if (requested && !['editor', 'viewer'].includes(requested)) {
              sendError(res, 400, 'Role must be editor or viewer.');
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
        const tenant = store.getTenant();

        if (p === '/api/session' && method === 'GET') {
          send(res, 200, auth.publicSession(user, membership, tenant));
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
            const saved = governance.atomicSave(store, incoming, membership, user, expected);
            send(res, 200, { ok: true, ...saved, workspace: filterDocument(saved.workspace, membership.scope_position_id || '') });
          } catch (err) {
            sendError(res, err.status || 400, err.message, { code: err.code, currentVersion: err.currentVersion });
          }
          return;
        }

        if (p === '/api/proposals' && method === 'POST') {
          const body=await readJson(req,res,1024*1024);if(!body)return;
          try { send(res,201,governance.proposalCommand(store,body,membership,user)); }
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
            sendError(res, err.status || 400, err.message, { code: err.code, currentVersion: err.currentVersion, conflicts: err.conflicts });
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
            const previous=validateDocument(JSON.parse(prev.document));
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
              html = Share.buildShareHtml(dataset, { coreSrc, viewerSrc, staticSvg: Share.shareStaticSvg(dataset) });
            }
            send(res, 200, query.withContext(vis.doc, { dataset, html: html || undefined }, extra));
          } catch (err) { sendError(res, 400, err.message); }
          return;
        }
        if (p === '/api/openapi.json' && method === 'GET') {
          send(res, 200, openApiSpec(), { 'content-type': 'application/json; charset=utf-8' });
          return;
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
              scopePositionId: body.scopePositionId || ''
            });
            store.audit({ userId: user.id, action: 'member.update', detail: { email: member.email, role: member.role, canExport: member.can_export, scopePositionId: member.scope_position_id } });
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
          const created = store.createApiToken(user.id, body.name || 'MCP');
          store.audit({ userId: user.id, action: 'token.create', detail: { id: created.id, name: body.name || 'MCP' } });
          send(res, 201, { id: created.id, token: created.token, prefix: created.prefix, warning: 'Copy this token now. It is not shown again.' });
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
          send(res, 200, handleMcp(body, () => visibleDocument(store, membership), membership, store));
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
        res.writeHead(200, {
          'content-type': mime(file),
          'content-length': buf.length,
          'cache-control': path.extname(file) === '.html' ? 'no-store' : 'public, max-age=300',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'referrer-policy': 'no-referrer'
        });
        res.end();
        return;
      }
      send(res, 200, buf, { 'content-type': mime(file), 'cache-control': path.extname(file) === '.html' ? 'no-store' : 'public, max-age=300' });
    } catch (err) {
      if (err.status) {
        sendError(res, err.status, err.message);
        return;
      }
      console.error(err);
      sendError(res, 500, 'Server error.');
    }
  });

  return { server, store, db, config: cfg };
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
  if(allowProposals)tools.push({name:'propose_changes',description:'Create a Draft proposal only. Does not change Current, approve or apply. Requires an unscoped editor/admin and the current workspace version.',annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},inputSchema:{type:'object',required:['version','name','rationale','changes'],properties:{version:{type:'integer',minimum:1},name:{type:'string',maxLength:80},rationale:{type:'string',maxLength:3000},changes:{type:'array',maxItems:500,items:{type:'object',required:['entity','id','operation'],properties:{entity:{type:'string',enum:Management.COLLECTIONS},id:{type:'string'},operation:{type:'string',enum:['upsert','remove']},values:{type:'object'}}}}}}});
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
      return query.withContext(doc, { sinceVersion: args.sinceVersion, currentVersion: vis.version, changes: query.positionChangesSince(doc, validateDocument(JSON.parse(prev.document)), args.scenario) }, extra);
    }
    case 'explain_capacity_gap': return query.withContext(doc, query.capacityGap(doc, args), extra);
    case 'preview_proposal': return governance.previewProposal(store, args, membership, { email: membership?.email || 'mcp' });
    case 'validate_proposal': return governance.validateProposal(store, args, membership, { email: membership?.email || 'mcp' });
    case 'create_share_snapshot': {
      const dataset = OrgFlow.buildShareDataset(doc.planning, {
        scenarioId: args.scenario, rootId: args.rootId || '', include: args.include || {},
        initialDepth: args.initialDepth, companyName: doc.branding?.companyName, chartTitle: doc.branding?.chartTitle
      });
      let html = '';
      if (args.html) {
        html = Share.buildShareHtml(dataset, {
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
  const id = message.id ?? null;
  const method = message.method;
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

function openApiSpec() {
  return {
    openapi: '3.0.3',
    info: { title: 'OrgFlow', version: APP_VERSION, description: 'Shared-host API. Every org query includes a context object with workspace id, revision, scenario and as-of date.' },
    paths: {
      '/api/org/status': { get: { summary: 'Workspace identity and revision', responses: { 200: { description: 'Status' } } } },
      '/api/org/summary': { get: { summary: 'Organization summary', responses: { 200: { description: 'Summary plus context' } } } },
      '/api/org/changes': { get: { summary: 'Changes since a server document version', parameters: [{ name: 'sinceVersion', in: 'query', required: true }], responses: { 200: { description: 'Changes' } } } },
      '/api/org/capacity-gap': { get: { summary: 'Capacity and staffing gaps', responses: { 200: { description: 'Gaps' } } } },
      '/api/org/preview-proposal': { post: { summary: 'Preview a Draft proposal without saving', responses: { 200: { description: 'Preview' } } } },
      '/api/org/validate-proposal': { post: { summary: 'Validate a Draft proposal without saving', responses: { 200: { description: 'Validation' } } } },
      '/api/org/share-snapshot': { post: { summary: 'Redacted interactive share dataset', responses: { 200: { description: 'Dataset' } } } },
      '/api/mcp': { post: { summary: 'MCP JSON-RPC', responses: { 200: { description: 'JSON-RPC result' } } } },
      '/api/openapi.json': { get: { summary: 'This document', responses: { 200: { description: 'OpenAPI' } } } }
    }
  };
}

module.exports = { createApp, loadConfig, assertProductionConfig, mcpTools, callMcpTool, handleMcp, emptyDocument, safeStatic, APP_VERSION, MCP_PROTOCOL };
