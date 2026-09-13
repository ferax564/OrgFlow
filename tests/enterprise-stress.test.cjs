const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp, loadConfig, assertProductionConfig, safeStatic } = require('../server/lib/app');

const harbor = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));

function listen(app) {
  return new Promise(resolve => {
    app.server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${app.server.address().port}`);
    });
  });
}

function cookie(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return list.map(c => c.split(';')[0]).join('; ');
}

async function login(base, body) {
  const res = await fetch(base + '/auth/dev/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { res, json, cookie: cookie(res) };
}

async function api(base, cookieHeader, pathname, opts = {}) {
  const res = await fetch(base + pathname, {
    ...opts,
    headers: {
      accept: 'application/json',
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(opts.body ? { 'content-type': opts.headers?.['content-type'] || 'application/json' } : {}),
      ...opts.headers
    }
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { res, json, text };
}

test('oidc refuses to start without issuer and a real session secret', () => {
  const cfg = loadConfig({ AUTH_MODE: 'oidc' });
  assert.throws(() => assertProductionConfig(cfg), /KEYCLOAK_ISSUER/);
  const cfg2 = loadConfig({ AUTH_MODE: 'oidc', KEYCLOAK_ISSUER: 'http://localhost:8080/realms/orgflow' });
  assert.throws(() => assertProductionConfig(cfg2), /SESSION_SECRET/);
  const cfg3 = loadConfig({
    AUTH_MODE: 'oidc',
    KEYCLOAK_ISSUER: 'http://localhost:8080/realms/orgflow',
    SESSION_SECRET: 'a-long-production-secret'
  });
  assert.doesNotThrow(() => assertProductionConfig(cfg3));
});

test('static paths cannot walk into server, data, or git', () => {
  assert.equal(safeStatic('/js/../server/index.js'), null);
  assert.equal(safeStatic('/server/index.js'), null);
  assert.equal(safeStatic('/data/orgflow.sqlite'), null);
  assert.equal(safeStatic('/.git/config'), null);
  assert.equal(safeStatic('/%2e%2e/server/index.js'), null);
  assert.ok(safeStatic('/app.html').endsWith('app.html'));
});

test('stress: auth, ACL, payloads, traversal, and concurrency do not break the host', async t => {
  const app = createApp({ memory: true, env: { AUTH_MODE: 'dev', SESSION_SECRET: 'test-secret' } });
  const base = await listen(app);
  t.after(() => new Promise(resolve => app.server.close(resolve)));

  const first = await login(base, { email: 'first@example.com', role: 'viewer', canExport: false, scopePositionId: 'POS-003' });
  assert.equal(first.res.status, 200);
  assert.equal(first.json.role, 'admin');
  assert.equal(first.json.canExport, true);
  assert.equal(first.json.scopePositionId, '');

  const again = await login(base, { email: 'first@example.com', role: 'viewer' });
  assert.equal(again.json.role, 'admin');

  const steal = await login(base, { email: 'intruder@example.com', role: 'admin' });
  assert.equal(steal.res.status, 403);

  const editor = await login(base, { email: 'editor@example.com', role: 'editor', canExport: true });
  assert.equal(editor.json.role, 'editor');

  const oidcOff = await fetch(base + '/auth/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not-json' });
  assert.equal(oidcOff.status, 400);

  const unauth = await api(base, '', '/api/workspace');
  assert.equal(unauth.res.status, 401);

  const badCookie = await api(base, 'orgflow_sid=deadbeef.forged', '/api/session');
  assert.equal(badCookie.res.status, 401);

  const badBearer = await api(base, '', '/api/workspace', { headers: { authorization: 'Bearer ofk_nope' } });
  assert.equal(badBearer.res.status, 401);

  for (const p of ['/server/index.js', '/data/orgflow.sqlite', '/.env', '/js/../server/lib/db.js', '/tests/enterprise-api.test.cjs']) {
    const hit = await fetch(base + p);
    assert.equal(hit.status, 404, p);
  }

  const png = await fetch(base + '/examples/harbor-and-co/chart.png');
  assert.equal(png.status, 200);
  assert.match(png.headers.get('content-type'), /png/);
  const head = await fetch(base + '/app.html', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.text()).length, 0);

  const saved = await api(base, first.cookie, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace: harbor, version: 1 })
  });
  assert.equal(saved.res.status, 200, saved.json.error);

  const stale = await api(base, first.cookie, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace: harbor, version: 1 })
  });
  assert.equal(stale.res.status, 409);

  const garbage = await api(base, first.cookie, '/api/workspace', { method: 'PUT', body: '{', headers: { 'content-type': 'application/json' } });
  assert.equal(garbage.res.status, 400);

  const proto = await api(base, first.cookie, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ format: 'orgflow.workspace', version: 2, __proto__: { admin: true }, planning: harbor.planning, branding: harbor.branding })
  });
  assert.ok([200, 400, 409].includes(proto.res.status));

  let oversizeStatus;
  try {
    const oversize = await fetch(base + '/api/workspace', {
      method: 'PUT',
      headers: { cookie: first.cookie, 'content-type': 'application/json' },
      body: '{"workspace":"' + 'x'.repeat(13 * 1024 * 1024) + '"}'
    });
    oversizeStatus = oversize.status;
  } catch {
    oversizeStatus = 'reset';
  }
  assert.ok(oversizeStatus === 413 || oversizeStatus === 'reset');

  const demote = await api(base, first.cookie, '/api/members', {
    method: 'PUT',
    body: JSON.stringify({ email: 'first@example.com', role: 'viewer' })
  });
  assert.equal(demote.res.status, 400);

  const hijack = await api(base, first.cookie, '/api/members', {
    method: 'PUT',
    body: JSON.stringify({ email: 'editor@example.com', role: 'viewer', issuerSub: 'dev:first@example.com' })
  });
  assert.equal(hijack.res.status, 200);
  const still = await login(base, { email: 'first@example.com' });
  assert.equal(still.json.role, 'admin');
  await api(base, first.cookie, '/api/members', {
    method: 'PUT',
    body: JSON.stringify({ email: 'editor@example.com', role: 'editor', canExport: true })
  });

  const scoped = await api(base, first.cookie, '/api/members', {
    method: 'PUT',
    body: JSON.stringify({ email: 'eng@example.com', role: 'editor', canExport: false, scopePositionId: 'POS-003' })
  });
  assert.equal(scoped.res.status, 200);
  const eng = await login(base, { email: 'eng@example.com' });
  const view = await api(base, eng.cookie, '/api/workspace');
  const current = view.json.workspace.planning.scenarios.find(s => s.id === 'current');
  assert.equal(current.positions.some(p => p.id === 'POS-001'), false);
  const leak = JSON.stringify(view.json);
  assert.equal(leak.includes('Chief Product Officer'), false);
  const exportDenied = await api(base, eng.cookie, '/api/exports', { method: 'POST', body: JSON.stringify({ kind: 'html' }) });
  assert.equal(exportDenied.res.status, 403);

  const membersAsEditor = await api(base, editor.cookie, '/api/members');
  assert.equal(membersAsEditor.res.status, 403);
  const auditAsEditor = await api(base, editor.cookie, '/api/audit');
  assert.equal(auditAsEditor.res.status, 403);

  const latest = await api(base, first.cookie, '/api/workspace');
  const version = latest.json.version;
  const [a, b] = await Promise.all([
    api(base, first.cookie, '/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace: harbor, version }) }),
    api(base, editor.cookie, '/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace: harbor, version }) })
  ]);
  const statuses = [a.res.status, b.res.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  const oidcApp = createApp({ memory: true, env: { AUTH_MODE: 'oidc', SESSION_SECRET: 'prod-secret', KEYCLOAK_ISSUER: 'http://127.0.0.1:9/realms/x' } });
  const oidcBase = await listen(oidcApp);
  t.after(() => new Promise(resolve => oidcApp.server.close(resolve)));
  const blocked = await fetch(oidcBase + '/auth/dev/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.co', role: 'admin' })
  });
  assert.equal(blocked.status, 404);
});
