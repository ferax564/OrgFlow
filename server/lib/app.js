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

const ROOT = path.resolve(__dirname, '../..');
const EXPORT_KINDS = ['png', 'groups', 'pdf', 'html', 'csv', 'people', 'workspace', 'compare'];

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
          const row = store.getWorkspaceRow();
          let stored;
          try { stored = JSON.parse(row.document); }
          catch { sendError(res, 500, 'Stored workspace is unreadable.'); return; }
          const expected = parsed.version != null ? parsed.version : (req.headers['if-match'] ? Number(String(req.headers['if-match']).replace(/"/g, '')) : row.version);
          let next;
          try {
            next = membership.scope_position_id
              ? validateDocument(mergeDocument(stored, incoming, membership.scope_position_id))
              : incoming;
          } catch (err) {
            sendError(res, 400, err.message);
            return;
          }
          try {
            const saved = store.saveWorkspace(next, user.id, expected);
            store.audit({ userId: user.id, action: 'save', detail: { version: saved.version, scoped: Boolean(membership.scope_position_id) } });
            const vis = filterDocument(next, membership.scope_position_id || '');
            send(res, 200, { ok: true, version: saved.version, updatedAt: saved.updatedAt, workspace: vis });
          } catch (err) {
            if (err.code === 'version_conflict') {
              sendError(res, 409, err.message, { code: 'version_conflict', currentVersion: err.currentVersion });
              return;
            }
            throw err;
          }
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
          send(res, 200, query.summary(visibleDocument(store, membership).doc, url.searchParams.get('scenario')));
          return;
        }
        if (p === '/api/org/positions' && method === 'GET') {
          send(res, 200, { positions: query.searchPositions(visibleDocument(store, membership).doc, url.searchParams.get('q') || '', url.searchParams.get('scenario')) });
          return;
        }
        if (p.startsWith('/api/org/people/') && method === 'GET') {
          const id = decodeURIComponent(p.slice('/api/org/people/'.length));
          if (!id) { sendError(res, 400, 'Person id required.'); return; }
          try { send(res, 200, query.getPerson(visibleDocument(store, membership).doc, id, url.searchParams.get('scenario'))); }
          catch (err) { sendError(res, 404, err.message); }
          return;
        }
        if (p.startsWith('/api/org/span/') && method === 'GET') {
          const id = decodeURIComponent(p.slice('/api/org/span/'.length));
          if (!id) { sendError(res, 400, 'Position id required.'); return; }
          try { send(res, 200, query.spanOfControl(visibleDocument(store, membership).doc, id, url.searchParams.get('scenario'))); }
          catch (err) { sendError(res, 404, err.message); }
          return;
        }
        if (p === '/api/org/dotted-lines' && method === 'GET') {
          send(res, 200, { items: query.dottedLines(visibleDocument(store, membership).doc, url.searchParams.get('scenario')) });
          return;
        }
        if (p === '/api/org/vacancies' && method === 'GET') {
          send(res, 200, { items: query.vacancies(visibleDocument(store, membership).doc, url.searchParams.get('scenario')) });
          return;
        }
        if (p === '/api/org/diff' && method === 'GET') {
          try {
            send(res, 200, {
              changes: query.diffScenarios(
                visibleDocument(store, membership).doc,
                url.searchParams.get('from') || 'current',
                url.searchParams.get('to') || ''
              )
            });
          } catch (err) { sendError(res, 400, err.message); }
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
          send(res, 200, handleMcp(body, () => visibleDocument(store, membership).doc));
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

function mcpTools() {
  return [
    { name: 'get_org', description: 'Summary of the visible organization (counts, groups, active scenario).', inputSchema: { type: 'object', properties: { scenario: { type: 'string' } } } },
    { name: 'search_positions', description: 'Search visible positions by title, name, group or id.', inputSchema: { type: 'object', properties: { q: { type: 'string' }, scenario: { type: 'string' } } } },
    { name: 'get_person', description: 'Look up one visible person and their seat.', inputSchema: { type: 'object', properties: { personId: { type: 'string' }, scenario: { type: 'string' } }, required: ['personId'] } },
    { name: 'span_of_control', description: 'Direct reports and descendant count for a visible position.', inputSchema: { type: 'object', properties: { positionId: { type: 'string' }, scenario: { type: 'string' } }, required: ['positionId'] } },
    { name: 'dotted_lines', description: 'Matrix / dotted-line reporting in the visible organization.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' } } } },
    { name: 'list_vacancies', description: 'Vacant and recruiting seats in the visible organization.', inputSchema: { type: 'object', properties: { scenario: { type: 'string' } } } },
    { name: 'diff_scenarios', description: 'Position changes between two scenarios the caller can see.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['to'] } }
  ];
}

function callMcpTool(name, args, doc) {
  switch (name) {
    case 'get_org': return query.summary(doc, args.scenario);
    case 'search_positions': return { positions: query.searchPositions(doc, args.q, args.scenario) };
    case 'get_person': return query.getPerson(doc, args.personId, args.scenario);
    case 'span_of_control': return query.spanOfControl(doc, args.positionId, args.scenario);
    case 'dotted_lines': return { items: query.dottedLines(doc, args.scenario) };
    case 'list_vacancies': return { items: query.vacancies(doc, args.scenario) };
    case 'diff_scenarios': return { changes: query.diffScenarios(doc, args.from || 'current', args.to) };
    default: throw new Error('Unknown tool: ' + name);
  }
}

function handleMcp(message, getDoc) {
  const id = message.id ?? null;
  const method = message.method;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'orgflow', version: '1.0.0' } } };
  }
  if (method === 'notifications/initialized' || method === 'initialized') {
    return { jsonrpc: '2.0', id, result: {} };
  }
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: mcpTools() } };
  }
  if (method === 'tools/call') {
    try {
      const result = callMcpTool(message.params?.name, message.params?.arguments || {}, getDoc());
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

module.exports = { createApp, loadConfig, assertProductionConfig, mcpTools, callMcpTool, handleMcp, emptyDocument, safeStatic };
