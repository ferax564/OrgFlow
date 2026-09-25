const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../js/seating-core.js');
const OrgFlow = require('../js/orgflow-core.js');
const { filterDocument } = require('../server/lib/subtree.js');
const Management = require('../js/management-core.js');

const harbor = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));
let seq = 0;
const ids = prefix => `${prefix || 'desk'}-${++seq}`;
function room(extra = {}) { return { ...S.createRoom({ id: 'R1', name: 'Studio', width: 1000, depth: 600, x: 0, y: 0 }), ...extra }; }

test('an absent seating plan stays absent and an empty one validates', () => {
  const plain = OrgFlow.validatePlanning(harbor.planning);
  assert.equal('seating' in plain, false, 'older documents are not rewritten with an empty seating key');
  assert.deepEqual(OrgFlow.validatePlanning({ ...harbor.planning, seating: { rooms: [] } }).seating, { rooms: [] });
});

test('rooms and desks round-trip through workspace validation', () => {
  const r = room();
  S.addDesks(r, [{ x: 200, y: 200 }, { x: 400, y: 200, rotation: 450 }], ids);
  r.desks[0].positionId = harbor.planning.scenarios[0].positions[0].id;
  const planning = OrgFlow.validatePlanning({ ...harbor.planning, seating: { rooms: [r] } });
  const again = OrgFlow.validatePlanning(JSON.parse(JSON.stringify(planning)));
  assert.deepEqual(again.seating, planning.seating);
  assert.equal(planning.seating.rooms[0].desks[1].rotation, 90, 'rotation normalises to 0–359');
  assert.deepEqual(planning.seating.rooms[0].desks.map(d => d.label), ['D1', 'D2']);
});

test('validation rejects double-booked positions, crossing walls and hot desks with owners', () => {
  const a = room(), b = room({ id: 'R2', name: 'Annex' });
  S.addDesks(a, [{ x: 200, y: 200 }], ids); S.addDesks(b, [{ x: 200, y: 200 }], ids);
  a.desks[0].positionId = 'POS-1'; b.desks[0].positionId = 'POS-1';
  assert.throws(() => S.sanitizeSeating({ rooms: [a, b] }), /assigned to two desks/);
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ outline: [[0, 0], [500, 500], [500, 0], [0, 500]] })] }), /cross/);
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ outline: [[0, 0], [10, 0], [10, 10]] })] }), /too small/);
  const hot = room(); S.addDesks(hot, [{ x: 200, y: 200 }], ids); hot.desks[0].hotDesk = true; hot.desks[0].positionId = 'POS-1';
  assert.throws(() => S.sanitizeSeating({ rooms: [hot] }), /hot desk/);
  assert.throws(() => S.sanitizeSeating({ rooms: [room(), room()] }), /Duplicate room/);
  assert.throws(() => S.sanitizeSeating({ rooms: 'nope' }), /rooms list/);
});

test('outlines drop repeated and collinear corners', () => {
  const clean = S.simplifyOutline([[0, 0], [500, 0], [1000, 0], [1000, 600], [1000, 600], [0, 600], [0, 0]]);
  assert.deepEqual(clean, [[0, 0], [1000, 0], [1000, 600], [0, 600]]);
  assert.equal(S.polygonArea(clean), 60);
});

test('desks inside an L-shaped room are detected, including concave corners', () => {
  const L = [[0, 0], [1000, 0], [1000, 400], [400, 400], [400, 1000], [0, 1000]];
  assert.equal(S.deskInsideRoom({ x: 200, y: 200, w: 160, h: 80, rotation: 0 }, L), true);
  assert.equal(S.deskInsideRoom({ x: 800, y: 800, w: 160, h: 80, rotation: 0 }, L), false, 'the missing quadrant is outside');
  assert.equal(S.deskInsideRoom({ x: 420, y: 420, w: 160, h: 80, rotation: 0 }, L), false, 'straddling the inner corner');
  assert.equal(S.deskInsideRoom({ x: 950, y: 200, w: 160, h: 80, rotation: 0 }, L), false, 'crossing the outer wall');
});

