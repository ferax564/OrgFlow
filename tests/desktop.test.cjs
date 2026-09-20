'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { allowedPath, portableUserData, startStaticServer } = require('../desktop/serve.cjs');

const root = path.resolve(__dirname, '..');

test('desktop file server allows planner assets and rejects traversal', () => {
  assert.ok(allowedPath(root, '/app.html').endsWith('app.html'));
  assert.ok(allowedPath(root, '/css/app.css').endsWith(path.join('css', 'app.css')));
  assert.ok(allowedPath(root, '/js/app.js').endsWith(path.join('js', 'app.js')));
  assert.equal(allowedPath(root, '/../package.json'), null);
  assert.equal(allowedPath(root, '/desktop/main.cjs'), null);
  assert.equal(allowedPath(root, '/server/index.js'), null);
  assert.equal(allowedPath(root, '/node_modules/electron/index.js'), null);
  assert.equal(allowedPath(root, '/%malformed'), null);
});

test('portable user data sits next to a Windows portable exe', () => {
  const dir = portableUserData({ PORTABLE_EXECUTABLE_DIR: 'D:\\Apps\\OrgFlow' }, 'D:\\Apps\\OrgFlow\\OrgFlow.exe');
  assert.equal(dir, path.join('D:\\Apps\\OrgFlow', 'OrgFlow-data'));
});

test('portable user data uses a sibling OrgFlow-data folder when present', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-portable-'));
  const folder = path.join(tmp, 'OrgFlow-data');
  fs.mkdirSync(folder);
  const exe = path.join(tmp, 'OrgFlow');
  assert.equal(portableUserData({}, exe), folder);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('desktop static server serves app.html over localhost only', async () => {
  const { url, close } = await startStaticServer(root);
  try {
    const res = await fetch(`${url}/app.html`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /OrgFlow/);
    const denied = await fetch(`${url}/desktop/main.cjs`);
    assert.equal(denied.status, 404);
  } finally {
    await close();
  }
});
