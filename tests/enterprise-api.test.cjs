const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp, handleMcp } = require('../server/lib/app');

const harbor = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));

function listen(app) {
  return new Promise(resolve => {
    app.server.listen(0, '127.0.0.1', () => {
      const { port } = app.server.address();
      resolve(`http://127.0.0.1:${port}`);
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
  const json = await res.json();
  assert.equal(res.status, 200, json.error || 'login');
  return { json, cookie: cookie(res) };
}

async function api(base, cookieHeader, pathname, opts = {}) {
  const res = await fetch(base + pathname, {
    ...opts,
    headers: {
      accept: 'application/json',
      cookie: cookieHeader,
      ...(opts.body && !Buffer.isBuffer(opts.body) ? { 'content-type': 'application/json' } : {}),
      ...opts.headers
    }
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { res, json };
}

test('enterprise API: roles, export flag, subtree, audit, MCP', async (t) => {
  const app = createApp({ memory: true, env: { AUTH_MODE: 'dev', SESSION_SECRET: 'test-secret', TENANT_NAME: 'Harbor' } });
  const base = await listen(app);
  t.after(() => new Promise(resolve => app.server.close(resolve)));

  const meta = await fetch(base + '/api/meta').then(r => r.json());
  assert.equal(meta.enterprise, true);
  assert.equal(meta.auth, 'dev');

  const admin = await login(base, { email: 'admin@example.com', role: 'admin', canExport: true });
  const saved = await api(base, admin.cookie, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace: harbor, version: 1 })
  });
  assert.equal(saved.res.status, 200, saved.json.error);
  assert.equal(saved.json.version, 2);

  const editor = await login(base, { email: 'eng@example.com', role: 'editor', canExport: true, scopePositionId: 'POS-003' });
  const scoped = await api(base, editor.cookie, '/api/workspace');
  assert.equal(scoped.res.status, 200);
  const vis = scoped.json.workspace.planning.scenarios.find(s => s.id === 'current');
  assert.equal(vis.positions.some(p => p.id === 'POS-001'), false);
  assert.equal(vis.positions.some(p => p.id === 'POS-003'), true);

  const hack = structuredClone(scoped.json.workspace);
  hack.planning.scenarios.find(s => s.id === 'current').positions.push({
    id: 'POS-001', managerId: '', secondaryManagerId: '', title: 'Stolen CPO', type: 'Head', group: 'Leadership', fte: 1,
    status: 'Approved', hiringState: 'Vacant', personId: '', startDate: '2026-01-01', endDate: '', location: '', costCenter: '', jobFamily: ''
  });
  const merged = await api(base, editor.cookie, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace: hack, version: scoped.json.version })
  });
  assert.equal(merged.res.status, 200, merged.json.error);

  const adminReload = await api(base, admin.cookie, '/api/workspace');
  const full = adminReload.json.workspace.planning.scenarios.find(s => s.id === 'current');
  assert.equal(full.positions.find(p => p.id === 'POS-001').title, 'Chief Product Officer');

  const viewer = await login(base, { email: 'view@example.com', role: 'viewer', canExport: false });
  const deniedSave = await api(base, viewer.cookie, '/api/workspace', {
    method: 'PUT',
    body: JSON.stringify({ workspace: harbor, version: adminReload.json.version })
  });
  assert.equal(deniedSave.res.status, 403);
  const deniedExport = await api(base, viewer.cookie, '/api/exports', { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) });
  assert.equal(deniedExport.res.status, 403);

  const granted = await api(base, admin.cookie, '/api/members', {
    method: 'PUT',
    body: JSON.stringify({ email: 'view@example.com', role: 'viewer', canExport: true })
  });
  assert.equal(granted.res.status, 200, granted.json.error);
  const exporter = await login(base, { email: 'view@example.com' });
  const allowedExport = await api(base, exporter.cookie, '/api/exports', { method: 'POST', body: JSON.stringify({ kind: 'pdf' }) });
  assert.equal(allowedExport.res.status, 200);

  const span = await api(base, editor.cookie, '/api/org/span/POS-003');
  assert.equal(span.res.status, 200);
  assert.ok(span.json.descendants >= 1);

  const hidden = await api(base, editor.cookie, '/api/org/people/EMP-001');
  assert.equal(hidden.res.status, 404);

  const tokenRes = await api(base, editor.cookie, '/api/tokens', { method: 'POST', body: JSON.stringify({ name: 'mcp-test' }) });
  assert.equal(tokenRes.res.status, 201);
  const mcpAuth = await fetch(base + '/api/org/summary', { headers: { authorization: 'Bearer ' + tokenRes.json.token } });
  assert.equal(mcpAuth.status, 200);
  const summary = await mcpAuth.json();
  assert.ok(summary.positions < 17);

  const mcpList = handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, () => scoped.json.workspace);
  assert.ok(mcpList.result.tools.some(t => t.name === 'span_of_control'));

  const audit = await api(base, admin.cookie, '/api/audit');
  assert.equal(audit.res.status, 200);
  const actions = audit.json.events.map(e => e.action);
  assert.ok(actions.includes('load'));
  assert.ok(actions.includes('save'));
  assert.ok(actions.includes('export'));

  const viewerAudit = await api(base, viewer.cookie, '/api/audit');
  assert.equal(viewerAudit.res.status, 403);
});
