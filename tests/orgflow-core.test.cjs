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
    'POS-001,,,Head of Product,Head,Product,1,Approved,Filled,EMP-001,Alex Morgan,E-101,2026-01-01,,London,PRD,Product,0,',
    'POS-002,POS-001,,Head of Engineering,Head,Engineering,1,Approved,Filled,EMP-003,Elena Voss,E-200,2026-01-01,,Berlin,ENG,Engineering,1,',
    'POS-003,POS-001,POS-002,Product Manager,Specialist,Product,1,Approved,Filled,EMP-002,Sam Rivera,E-118,2026-01-01,,Remote,PRD,Product,2,'
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

test('custom position levels are stored and accepted on positions', () => {
  const ws = OrgFlow.emptyWorkspace('2026-09-13');
  ws.positionLevels = ['Principal'];
  ws.scenarios[0].positions.push({
    id: 'POS-002', managerId: 'POS-001', title: 'Principal engineer', type: 'Principal', group: 'Engineering',
    fte: 1, status: 'Approved', hiringState: 'Vacant', personId: '', startDate: '', endDate: '', location: '', costCenter: '', jobFamily: ''
  });
  const checked = OrgFlow.validatePlanning(ws);
  assert.deepEqual(checked.positionLevels, ['Principal']);
  assert.equal(checked.scenarios[0].positions[1].type, 'Principal');
  assert.throws(() => OrgFlow.validateScenarioData({
    employees: [],
    positions: [{ id: 'A', managerId: '', title: 'X', type: 'Wizard', group: 'G', fte: 1, status: 'Approved', hiringState: 'Vacant', personId: '', startDate: '', endDate: '' }]
  }), /Unknown position type/);
});

test('wrapText wraps long names instead of truncating', () => {
  const lines = OrgFlow.wrapText('Alexandria Catherine Montgomery-Reeves', 80, 7);
  assert.ok(lines.length >= 2);
  assert.ok(lines.every(line => line.length * 7 <= 90));
});

test('cards grow only when their own text wraps', () => {
  const short = OrgFlow.cardMetrics({ title: 'Engineer', name: 'Alex', type: 'Engineer', group: 'Product', location: 'London', hiringState: 'Filled' });
  const long = OrgFlow.cardMetrics({ title: 'Principal product operations and customer research lead', name: 'Alexandria Catherine Montgomery-Reeves', type: 'Engineer', group: 'Product operations and research', location: 'London Paddington Campus', hiringState: 'Filled' });
  assert.ok(long.height > short.height);
  const hidden = OrgFlow.cardMetrics({ title: 'Engineer', name: 'Alex', type: 'Engineer', group: 'Product', location: 'London', hiringState: 'Filled' }, { group: false, site: false, type: false, approval: false, hiring: false, fte: false });
  assert.ok(hidden.height <= short.height);
});

test('default stacking applies only to last-level managers', () => {
  const ic = { id: 'e', title: 'Engineer', type: 'Engineer', children: [] };
  const lead = { id: 'l', title: 'Lead', type: 'Team Leader', children: [ic] };
  const head = { id: 'h', title: 'Head', type: 'Head', children: [lead] };
  assert.equal(OrgFlow.defaultStacked(head), false);
  assert.equal(OrgFlow.defaultStacked(lead), true);
  assert.equal(OrgFlow.nodeStacked({ ...head, stacked: true }), true);
  assert.equal(OrgFlow.nodeStacked({ ...lead, stacked: false }), false);
});

test('stacked reports sit vertically under the manager with a left-side trunk', () => {
  const tree = [{
    id: 'm', title: 'Lead', type: 'Team Leader', stacked: true, _cardH: 110, _cardW: 248, children: [
      { id: 'a', title: 'A', type: 'Engineer', children: [], _cardH: 100, _cardW: 200 },
      { id: 'b', title: 'B', type: 'Engineer', children: [], _cardH: 100, _cardW: 200 }
    ]
  }];
  const lay = OrgFlow.layoutOrgChart(tree, { groupGap: 40 });
  const m = lay.all.find(n => n.id === 'm');
  const a = lay.all.find(n => n.id === 'a');
  const b = lay.all.find(n => n.id === 'b');
  assert.ok(a._y > m._y + m._h - 1);
  assert.ok(b._y > a._y);
  assert.ok(Math.abs(a._x - b._x) < 1, 'stacked cards should share an x');
  assert.ok(Math.abs((a._x + a._w / 2) - (m._x + m._w / 2)) < 1, 'stacked reports should center under the manager');
  assert.ok(lay.connectors.some(c => c.kind === 'stack-trunk'));
  const lead = lay.connectors.find(c => c.kind === 'stack-lead');
  assert.match(lead.d, new RegExp(`M${m._x + m._w / 2},${m._y + m._h}`));
  const dropY = Number(lead.d.match(/V([\d.]+)/)[1]);
  assert.ok(dropY >= m._y + m._h + 18, 'stack lead should clear the collapse control before turning to the trunk');
  const spur = lay.connectors.find(c => c.kind === 'stack-spur' && c.toId === 'a');
  assert.match(spur.d, new RegExp(`H${a._x}$`));
});

