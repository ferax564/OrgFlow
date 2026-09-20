'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspaceStore } = require('../desktop/store.cjs');

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-store-')); }
function doc(rev, at = '2026-09-16T10:00:00Z') {
  return JSON.stringify({ version: 2, schema: 2, workspaceId: 'ws-t', revision: rev, lastCommittedAt: at, activeScenarioId: 'current', scenarios: [] });
}

test('journal save→load round-trips and writes a rotating backup', () => {
  const dir = tmpdir();
  const store = createWorkspaceStore([dir]);
  store.save(doc(1));
  store.save(doc(2, '2026-09-16T11:00:00Z'));
  const found = store.load();
  assert.equal(JSON.parse(found.text).revision, 2);
  const backups = fs.readdirSync(path.join(dir, 'workspace-backups')).filter(f => f.endsWith('.json'));
  assert.equal(backups.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('newest revision wins across the primary and mirror directories', () => {
  const a = tmpdir(), b = tmpdir();
  const store = createWorkspaceStore([a, b]);
  store.save(doc(3));
  // A newer copy only in the mirror dir still wins on load.
  fs.writeFileSync(path.join(b, 'workspace.json'), doc(9, '2026-09-16T12:00:00Z'));
  assert.equal(JSON.parse(store.load().text).revision, 9);
  fs.rmSync(a, { recursive: true, force: true });
  fs.rmSync(b, { recursive: true, force: true });
});

test('load falls back to backups when the primary file is unreadable', () => {
  const dir = tmpdir();
  const store = createWorkspaceStore([dir]);
  store.save(doc(5));
  fs.writeFileSync(path.join(dir, 'workspace.json'), '{corrupt');
  const found = store.load();
  assert.ok(found, 'a backup is found');
  assert.equal(JSON.parse(found.text).revision, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('backups rotate to the cap', () => {
  const dir = tmpdir();
  const store = createWorkspaceStore([dir]);
  for (let i = 1; i <= 14; i++) store.save(doc(i, `2026-09-16T${String(i).padStart(2, '0')}:00:00Z`));
  const backups = fs.readdirSync(path.join(dir, 'workspace-backups')).filter(f => f.endsWith('.json'));
  assert.ok(backups.length <= 10, `expected ≤10 backups, got ${backups.length}`);
  assert.equal(JSON.parse(store.load().text).revision, 14);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('save rejects non-JSON and reports directories written', () => {
  const dir = tmpdir();
  const store = createWorkspaceStore([dir]);
  assert.throws(() => store.save('not json'), /valid JSON/);
  assert.throws(() => store.save('{}'), /valid JSON/);
  assert.equal(store.save(doc(1)).wrote, 1);
  assert.equal(store.load().dirs.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a newly opened workspace beats an older workspace with a higher revision', t => {
  const a = tmpdir(), b = tmpdir();
  t.after(() => { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(a, 'workspace.json'), doc(900, '2026-09-16T10:00:00Z'));
  fs.writeFileSync(path.join(b, 'workspace.json'), JSON.stringify({ ...JSON.parse(doc(1, '2026-09-17T10:00:00Z')), workspaceId: 'new-chart' }));
  assert.equal(JSON.parse(createWorkspaceStore([a, b]).load().text).workspaceId, 'new-chart');
});

test('backup rotation retains newly opened low-revision documents', t => {
  const dir = tmpdir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = createWorkspaceStore([dir]);
  for (let i = 0; i < 12; i++) {
    const before = new Set(fs.existsSync(path.join(dir, 'workspace-backups')) ? fs.readdirSync(path.join(dir, 'workspace-backups')) : []);
    store.save(doc(i < 11 ? 900 + i : 1));
    const added = fs.readdirSync(path.join(dir, 'workspace-backups')).find(name => !before.has(name));
    assert.ok(added, 'new backup must not be immediately rotated out');
    fs.utimesSync(path.join(dir, 'workspace-backups', added), 1000 + i, 1000 + i);
  }
  fs.writeFileSync(path.join(dir, 'workspace.json'), '{broken');
  assert.equal(JSON.parse(store.load().text).revision, 1);
});