test('rotated desks overlap only when they really intersect', () => {
  const a = { x: 100, y: 100, w: 160, h: 80, rotation: 0 };
  assert.equal(S.desksOverlap(a, { ...a, x: 260 }), false, 'edge to edge is allowed');
  assert.equal(S.desksOverlap(a, { ...a, x: 250 }), true);
  assert.equal(S.desksOverlap(a, { ...a, x: 100, y: 180, rotation: 180 }), false, 'back-to-back bench');
  assert.equal(S.desksOverlap(a, { ...a, x: 200, y: 100, rotation: 90 }), true);
  const r = room(); S.addDesks(r, [{ x: 200, y: 200 }, { x: 250, y: 200 }, { x: 990, y: 300 }], ids);
  const issues = S.roomIssues(r);
  assert.deepEqual(issues.overlapping.sort(), [r.desks[0].id, r.desks[1].id].sort());
  assert.deepEqual(issues.outside, [r.desks[2].id]);
});

test('a dragged desk block fills back-to-back benches with aisles', () => {
  const desks = S.planDeskBlock({ x: 100, y: 100, w: 680, h: 440 }, { w: 160, h: 80, layout: 'pairs', spacing: 10, aisle: 120 });
  // 680 wide fits 4 desks (4*160 + 3*10 = 670); 440 deep fits bench (160) + aisle (120) + bench (160).
  assert.equal(desks.length, 16);
  assert.deepEqual([...new Set(desks.map(d => d.y))], [140, 220, 420, 500]);
  assert.deepEqual([...new Set(desks.map(d => d.rotation))], [180, 0]);
  for (let i = 0; i < desks.length; i++) for (let j = i + 1; j < desks.length; j++) assert.equal(S.desksOverlap(desks[i], desks[j]), false);
  const rows = S.planDeskBlock({ x: 0, y: 0, w: 340, h: 300 }, { w: 160, h: 80, layout: 'rows', spacing: 20, aisle: 100 });
  assert.equal(rows.length, 4);
  assert.equal(rows.every(d => d.rotation === 0), true);
  assert.deepEqual(S.planDeskBlock({ x: 0, y: 0, w: 100, h: 500 }, { w: 160, h: 80 }), [], 'too narrow for a desk');
  assert.equal(S.planDeskBlock({ x: 500, y: 300, w: -340, h: -180 }, { w: 160, h: 80 }).length, 4, 'dragging up-left works too');
});

test('labels continue from the highest number', () => {
  assert.deepEqual(S.nextDeskLabels(['D1', 'D9', 'Window', 'd3'], 2), ['D10', 'D11']);
  assert.deepEqual(S.nextDeskLabels([], 1, 'A-'), ['A-1']);
});

test('assigning a desk moves a position rather than double-booking it', () => {
  const r = room(); S.addDesks(r, [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 600, y: 200 }], ids);
  const seating = { rooms: [r] }, [d1, d2, d3] = r.desks;
  S.assignDesk(seating, d1.id, 'POS-A');
  const moved = S.assignDesk(seating, d2.id, 'POS-A');
  assert.equal(moved.movedFrom.desk.id, d1.id);
  assert.equal(d1.positionId, ''); assert.equal(d2.positionId, 'POS-A');
  const swap = S.assignDesk(seating, d2.id, 'POS-B');
  assert.equal(swap.displaced, 'POS-A');
  d3.hotDesk = true;
  assert.throws(() => S.assignDesk(seating, d3.id, 'POS-C'), /Hot desks/);
  S.assignDesk(seating, d2.id, '');
  assert.equal(d2.positionId, '');
  assert.equal(S.deskForPosition(seating, 'POS-B'), null);
});

