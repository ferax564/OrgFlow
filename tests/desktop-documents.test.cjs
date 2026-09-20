'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDocuments } = require('../desktop/documents.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-documents-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, file: path.join(dir, 'chart.orgflow'), docs: createDocuments(dir) };
}
test('native file grants persist recent files only after acceptance and survive restart', t => {
  const { dir, file, docs } = fixture(t);
  fs.writeFileSync(file, '{"revision":1}');
  const picked = docs.grant(file);
  assert.equal(docs.list().length, 0);
  docs.remember(picked.token);
  const reopened = createDocuments(dir).openRecent(0);
  assert.equal(reopened.text, '{"revision":1}');
  assert.notEqual(reopened.token, picked.token);
});
test('native saves require a granted token and refuse external modifications', t => {
  const { file, docs } = fixture(t);
  const picked = docs.grant(file, false);
  assert.throws(() => docs.save(file, '{}'), /Choose/);
  docs.save(picked.token, '{"revision":1}');
  fs.writeFileSync(file, '{"external":true}');
  assert.throws(() => docs.save(picked.token, '{"revision":2}'), /changed outside/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{"external":true}');
  assert.throws(() => docs.openRecent(99), /unavailable/);
});
test('invalid JSON and oversized native writes preserve the previous file', t => {
  const { file, docs } = fixture(t);
  const picked = docs.grant(file, false);
  docs.save(picked.token, '{}');
  assert.throws(() => docs.save(picked.token, '{broken'));
  assert.throws(() => docs.save(picked.token, ' '.repeat(12 * 1024 * 1024 + 1)), /12 MB/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}');
});
