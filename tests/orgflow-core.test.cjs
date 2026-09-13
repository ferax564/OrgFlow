const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const OrgFlow = require('../js/orgflow-core.js');

const harbor = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));
const northstar = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/northstar-commerce/workspace.json'), 'utf8'));

test('example workspaces are valid OrgFlow backups', () => {
  for (const sample of [harbor, northstar]) {
    assert.equal(sample.format, 'orgflow.workspace');
    const planning = OrgFlow.validatePlanning(sample.planning);
    assert.equal(planning.scenarios.length, 2);
    assert.ok(planning.scenarios.some(s => s.id === 'current'));
    assert.ok(planning.scenarios.some(s => s.id !== 'current'));
  }
});

test('example companies are generic, not motorsport', () => {
  const blob = JSON.stringify(harbor) + JSON.stringify(northstar) + fs.readFileSync(path.join(__dirname, '../js/examples.js'), 'utf8');
  for (const banned of ['Vehicle Performance', 'Vehicle Dynamics', 'Tyre', 'Simulator', 'Driver-in-loop', 'motorsport', 'Formula']) {
    assert.equal(blob.includes(banned), false, `found banned term: ${banned}`);
  }
  assert.match(harbor.branding.companyName, /Harbor/);
  assert.match(northstar.branding.companyName, /Northstar/);
});

