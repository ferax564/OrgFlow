'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { extractPlanningJson, listRandomPortOrigins, scanLegacyProfiles } = require('../desktop/recover.cjs');
const OrgFlow = require('../js/orgflow-core.js');

test('legacy localStorage extractor recovers a planning JSON blob', () => {
  const planning = OrgFlow.emptyWorkspace('2026-09-16');
  planning.workspaceId = 'ws-legacy';
  planning.revision = 4;
  const noise = 'xxxxx' + JSON.stringify(planning) + '\x00more';
  const found = extractPlanningJson(noise);
  assert.equal(found.length, 1);
  assert.equal(found[0].planning.workspaceId, 'ws-legacy');
  assert.equal(found[0].planning.revision, 4);
});

test('random-port IndexedDB origin folders are listed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-legacy-'));
  fs.mkdirSync(path.join(tmp, 'IndexedDB', 'http_127.0.0.1_44531.indexeddb.leveldb'), { recursive: true });
  const origins = listRandomPortOrigins(tmp);
  assert.equal(origins.length, 1);
  assert.equal(origins[0].origin, 'http://127.0.0.1:44531');
  const scan = scanLegacyProfiles([tmp]);
  assert.equal(scan.origins.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
});