test('auto-seat keeps groups together in reading order and skips seated, vacant and hot desks', () => {
  const r = room(); S.addDesks(r, S.planDeskBlock({ x: 0, y: 0, w: 1000, h: 160 }, { w: 160, h: 80, layout: 'pairs', spacing: 0 }), ids);
  r.desks.filter(d => d.y === 40).sort((a, b) => a.x - b.x)[1].hotDesk = true;
  const positions = [
    { id: 'P1', title: 'Lead', group: 'Sales', personId: 'E1' }, { id: 'P2', title: 'Rep', group: 'Sales', personId: 'E2' },
    { id: 'P3', title: 'Eng', group: 'Eng', personId: 'E3' }, { id: 'P4', title: 'Open', group: 'Eng', personId: '' },
    { id: 'P5', title: 'Seated', group: 'Eng', personId: 'E5' }
  ];
  const seating = { rooms: [r] };
  S.assignDesk(seating, r.desks.find(d => d.y === 120).id, 'P5');
  assert.equal(S.autoSeat(seating, 'R1', positions), 3);
  const top = r.desks.filter(d => d.y === 40).sort((a, b) => a.x - b.x).map(d => d.hotDesk ? 'hot' : d.positionId);
  assert.deepEqual(top.slice(0, 4), ['P3', 'hot', 'P1', 'P2']);
  assert.equal(S.summarize(seating, positions).unseatedPeople, 0);
  assert.equal(S.autoSeat(seating, 'R1', positions, { includeVacant: true }), 1, 'vacant seats can be reserved on request');
});

test('summary and CSV resolve occupants against the scenario', () => {
  const r = room({ floor: 'Level 2' }); S.addDesks(r, [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 600, y: 200 }, { x: 800, y: 200 }], ids);
  r.desks[0].positionId = 'P1'; r.desks[1].positionId = 'GONE'; r.desks[2].hotDesk = true;
  const positions = [{ id: 'P1', title: 'Designer', group: 'Design', location: 'HQ', personId: 'E1' }, { id: 'P2', title: 'Writer', group: 'Design', personId: 'E2' }];
  const sum = S.summarize({ rooms: [r] }, positions);
  assert.deepEqual({ desks: sum.desks, assigned: sum.assigned, hot: sum.hot, missing: sum.missing, free: sum.free, seated: sum.seatedPeople, unseated: sum.unseatedPeople }, { desks: 4, assigned: 1, hot: 1, missing: 1, free: 1, seated: 1, unseated: 1 });
  assert.equal(sum.rooms[0].area, 60);
  const rows = S.seatingRows({ rooms: [r] }, positions, [{ id: 'E1', name: 'Ada' }]);
  assert.deepEqual(rows[0], ['Studio', 'Level 2', 'D1', r.desks[0].id, 'no', 'P1', 'Designer', 'Ada', 'Design', 'HQ']);
  assert.equal(rows[1][6], '(not in this scenario)');
  assert.equal(S.clearMissing({ rooms: [r] }, new Set(['P1'])), 1);
});

test('duplicating a room copies the layout but not who sits there', () => {
  const r = room(); S.addDesks(r, [{ x: 200, y: 200 }], ids); r.desks[0].positionId = 'P1';
  const copy = S.duplicateRoom(r, ids);
  assert.notEqual(copy.id, r.id); assert.notEqual(copy.desks[0].id, r.desks[0].id);
  assert.equal(copy.desks[0].positionId, ''); assert.equal(copy.name, 'Studio (copy)');
  assert.doesNotThrow(() => S.sanitizeSeating({ rooms: [r, copy] }));
});

test('subtree members do not receive the organization-wide seating plan', () => {
  const r = room(); S.addDesks(r, [{ x: 200, y: 200 }], ids); r.desks[0].positionId = harbor.planning.scenarios[0].positions[0].id;
  const planning = OrgFlow.validatePlanning({ ...harbor.planning, seating: { rooms: [r] } });
  const leaf = planning.scenarios[0].positions.find(p => p.managerId);
  const filtered = filterDocument({ planning }, leaf.id);
  assert.deepEqual(filtered.planning.seating, { rooms: [] });
  assert.deepEqual(filterDocument({ planning }, '').planning.seating, planning.seating);
});

