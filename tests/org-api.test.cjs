'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp, handleMcp, APP_VERSION, MCP_PROTOCOL } = require('../server/lib/app');

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
  const res = await fetch(base + '/auth/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  assert.equal(res.status, 200, json.error || 'login');
  return { json, cookie: cookie(res) };
}
async function api(base, cookieHeader, pathname, opts = {}) {
  const res = await fetch(base + pathname, {
    ...opts,
    headers: { accept: 'application/json', cookie: cookieHeader, ...(opts.body ? { 'content-type': 'application/json' } : {}), ...opts.headers }
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { res, json };
}

test('org API reports workspace context and new query tools', async t => {
  const app = createApp({ memory: true, env: { AUTH_MODE: 'dev', SESSION_SECRET: 'test-secret', TENANT_NAME: 'Harbor' } });
  const base = await listen(app);
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const admin = await login(base, { email: 'admin@example.com', role: 'admin', canExport: true });
  const saved = await api(base, admin.cookie, '/api/workspace', { method: 'PUT', body: JSON.stringify({ workspace: harbor, version: 1 }) });
  assert.equal(saved.res.status, 200, saved.json.error);

  const summary = await api(base, admin.cookie, '/api/org/summary');
  assert.equal(summary.res.status, 200);
  assert.ok(summary.json.context.workspaceId);
  assert.equal(summary.json.context.serverVersion, APP_VERSION);
  assert.equal(summary.json.context.serverDocumentVersion, saved.json.version);

  const status = await api(base, admin.cookie, '/api/org/status');
  assert.equal(status.res.status, 200);
  assert.equal(status.json.storage, 'shared-server');
  assert.equal(status.json.context.revision, summary.json.context.revision);

  const init = handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize' }, () => saved.json.workspace);
  assert.equal(init.result.protocolVersion, MCP_PROTOCOL);
  assert.equal(init.result.serverInfo.version, APP_VERSION);

  const listed = handleMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, () => saved.json.workspace);
  const names = listed.result.tools.map(t => t.name);
  for (const name of ['get_workspace_status', 'get_changes_since', 'explain_capacity_gap', 'preview_proposal', 'validate_proposal', 'create_share_snapshot']) {
    assert.ok(names.includes(name), name);
  }

  const changes = await api(base, admin.cookie, '/api/org/changes?sinceVersion=1');
  assert.equal(changes.res.status, 200, changes.json.error);
  assert.ok(Array.isArray(changes.json.changes));

  const gap = await api(base, admin.cookie, '/api/org/capacity-gap?months=2');
  assert.equal(gap.res.status, 200, gap.json.error);
  assert.ok(Array.isArray(gap.json.gaps));
  assert.match(gap.json.assumptions, /Demand gap/);

  const preview = await api(base, admin.cookie, '/api/org/preview-proposal', {
    method: 'POST',
    body: JSON.stringify({ name: 'Title tweak', rationale: 'Preview only', changes: [{ entity: 'positions', id: 'POS-003', operation: 'upsert', values: { title: 'VP Engineering' } }] })
  });
  assert.equal(preview.res.status, 200, preview.json.error);
  assert.equal(preview.json.ok, true);
  assert.ok(preview.json.changes.some(c => c.id === 'POS-003' || c.kind === 'changed'));

  const after = await api(base, admin.cookie, '/api/workspace');
  assert.equal(after.json.version, saved.json.version, 'preview must not bump the server document');

  const share = await api(base, admin.cookie, '/api/org/share-snapshot', {
    method: 'POST',
    body: JSON.stringify({ rootId: 'POS-003', include: { group: true }, html: true })
  });
  assert.equal(share.res.status, 200, share.json.error);
  assert.equal(share.json.dataset.redacted, true);
  assert.ok(share.json.html.includes('orgflow-share'));
  assert.ok(!JSON.stringify(share.json.dataset).includes('POS-001') || share.json.dataset.scope.rootId === 'POS-003');

  const spec = await api(base, admin.cookie, '/api/openapi.json');
  assert.equal(spec.res.status, 200);
  assert.equal(spec.json.openapi, '3.0.3');

  const scoped = await login(base, { email: 'branch@example.com', role: 'viewer', canExport: false, scopePositionId: 'POS-003' });
  const scopedChanges = await api(base, scoped.cookie, '/api/org/changes?sinceVersion=' + saved.json.version);
  assert.equal(scopedChanges.res.status, 200);
  assert.deepEqual(scopedChanges.json.changes, [], 'same revision must not disclose other branches as removed positions');
  const mcpChanges = await api(base, scoped.cookie, '/api/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_changes_since', arguments: { sinceVersion: saved.json.version } } }) });
  assert.deepEqual(JSON.parse(mcpChanges.json.result.content[0].text).changes, []);
  const deniedShare = await api(base, scoped.cookie, '/api/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_share_snapshot', arguments: { html: true } } }) });
  assert.match(deniedShare.json.error.message, /not allowed to export/);
});
