const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { descendantIds, filterDocument, mergeDocument } = require('../server/lib/subtree');
const { validateDocument } = require('../server/lib/document');

const harbor = validateDocument(JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8')));

test('engineering subtree from POS-003 excludes the CPO', () => {
  const current = harbor.planning.scenarios.find(s => s.id === 'current');
  const ids = descendantIds(current.positions, 'POS-003');
  assert.equal(ids.has('POS-003'), true);
  assert.equal(ids.has('POS-008'), true);
  assert.equal(ids.has('POS-001'), false);
  assert.equal(ids.has('POS-002'), false);
  const filtered = filterDocument(harbor, 'POS-003');
  const vis = filtered.planning.scenarios.find(s => s.id === 'current');
  assert.equal(vis.positions.some(p => p.id === 'POS-001'), false);
  assert.equal(vis.positions.find(p => p.id === 'POS-003').managerId, '');
  assert.ok(vis.employees.every(e => vis.positions.some(p => p.personId === e.id)));
});

test('scoped merge cannot rewrite seats outside the subtree', () => {
  const incoming = structuredClone(harbor);
  const current = incoming.planning.scenarios.find(s => s.id === 'current');
  current.positions.find(p => p.id === 'POS-001').title = 'Hacked CPO';
  current.positions.find(p => p.id === 'POS-008').title = 'Platform lead (scoped edit)';
  const merged = mergeDocument(harbor, incoming, 'POS-003');
  const storedCurrent = merged.planning.scenarios.find(s => s.id === 'current');
  assert.equal(storedCurrent.positions.find(p => p.id === 'POS-001').title, 'Chief Product Officer');
  assert.equal(storedCurrent.positions.find(p => p.id === 'POS-008').title, 'Platform lead (scoped edit)');
  assert.equal(storedCurrent.positions.find(p => p.id === 'POS-003').managerId, 'POS-001');
});

test('filtered scoped document still validates', () => {
  const filtered = filterDocument(harbor, 'POS-003');
  const again = validateDocument(filtered);
  assert.ok(again.planning.scenarios.find(s => s.id === 'current').positions.length >= 2);
});