test('unstacked reporting lines meet child card centers from the manager bottom', () => {
  const tree = [{
    id: 'h', title: 'Head', type: 'Head', stacked: false, _cardH: 110, children: [
      { id: 'a', title: 'A', type: 'Team Leader', stacked: true, _cardH: 110, children: [
        { id: 'a1', title: 'IC', type: 'Engineer', children: [], _cardH: 100 }
      ] },
      { id: 'b', title: 'B', type: 'Team Leader', stacked: false, children: [], _cardH: 150 }
    ]
  }];
  const lay = OrgFlow.layoutOrgChart(tree, { groupGap: 40 });
  const h = lay.all.find(n => n.id === 'h');
  const a = lay.all.find(n => n.id === 'a');
  const a1 = lay.all.find(n => n.id === 'a1');
  const b = lay.all.find(n => n.id === 'b');
  assert.ok(Math.abs(a._y - b._y) < 1, 'same-level cards should share a y even when card heights differ');
  assert.ok(Math.abs((a._x + a._w / 2) - (a1._x + a1._w / 2)) < 1, 'stacked IC should sit in the manager column');
  const drop = lay.connectors.find(c => c.kind === 'tree-drop' && c.fromId === 'h');
  const bus = lay.connectors.find(c => c.kind === 'tree-bus' && c.fromId === 'h');
  const down = lay.connectors.find(c => c.kind === 'tree-down' && c.toId === 'a');
  const mx = h._x + h._w / 2;
  const busY = Number(drop.d.match(/V([\d.]+)/)[1]);
  assert.match(drop.d, new RegExp(`M${mx},${h._y + h._h}`));
  assert.match(down.d, new RegExp(`M${a._x + a._w / 2},${busY}`));
  assert.match(down.d, new RegExp(`V${a._y}$`));
  const busStart = Number(bus.d.match(/M([\d.]+)/)[1]);
  const busEnd = Number(bus.d.match(/H([\d.]+)/)[1]);
  assert.ok(Math.min(busStart, busEnd) <= mx && mx <= Math.max(busStart, busEnd), 'horizontal bus should include the manager center so drops meet');
});

test('unstacked groups use configurable horizontal spacing', () => {
  const tree = (gap) => {
    const kids = [
      { id: 'a', title: 'A', type: 'Team Leader', stacked: false, children: [], _cardW: 248, _cardH: 100 },
      { id: 'b', title: 'B', type: 'Team Leader', stacked: false, children: [], _cardW: 248, _cardH: 100 }
    ];
    return OrgFlow.layoutOrgChart([{ id: 'h', title: 'Head', type: 'Head', stacked: false, children: kids, _cardH: 110 }], { groupGap: gap });
  };
  const tight = tree(20), wide = tree(80);
  const span = lay => {
    const a = lay.all.find(n => n.id === 'a'), b = lay.all.find(n => n.id === 'b');
    return b._x - a._x;
  };
  assert.ok(span(wide) - span(tight) >= 55);
});

test('first sibling can move down and order persists', () => {
  const positions = [
    { id: 'm', managerId: '', sortOrder: 0, title: 'Head', type: 'Head', name: 'Pat' },
    { id: 'a', managerId: 'm', sortOrder: 0, title: 'Alpha', type: 'Engineer', name: 'Ada' },
    { id: 'b', managerId: 'm', sortOrder: 1, title: 'Beta', type: 'Engineer', name: 'Bea' }
  ];
  const first = OrgFlow.siblingIndex(positions, 'a');
  assert.equal(first.index, 0);
  const moved = OrgFlow.reorderSiblings(positions, 'a', 1);
  assert.equal(OrgFlow.siblingIndex(moved, 'a').index, 1);
  assert.equal(OrgFlow.siblingIndex(moved, 'b').index, 0);
  assert.equal(moved.find(p => p.id === 'a').sortOrder, 1);
  const unchanged = OrgFlow.reorderSiblings(positions, 'a', -1);
  assert.equal(OrgFlow.siblingIndex(unchanged, 'a').index, 0);
});

test('saving keeps stacking when the field is omitted from a replacement object', () => {
  const data = OrgFlow.validateScenarioData({
    employees: [{ id: 'E1', name: 'Alex' }],
    positions: [
      { id: 'A', managerId: '', title: 'Head', type: 'Head', group: 'G', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'E1', startDate: '', endDate: '', stacked: true, sortOrder: 3 }
    ]
  });
  assert.equal(data.positions[0].stacked, true);
  assert.equal(data.positions[0].sortOrder, 3);
});

test('cumulative people count includes the full reporting subtree', () => {
  const positions = [
    { id: 'h', managerId: '', hiringState: 'Filled' },
    { id: 'l', managerId: 'h', hiringState: 'Filled' },
    { id: 'e1', managerId: 'l', hiringState: 'Filled' },
    { id: 'e2', managerId: 'l', hiringState: 'Vacant' },
    { id: 'e3', managerId: 'l', hiringState: 'Recruiting' }
  ];
  assert.equal(OrgFlow.subtreePeopleCount(positions, 'h'), 3);
  assert.equal(OrgFlow.subtreePeopleCount(positions, 'l'), 2);
  assert.equal(OrgFlow.showsCumulativeCount('Head'), true);
  assert.equal(OrgFlow.showsCumulativeCount('Team Leader'), true);
  assert.equal(OrgFlow.showsCumulativeCount('Engineer'), false);
});

test('workspace backup keeps reporting order after round-trip validation', () => {
  const ws = OrgFlow.emptyWorkspace('2026-09-13');
  ws.scenarios[0].positions[0].sortOrder = 2;
  ws.scenarios[0].positions[0].stacked = false;
  const again = OrgFlow.validatePlanning(JSON.parse(JSON.stringify(ws)));
  assert.equal(again.scenarios[0].positions[0].sortOrder, 2);
  assert.equal(again.scenarios[0].positions[0].stacked, false);
  assert.deepEqual(again.positionLevels, []);
});