test('csvEscape prefixes spreadsheet formulas', () => {
  assert.equal(OrgFlow.csvEscape('=1+1'), '"\'=1+1"');
  assert.equal(OrgFlow.csvEscape('+cmd'), '"\'+cmd"');
  assert.equal(OrgFlow.csvEscape('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(OrgFlow.csvEscape('Alex "A." Morgan'), '"Alex ""A."" Morgan"');
});

test('parseCSV supports quotes, BOM and semicolon delimiters', () => {
  const rows = OrgFlow.parseCSV('\ufeffname;title\r\n"Morgan, Alex";"Head of Product"\r\n');
  assert.deepEqual(rows[0], ['name', 'title']);
  assert.deepEqual(rows[1], ['Morgan, Alex', 'Head of Product']);
});

test('parseCSV rejects unbalanced quotes', () => {
  assert.throws(() => OrgFlow.parseCSV('name\n"Alex'), /not closed/);
});

test('header aliases map position and manager columns', () => {
  const map = OrgFlow.headerMap(['Position ID', 'Reports To Position ID', 'Title', 'FTE']);
  assert.equal(map.id, 0);
  assert.equal(map.managerId, 1);
  assert.equal(map.title, 2);
  assert.equal(map.fte, 3);
});

test('normalizeType understands generic company roles', () => {
  const warnings = [];
  assert.equal(OrgFlow.normalizeType('Director', warnings, 2), 'Head');
  assert.equal(OrgFlow.normalizeType('Product Manager', warnings, 3), 'Specialist');
  assert.equal(OrgFlow.normalizeType('Designer', warnings, 4), 'Specialist');
  assert.equal(OrgFlow.normalizeType('Software Engineer', warnings, 5), 'Engineer');
  assert.equal(OrgFlow.normalizeType('Wizard', warnings, 6), 'Engineer');
  assert.equal(warnings.length, 1);
});

test('validateScenarioData rejects cycles and dual assignment', () => {
  const employees = [{ id: 'E1', name: 'Alex' }, { id: 'E2', name: 'Maya' }];
  assert.throws(() => OrgFlow.validateScenarioData({
    employees,
    positions: [
      { id: 'A', managerId: 'B', title: 'One', type: 'Head', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E1', startDate: '2026-01-01', endDate: '' },
      { id: 'B', managerId: 'A', title: 'Two', type: 'Engineer', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E2', startDate: '2026-01-01', endDate: '' }
    ]
  }), /cycle/);

  assert.throws(() => OrgFlow.validateScenarioData({
    employees: [{ id: 'E1', name: 'Alex' }],
    positions: [
      { id: 'A', managerId: '', title: 'One', type: 'Head', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E1', startDate: '', endDate: '' },
      { id: 'B', managerId: 'A', title: 'Two', type: 'Engineer', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E1', startDate: '', endDate: '' }
    ]
  }), /only one position/);
});

test('validateScenarioData accepts vacant and recruiting seats', () => {
  const data = OrgFlow.validateScenarioData({
    employees: [{ id: 'E1', name: 'Alex' }],
    positions: [
      { id: 'A', managerId: '', title: 'Head of Product', type: 'Head', group: 'Product', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E1', startDate: '2026-01-01', endDate: '' },
      { id: 'B', managerId: 'A', title: 'Designer', type: 'Specialist', group: 'Design', fte: 0.5, status: 'Not approved', hiringState: 'Vacant', personId: '', startDate: '', endDate: '' },
      { id: 'C', managerId: 'A', title: 'Graduate', type: 'Graduate', group: 'Product', fte: 1, status: 'Approved', hiringState: 'Recruiting', personId: '', startDate: '2026-09-01', endDate: '2027-08-31' }
    ]
  });
  assert.equal(data.positions.length, 3);
});

test('scenarioChanges matches stable IDs', () => {
  const current = harbor.planning.scenarios.find(s => s.id === 'current');
  const growth = harbor.planning.scenarios.find(s => s.id === 'scenario-fy27-growth');
  const changes = OrgFlow.scenarioChanges(current, growth);
  const added = changes.filter(c => c.kind === 'added');
  const changed = changes.filter(c => c.kind === 'changed');
  assert.ok(added.some(c => c.id === 'POS-018'));
  assert.ok(changed.some(c => c.id === 'POS-017'));
  assert.ok(changed.some(c => c.id === 'POS-009'));
});

test('CSV import can replace a small generic team', () => {
  const source = OrgFlow.emptyWorkspace('2026-09-13').scenarios[0];
  const csv = [
    'positionId,reportsToPositionId,title,type,group,fte,approval,hiringState,personId,name,startDate,endDate',
    'POS-001,,Head of Product,Head,Product,1,Approved,Filled,EMP-001,Alex Morgan,2026-01-01,',
    'POS-002,POS-001,Product Manager,Specialist,Product,1,Approved,Vacant,,,2026-06-01,'
  ].join('\n');
  const prepared = OrgFlow.prepareImport(csv, 'team.csv', source);
  assert.equal(prepared.errors.length, 0, prepared.errors.join('; '));
  const merged = OrgFlow.makeImportScenario(prepared, 'replace', source);
  assert.equal(merged.positions.length, 2);
  assert.equal(merged.positions[1].hiringState, 'Vacant');
});

test('empty workspace is a single vacant head', () => {
  const ws = OrgFlow.emptyWorkspace('2026-09-13');
  assert.equal(ws.scenarios[0].positions.length, 1);
  assert.equal(ws.scenarios[0].positions[0].hiringState, 'Vacant');
  assert.equal(ws.scenarios[0].employees.length, 0);
});

test('example CSV files round-trip through import', () => {
  for (const file of ['harbor-and-co', 'northstar-commerce']) {
    const csv = fs.readFileSync(path.join(__dirname, `../examples/${file}/positions.csv`), 'utf8');
    const source = OrgFlow.emptyWorkspace('2026-09-13').scenarios[0];
    source.id = 'current';
    const prepared = OrgFlow.prepareImport(csv, 'positions.csv', source);
    assert.equal(prepared.errors.length, 0, `${file}: ${prepared.errors.join('; ')}`);
    const merged = OrgFlow.makeImportScenario(prepared, 'replace', source);
    assert.ok(merged.positions.length >= 14);
  }
});

test('sanitizeChipFilters keeps new role types when every legacy type was selected', () => {
  const all = OrgFlow.ROLE_TYPES;
  const legacy = OrgFlow.LEGACY_ROLE_TYPES;
  assert.deepEqual(OrgFlow.sanitizeChipFilters(undefined, all, legacy), all);
  assert.deepEqual(OrgFlow.sanitizeChipFilters(legacy, all, legacy), all);
  assert.deepEqual(OrgFlow.sanitizeChipFilters(['Head'], all, legacy), ['Head']);
  assert.deepEqual(OrgFlow.sanitizeChipFilters(['Head', 'Specialist'], all, legacy), ['Head', 'Specialist']);
  assert.equal(OrgFlow.sanitizeChipFilters(legacy, all, legacy).includes('Specialist'), true);
});

test('wouldCreateCycle detects a reporting loop before it is saved', () => {
  const positions = [
    { id: 'A', managerId: '' },
    { id: 'B', managerId: 'A' },
    { id: 'C', managerId: 'B' }
  ];
  assert.equal(OrgFlow.wouldCreateCycle(positions, 'A', 'C'), true);
  assert.equal(OrgFlow.wouldCreateCycle(positions, 'C', 'A'), false);
  assert.equal(OrgFlow.wouldCreateCycle(positions, 'B', ''), false);
  assert.equal(OrgFlow.wouldCreateCycle(positions, 'B', 'B'), true);
});

test('dotted-line managers must exist and differ from the solid line', () => {
  const employees = [{ id: 'E1', name: 'Alex' }, { id: 'E2', name: 'Maya' }];
  const base = (extra) => ({
    employees,
    positions: [
      { id: 'A', managerId: '', secondaryManagerId: '', title: 'Head', type: 'Head', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E1', startDate: '', endDate: '', location: 'London', costCenter: 'EXE', jobFamily: 'Leadership' },
      extra
    ]
  });
  const ok = OrgFlow.validateScenarioData(base({ id: 'B', managerId: 'A', secondaryManagerId: '', title: 'Lead', type: 'Team Leader', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E2', startDate: '', endDate: '', location: 'London', costCenter: 'ENG', jobFamily: 'Engineering' }));
  assert.equal(ok.positions[0].location, 'London');
  assert.throws(() => OrgFlow.validateScenarioData(base({ id: 'B', managerId: 'A', secondaryManagerId: 'A', title: 'Lead', type: 'Team Leader', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E2', startDate: '', endDate: '' })), /differ from the solid/);
  assert.throws(() => OrgFlow.validateScenarioData(base({ id: 'B', managerId: 'A', secondaryManagerId: 'Z', title: 'Lead', type: 'Team Leader', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E2', startDate: '', endDate: '' })), /missing dotted-line/);
});

test('CSV round-trip keeps location, cost center, job family and employee number', () => {
  const source = OrgFlow.emptyWorkspace('2026-09-13').scenarios[0];
  const csv = [
    OrgFlow.POSITION_CSV_COLUMNS.join(','),
    'POS-001,,,Head of Product,Head,Product,1,Approved,Filled,EMP-001,Alex Morgan,E-101,2026-01-01,,London,PRD,Product',
    'POS-002,POS-001,,Head of Engineering,Head,Engineering,1,Approved,Filled,EMP-003,Elena Voss,E-200,2026-01-01,,Berlin,ENG,Engineering',
    'POS-003,POS-001,POS-002,Product Manager,Specialist,Product,1,Approved,Filled,EMP-002,Sam Rivera,E-118,2026-01-01,,Remote,PRD,Product'
  ].join('\n');
  const prepared = OrgFlow.prepareImport(csv, 'team.csv', source);
  assert.equal(prepared.errors.length, 0, prepared.errors.join('; '));
  const merged = OrgFlow.makeImportScenario(prepared, 'replace', source);
  assert.equal(merged.positions[0].location, 'London');
  assert.equal(merged.positions[0].costCenter, 'PRD');
  assert.equal(merged.positions[2].secondaryManagerId, 'POS-002');
  assert.equal(merged.employees.find(e => e.id === 'EMP-001').employeeNumber, 'E-101');
  const exported = OrgFlow.positionCSVValues(merged.positions[2], merged);
  assert.equal(exported[2], 'POS-002');
  assert.equal(exported[11], 'E-118');
});

test('starter templates validate as planning workspaces', () => {
  require('../js/templates.js');
  const templates = globalThis.ORGFLOW_TEMPLATES;
  assert.ok(templates['first-light'] && templates['lumen-studio'] && templates['cedar-kind']);
  for (const [id, t] of Object.entries(templates)) {
    const planning = OrgFlow.validatePlanning(t.planning);
    assert.equal(planning.scenarios[0].name, 'Current', id);
    assert.ok(planning.scenarios[0].positions.some(p => p.secondaryManagerId), `${id} should demonstrate a dotted line`);
    assert.ok(planning.scenarios[0].positions.every(p => p.location), `${id} should have locations`);
  }
});
