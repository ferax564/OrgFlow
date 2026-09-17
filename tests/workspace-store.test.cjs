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
  assert.equal(store.save(doc(1)).wrote, 1);
  assert.equal(store.load().dirs.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