test('conflict merge keeps a seating edit made on either side', () => {
  const base = { planning: OrgFlow.validatePlanning({ ...harbor.planning, seating: { rooms: [room()] } }), branding: {}, view: {} };
  const local = structuredClone(base), remote = structuredClone(base);
  local.planning.seating.rooms[0].name = 'Renamed locally';
  remote.planning.scenarios[0].description = 'Remote note';
  const merged = Management.mergeWorkspace(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.workspace.planning.seating.rooms[0].name, 'Renamed locally');
});

test('walls snap to 45° steps and stay on the grid; Shift draws any angle', () => {
  const last = { x: 100, y: 100 };
  assert.deepEqual(S.snapWallPoint(last, { x: 390, y: 130 }, 50), { x: 400, y: 100 }, 'nearly horizontal becomes horizontal');
  assert.deepEqual(S.snapWallPoint(last, { x: 130, y: 590 }, 50), { x: 100, y: 600 }, 'nearly vertical becomes vertical');
  assert.deepEqual(S.snapWallPoint(last, { x: 390, y: 420 }, 50), { x: 400, y: 400 }, 'diagonal keeps equal steps');
  assert.deepEqual(S.snapWallPoint(last, { x: -180, y: 410 }, 50), { x: -200, y: 400 }, 'diagonal down-left');
  assert.deepEqual(S.snapWallPoint(last, { x: 390, y: 230 }, 50, true), { x: 400, y: 250 }, 'free angle still snaps to the grid');
  assert.deepEqual(S.snapWallPoint(null, { x: 123, y: 77 }, 50), { x: 100, y: 100 });
});

test('non-rectangular rooms validate: presets, diagonal walls and scaled shapes', () => {
  for (const kind of S.SHAPES) {
    const outline = S.shapeOutline(kind, 100, 100, 1200, 900);
    const clean = S.sanitizeSeating({ rooms: [room({ outline })] }).rooms[0].outline;
    assert.deepEqual(S.bounds(clean), S.bounds(S.rectOutline(100, 100, 1200, 900)), `${kind} fills its box`);
    assert.equal(S.selfIntersects(clean), false);
  }
  assert.equal(S.shapeOutline('U', 0, 0, 900, 600).length, 8);
  // A hexagon-like room with 45° walls.
  const angled = [[300, 100], [900, 100], [1100, 300], [1100, 700], [900, 900], [300, 900], [100, 700], [100, 300]];
  const r = room({ outline: angled });
  assert.equal(S.sanitizeSeating({ rooms: [r] }).rooms[0].outline.length, 8);
  assert.equal(S.deskInsideRoom({ x: 200, y: 200, w: 160, h: 80, rotation: 0 }, angled), false, 'cut corner');
  assert.equal(S.deskInsideRoom({ x: 600, y: 500, w: 160, h: 80, rotation: 45 }, angled), true);
  const scaled = S.scaleOutline(angled, 2000, 1600);
  assert.deepEqual(S.bounds(scaled), { x: 100, y: 100, w: 2000, h: 1600, maxX: 2100, maxY: 1700 });
  assert.equal(scaled.length, 8, 'resizing keeps the shape');
});

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
test('floor plan backgrounds validate, calibrate and survive history stripping', () => {
  const r = room({ background: { image: PIXEL, x: -50, y: 0, w: 2000, h: 1000, opacity: 3, hidden: 'yes' } });
  const bg = S.sanitizeSeating({ rooms: [r] }).rooms[0].background;
  assert.deepEqual({ ...bg, image: 'x' }, { image: 'x', x: -50, y: 0, w: 2000, h: 1000, opacity: 1, hidden: false });
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ background: { ...bg, image: 'data:image/svg+xml;base64,PHN2Zz4=' } })] }), /PNG, JPEG or WebP/);
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ background: { ...bg, image: 'javascript:alert(1)' } })] }), /PNG, JPEG or WebP/);
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ background: { ...bg, image: 'data:image/png;base64,' + 'A'.repeat(S.MAX_BACKGROUND_CHARS) } })] }), /under/);
  assert.equal('background' in S.sanitizeSeating({ rooms: [room({ background: { ...bg, image: '' } })] }).rooms[0], false, 'a stripped image drops the background');
  // Two points 500 units apart on the image are really 10 m apart: the plan doubles around the first point.
  const cal = S.calibrateBackground({ x: 0, y: 0, w: 1000, h: 500 }, { x: 100, y: 100 }, { x: 600, y: 100 }, 1000);
  assert.deepEqual(cal, { x: -100, y: -100, w: 2000, h: 1000 });
  assert.throws(() => S.calibrateBackground(cal, { x: 1, y: 1 }, { x: 1, y: 1 }, 100), /further apart/);
  assert.throws(() => S.calibrateBackground(cal, { x: 1, y: 1 }, { x: 90, y: 1 }, 0), /real distance/);
  const stripped = { rooms: [{ id: 'R1', background: { ...bg, image: '' } }] };
  assert.equal(S.restoreBackgrounds(stripped, { rooms: [{ id: 'R1', background: bg }] }).rooms[0].background.image, PIXEL);
  assert.equal('background' in S.duplicateRoom({ ...room(), background: bg }), false, 'copies do not duplicate the image');
  const planning = OrgFlow.validatePlanning({ ...harbor.planning, seating: { rooms: [{ ...room(), background: bg }] } });
  assert.equal(planning.seating.rooms[0].background.image, PIXEL, 'round-trips through workspace validation');
});

test('outlines whose walls touch or reuse a corner are rejected', () => {
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ outline: [[0, 0], [200, 0], [200, 200], [100, 0], [0, 200]] })] }), /cross/, 'a corner ends on the first wall (T-junction)');
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ outline: [[0, 0], [400, 0], [400, 400], [200, 400], [200, 0], [0, 400]] })] }), /cross/);
  assert.throws(() => S.sanitizeSeating({ rooms: [room({ outline: [[0, 0], [400, 0], [400, 200], [200, 200], [400, 400], [0, 400], [200, 200]] })] }), /cross/, 'a corner used twice');
  assert.equal(S.selfIntersects([[0, 0], [1000, 0], [1000, 400], [500, 400], [500, 800], [0, 800]]), false);
  for (const kind of S.SHAPES) assert.equal(S.selfIntersects(S.shapeOutline(kind, 100, 100, 1200, 900)), false, kind);
});

test('undo snapshots store each plan image once', () => {
  const store = { ids: new Map(), data: [] };
  const doc = img => JSON.stringify({ seating: { rooms: [{ id: 'R1', background: { image: img, x: 0 } }, { id: 'R2', background: { image: PIXEL, x: 5 } }] } });
  const a = S.packPlanImages(doc(PIXEL), store), b = S.packPlanImages(doc(PIXEL), store);
  assert.equal(store.data.length, 1, 'the same image is kept once across snapshots');
  assert.equal(a.includes('base64'), false);
  assert.equal(S.unpackPlanImages(b, store), doc(PIXEL));
  const other = PIXEL.replace('iVBOR', 'iVBOS');
  S.packPlanImages(doc(other), store);
  assert.equal(store.data.length, 2);
  assert.equal(S.unpackPlanImages('{"image":"orgflow-plan:99"}', store), '{"image":""}', 'an unknown reference drops the image rather than failing');
  assert.equal(S.packPlanImages('{"photo":"data:image/png;base64,AAAA"}', store), '{"photo":"data:image/png;base64,AAAA"}', 'only plan images are packed');
});
