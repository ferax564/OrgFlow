'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createApp } = require('../server/lib/app');

const NOW = new Date('2026-10-12T09:00:00Z'); // Monday
function workspace() {
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));
  doc.planning.seating = { rooms: [
    { id: 'room-zrh', name: 'Zurich floor 2', floor: 'HQ', outline: [[0, 0], [1200, 0], [1200, 800], [0, 800]], deskSize: { w: 160, h: 80 }, desks: [
      { id: 'desk-z1', label: 'Z1', x: 200, y: 200, w: 160, h: 80, rotation: 0, positionId: 'POS-008', hotDesk: false },
      { id: 'desk-z2', label: 'Z2', x: 400, y: 200, w: 160, h: 80, rotation: 0, positionId: 'POS-010', hotDesk: false },
      { id: 'desk-z3', label: 'Z3', x: 600, y: 200, w: 160, h: 80, rotation: 0, positionId: '', hotDesk: false },
      { id: 'desk-z4', label: 'Z4', x: 800, y: 200, w: 160, h: 80, rotation: 0, positionId: '', hotDesk: true },
      { id: 'desk-z5', label: 'Z5', x: 200, y: 500, w: 160, h: 80, rotation: 0, positionId: 'POS-016', hotDesk: false }
    ] },
    { id: 'room-lon', name: 'London studio', floor: '', outline: [[0, 0], [800, 0], [800, 600], [0, 600]], deskSize: { w: 160, h: 80 }, desks: [
      { id: 'desk-l1', label: 'L1', x: 200, y: 200, w: 160, h: 80, rotation: 0, positionId: 'POS-006', hotDesk: false }
    ] }
  ] };
  return doc;
}

async function setup(t, { now = () => NOW, env = {} } = {}) {
  const app = createApp({ memory: true, now, env: { AUTH_MODE: 'dev', SESSION_SECRET: 'workplace-test', ...env } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => new Promise(r => app.server.close(r)));
  async function call(cookie, route, body, method = body ? 'POST' : 'GET') {
    const res = await fetch(base + route, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text(), out = text ? JSON.parse(text) : {};
    // `status` is the HTTP status; a record's own status is exposed as `state`.
    out.state = out.status;
    out.status = res.status;
    return out;
  }
  async function login(email) {
    const res = await fetch(base + '/auth/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role: 'employee' }) });
    assert.equal(res.status, 200, await res.clone().text());
    return res.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  }
  const admin = await login('admin@test.example');
  assert.equal((await call(admin, '/api/workspace', { workspace: workspace(), version: 1 }, 'PUT')).status, 200);
  async function member(email, employeeId, role = 'employee', extra = {}) {
    const r = await call(admin, '/api/members', { email, role, employeeId, ...extra }, 'PUT');
    assert.equal(r.status, 200, r.error);
    return login(email);
  }
  assert.equal((await call(admin, '/api/members', { email: 'admin@test.example', role: 'admin', employeeId: 'EMP-001', workplaceAdmin: true, canExport: true }, 'PUT')).status, 200);
  const people = {
    admin,
    owner: await member('owner@test.example', 'EMP-008'),      // Team Leader Platform, desk Z1, reports to EMP-003
    manager: await member('manager@test.example', 'EMP-003'),  // Head of Engineering
    visitor: await member('visitor@test.example', 'EMP-006'),  // London, desk L1
    other: await member('other@test.example', 'EMP-010'),      // desk Z2
    unlinked: await member('unlinked@test.example', '')
  };
  for (const [id, name, timezone] of [['zrh', 'Zurich', 'Europe/Zurich'], ['lon', 'London', 'Europe/London']]) assert.equal((await call(admin, '/api/workplace/admin/offices', { id, name, timezone }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/workplace/admin/rooms/room-zrh/office', { officeId: 'zrh' }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/workplace/admin/rooms/room-lon/office', { officeId: 'lon' }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/workplace/admin/sharing', { roomId: 'room-zrh', enabled: true }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/workplace/admin/sharing', { deskIds: ['desk-z1'], equipment: 'Two monitors, USB-C dock' }, 'PUT')).status, 200);
  const desk = async (cookie, d, id = 'desk-z1') => (await call(cookie, `/api/workplace/offices/zrh/map?date=${d}`)).rooms[0].desks.find(x => x.id === id);
  return { app, base, call, login, member, people, desk };
}

test('recurring remote days, day overrides and missing plans decide desk availability (1–3)', async t => {
  const { call, people, desk } = await setup(t);
  assert.equal((await call(people.owner, '/api/workplace/pattern', { weekdays: { 3: 'remote', 5: 'office:lon' } }, 'PUT')).status, 200);
  assert.equal((await desk(people.visitor, '2026-10-14')).state, 'available', 'Wednesday remote pattern frees the desk');
  assert.equal((await desk(people.visitor, '2026-10-16')).state, 'available', 'working in another office frees the desk');
  assert.equal((await desk(people.visitor, '2026-10-15')).state, 'protected', 'no plan protects the desk');
  assert.equal((await desk(people.admin, '2026-10-15')).reason, 'owner-no-plan');
  assert.equal((await desk(people.visitor, '2026-10-15')).reason, 'protected', 'visitors do not learn why');
  assert.equal((await desk(people.visitor, '2026-10-14')).reason, 'owner-away');
  const override = await call(people.owner, '/api/workplace/days', { dates: ['2026-10-21'], location: 'office:zrh' }, 'PUT');
  assert.equal(override.status, 200, override.error);
  assert.equal((await desk(people.visitor, '2026-10-21')).state, 'protected', 'an office-day override beats the remote pattern');
  assert.equal((await desk(people.visitor, '2026-10-28')).state, 'available', 'other Wednesdays keep the pattern');
  assert.equal((await call(people.owner, '/api/workplace/days', { dates: ['2026-10-28'], location: 'none' }, 'PUT')).status, 200);
  assert.equal((await desk(people.visitor, '2026-10-28')).state, 'protected', 'an explicit "no plan" day protects the desk');
  // Unassigned desks need explicit sharing; a vacancy alone never frees a desk.
  assert.equal((await desk(people.visitor, '2026-10-14', 'desk-z3')).state, 'available');
  assert.equal((await desk(people.visitor, '2026-10-14', 'desk-z5')).state, 'protected');
  assert.equal((await desk(people.admin, '2026-10-14', 'desk-z5')).reason, 'vacant');
  const london = (await call(people.visitor, '/api/workplace/offices/lon/map?date=2026-10-14')).rooms[0].desks[0];
  assert.equal(london.state, 'protected', 'desks without sharing stay protected');
  assert.equal((await call(people.admin, '/api/workplace/admin/sharing', { deskIds: ['desk-l1'], equipment: 'Standing desk' }, 'PUT')).status, 409, 'describing equipment does not share a desk');
  assert.equal((await desk(people.admin, '2026-10-14')).equipment, 'Two monitors, USB-C dock');
  assert.equal((await call(people.visitor, '/api/workplace/offices/lon/map?date=2026-10-14')).rooms[0].desks[0].state, 'protected');
  assert.equal(london.mine, true);
  const week = await call(people.owner, '/api/workplace/week?start=2026-10-12');
  assert.deepEqual(week.days.map(d => d.source), ['none', 'none', 'pattern', 'none', 'pattern', 'none', 'none']);
  assert.equal(week.days[0].isToday, true);
  assert.equal((await call(people.owner, '/api/workplace/days', { dates: ['2026-10-09'], location: 'remote' }, 'PUT')).status, 400, 'past days are fixed');
});

test('pending vacation protects the desk; manager approval releases it; only the assigned approver decides (4, 9)', async t => {
  const { call, people, desk } = await setup(t);
  const req = await call(people.owner, '/api/workplace/vacations', { start: '2026-10-26', end: '2026-10-27', note: 'Family visit' });
  assert.equal(req.status, 201, req.error);
  assert.equal(req.approverName, 'Luca Rossi');
  assert.equal((await desk(people.visitor, '2026-10-26')).state, 'protected');
  assert.equal((await desk(people.admin, '2026-10-26')).reason, 'owner-pending-vacation');
  assert.equal((await call(people.owner, '/api/workplace/vacations', { start: '2026-10-27', end: '2026-10-29' })).status, 409, 'overlapping requests are rejected');
  assert.equal((await call(people.owner, `/api/workplace/vacations/${req.id}/decision`, { decision: 'approve' })).status, 403, 'no self-approval');
  assert.equal((await call(people.visitor, `/api/workplace/vacations/${req.id}/decision`, { decision: 'approve' })).status, 403, 'outside responsibility');
  assert.equal((await call(people.admin, `/api/workplace/vacations/${req.id}/decision`, { decision: 'approve' })).status, 403, 'administrators do not approve for managers');
  assert.equal((await call(people.visitor, `/api/workplace/vacations/${req.id}`)).status, 404, 'colleagues cannot read the request');
  const inbox = await call(people.manager, '/api/workplace/approvals');
  assert.equal(inbox.pending.length, 1);
  assert.equal(inbox.pending[0].note, 'Family visit');
  const approved = await call(people.manager, `/api/workplace/vacations/${req.id}/decision`, { decision: 'approve', note: 'Enjoy' });
  assert.equal(approved.status, 200, approved.error);
  assert.equal(approved.status === 200 && approved.decidedBy, 'manager@test.example');
  assert.equal((await desk(people.visitor, '2026-10-26')).state, 'available');
  assert.equal((await call(people.manager, `/api/workplace/vacations/${req.id}/decision`, { decision: 'reject' })).status, 409, 'decisions are final');
  const team = await call(people.other, '/api/workplace/team?from=2026-10-01&to=2026-10-31');
  const seen = team.absences.find(a => a.employeeId === 'EMP-008');
  assert.equal(seen.status, 'approved');
  assert.equal(seen.note, undefined, 'colleagues see dates only');
  const notices = await call(people.owner, '/api/workplace/notifications');
  assert.ok(notices.items.some(n => n.kind === 'vacation.approved' && n.route === 'vacation/' + req.id));
  const managerNotices = await call(people.manager, '/api/workplace/notifications');
  assert.ok(managerNotices.items.some(n => n.kind === 'vacation.submitted' && n.route === 'approvals/' + req.id));
  // Cancelling approved vacation needs the manager; the absence stays effective until then.
  const cancel = await call(people.owner, `/api/workplace/vacations/${req.id}/cancel`, {});
  assert.equal(cancel.kind, 'cancel');
  assert.equal(cancel.state, 'pending');
  assert.equal((await desk(people.visitor, '2026-10-26')).state, 'available');
  assert.equal((await call(people.manager, `/api/workplace/vacations/${cancel.id}/decision`, { decision: 'approve' })).status, 200);
  assert.equal((await desk(people.visitor, '2026-10-26')).state, 'protected');
  const mine = await call(people.owner, '/api/workplace/vacations');
  assert.equal(mine.requests.find(r => r.id === req.id).status, 'cancelled');
  // A pending request can be withdrawn directly; a rejected one is kept in the history.
  const second = await call(people.owner, '/api/workplace/vacations', { start: '2026-11-02', end: '2026-11-02' });
  assert.equal((await call(people.owner, `/api/workplace/vacations/${second.id}/cancel`, {})).status, 200);
  const third = await call(people.owner, '/api/workplace/vacations', { start: '2026-11-02', end: '2026-11-03' });
  assert.equal((await call(people.manager, `/api/workplace/vacations/${third.id}/decision`, { decision: 'reject', note: 'Release week' })).status, 200);
  assert.equal((await call(people.owner, '/api/workplace/vacations')).requests.filter(r => ['cancelled', 'rejected'].includes(r.status)).length, 3);
});

test('date changes to approved vacation need approval and keep the original in force', async t => {
  const { call, people, desk } = await setup(t);
  const req = await call(people.owner, '/api/workplace/vacations', { start: '2026-10-26', end: '2026-10-28' });
  await call(people.manager, `/api/workplace/vacations/${req.id}/decision`, { decision: 'approve' });
  const change = await call(people.owner, `/api/workplace/vacations/${req.id}`, { start: '2026-10-27', end: '2026-10-30' }, 'PATCH');
  assert.equal(change.status, 200, change.error);
  assert.equal(change.kind, 'change');
  assert.equal((await desk(people.visitor, '2026-10-26')).state, 'available', 'old dates still apply');
  assert.equal((await desk(people.visitor, '2026-10-30')).state, 'protected', 'new dates are not yet approved');
  assert.equal((await call(people.owner, `/api/workplace/vacations/${req.id}/cancel`, {})).status, 409, 'one pending change at a time');
  assert.equal((await call(people.manager, `/api/workplace/vacations/${change.id}/decision`, { decision: 'approve' })).status, 200);
  assert.equal((await desk(people.visitor, '2026-10-26')).state, 'protected');
  assert.equal((await desk(people.visitor, '2026-10-30')).state, 'available');
  const original = await call(people.owner, `/api/workplace/vacations/${req.id}`);
  assert.equal(original.state, 'cancelled');
  assert.equal(original.supersededBy, change.id);
});

test('visitors reserve without changing seating; simultaneous bookings yield one confirmation (5, 6)', async t => {
  const { app, call, people, desk } = await setup(t);
  await call(people.owner, '/api/workplace/pattern', { weekdays: { 3: 'remote' } }, 'PUT');
  const before = JSON.stringify(JSON.parse(app.store.getWorkspaceRow().document).planning.seating);
  const d = await desk(people.visitor, '2026-10-14');
  assert.equal(d.equipment, 'Two monitors, USB-C dock');
  assert.equal(d.ownerName, undefined, 'visitors do not see who owns the desk');
  const [a, b] = await Promise.all([
    call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-14' }),
    call(people.other, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-14' })
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const loser = a.status === 409 ? a : b;
  assert.equal(loser.code, 'desk_taken');
  const winner = a.status === 201 ? people.visitor : people.other;
  assert.equal(JSON.stringify(JSON.parse(app.store.getWorkspaceRow().document).planning.seating), before, 'permanent seating is untouched');
  const week = await call(winner, '/api/workplace/week?start=2026-10-12');
  const wed = week.days[2];
  assert.equal(wed.reservation.deskLabel, 'Z1');
  assert.equal(wed.reservation.roomName, 'Zurich floor 2');
  assert.equal(wed.reservation.officeName, 'Zurich');
  assert.equal(wed.location, 'office:zrh', 'booking sets the visitor’s location');
  assert.equal((await desk(people.visitor, '2026-10-14')).state, 'reserved');
  assert.equal((await call(winner, '/api/workplace/reservations', { deskId: 'desk-z3', date: '2026-10-14' })).code, 'already_booked', 'one desk per person per day');
  assert.equal((await call(people.owner, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-21' })).code, 'own_desk');
  assert.equal((await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-15' })).code, 'desk_unavailable', 'a protected desk cannot be booked');
  assert.equal((await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z3', date: '2026-10-09' })).status, 400, 'past dates');
  // The database itself refuses a second confirmed booking for the same desk and day.
  assert.throws(() => app.db.prepare("INSERT INTO reservations (id, tenant_id, desk_id, room_id, office_id, date, employee_id, status, created_by, created_at) VALUES ('x', ?, 'desk-z1', 'room-zrh', 'zrh', '2026-10-14', 'EMP-002', 'confirmed', 'u', 'now')").run(app.store.tenantId), /UNIQUE/);
  // Cancelling asks the employee to confirm their location.
  const reservation = wed.reservation;
  assert.equal((await call(people.owner, `/api/workplace/reservations/${reservation.id}/cancel`, {})).status, 403, 'only the visitor or an administrator cancels');
  const cancelled = await call(winner, `/api/workplace/reservations/${reservation.id}/cancel`, {});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.confirmLocation.date, '2026-10-14');
  assert.equal((await call(winner, '/api/workplace/week?start=2026-10-12')).days[2].attention[0].kind, 'confirm-location');
  await call(winner, '/api/workplace/days', { dates: ['2026-10-14'], location: 'remote' }, 'PUT');
  assert.equal((await call(winner, '/api/workplace/week?start=2026-10-12')).days[2].attention.length, 0);
  // Administrators book and cancel on behalf of employees, with an audit record.
  const onBehalf = await call(people.admin, '/api/workplace/reservations', { deskId: 'desk-z3', date: '2026-10-15', employeeId: 'EMP-006' });
  assert.equal(onBehalf.status, 201, onBehalf.error);
  assert.equal(onBehalf.onBehalf, true);
  assert.equal((await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z4', date: '2026-10-16', employeeId: 'EMP-010' })).status, 403);
  const audit = await call(people.admin, '/api/audit?limit=200');
  assert.ok(audit.events.some(e => e.action === 'workplace.reservation.create' && JSON.parse(e.detail).onBehalf === true));
});

test('an owner who returns keeps the visitor’s booking and gets a visible conflict (7)', async t => {
  const { call, people, desk } = await setup(t);
  await call(people.owner, '/api/workplace/pattern', { weekdays: { 3: 'remote' } }, 'PUT');
  const booked = await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-14' });
  assert.equal(booked.status, 201);
  const back = await call(people.owner, '/api/workplace/days', { dates: ['2026-10-14'], location: 'office:zrh' }, 'PUT');
  assert.equal(back.conflicts.length, 1);
  assert.equal((await desk(people.visitor, '2026-10-14')).state, 'reserved', 'the reservation survives');
  const week = await call(people.owner, '/api/workplace/week?start=2026-10-12');
  assert.equal(week.days[2].attention[0].kind, 'seat-conflict');
  const ownerNotices = await call(people.owner, '/api/workplace/notifications');
  assert.ok(ownerNotices.items.some(n => n.kind === 'conflict.opened'));
  const adminNotices = await call(people.admin, '/api/workplace/notifications');
  assert.ok(adminNotices.items.some(n => n.kind === 'conflict.opened'));
  const conflictId = back.conflicts[0].id;
  const alternatives = await call(people.owner, `/api/workplace/conflicts/${conflictId}/alternatives`);
  assert.ok(alternatives.desks.some(d => d.deskId === 'desk-z3'));
  assert.equal((await call(people.other, `/api/workplace/conflicts/${conflictId}/alternatives`)).status, 404);
  const resolved = await call(people.owner, `/api/workplace/conflicts/${conflictId}/resolve`, { action: 'book-owner', deskId: 'desk-z3' });
  assert.equal(resolved.status, 200, resolved.error);
  assert.equal(resolved.resolution, 'owner-booked-another-desk');
  // Cancelled approved vacation also raises a conflict; an administrator can move the visitor.
  const vac = await call(people.owner, '/api/workplace/vacations', { start: '2026-10-19', end: '2026-10-20' });
  await call(people.manager, `/api/workplace/vacations/${vac.id}/decision`, { decision: 'approve' });
  assert.equal((await call(people.other, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-19' })).status, 201);
  const cancel = await call(people.owner, `/api/workplace/vacations/${vac.id}/cancel`, {});
  await call(people.manager, `/api/workplace/vacations/${cancel.id}/decision`, { decision: 'approve' });
  const open = (await call(people.admin, '/api/workplace/conflicts')).conflicts.find(c => c.date === '2026-10-19' && c.status === 'open');
  assert.ok(open, 'cancelled vacation raises a conflict');
  assert.ok(open.visitorName, 'administrators see who holds the booking');
  const moved = await call(people.admin, `/api/workplace/conflicts/${open.id}/resolve`, { action: 'move-visitor', deskId: 'desk-z4' });
  assert.equal(moved.status, 200, moved.error);
  assert.equal((await desk(people.owner, '2026-10-19', 'desk-z4')).state, 'reserved');
  assert.ok((await call(people.other, '/api/workplace/notifications')).items.some(n => n.kind === 'reservation.admin'));
});

test('workspace changes and closures identify affected reservations before completing', async t => {
  const { app, call, people } = await setup(t);
  assert.equal((await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z3', date: '2026-10-14' })).status, 201);
  const loaded = await call(people.admin, '/api/workspace');
  const doc = loaded.workspace;
  doc.planning.seating.rooms[0].desks = doc.planning.seating.rooms[0].desks.filter(d => d.id !== 'desk-z3');
  const blocked = await call(people.admin, '/api/workspace', { workspace: doc, version: loaded.version }, 'PUT');
  assert.equal(blocked.status, 409);
  assert.equal(blocked.code, 'reservations_affected');
  assert.equal(blocked.reservations[0].reason, 'desk-removed');
  assert.equal(app.store.getWorkspaceRow().version, loaded.version, 'nothing was saved');
  const saved = await call(people.admin, '/api/workspace', { workspace: doc, version: loaded.version, acknowledgeReservations: true }, 'PUT');
  assert.equal(saved.status, 200, saved.error);
  const week = await call(people.visitor, '/api/workplace/week?start=2026-10-12');
  assert.equal(week.days[2].attention[0].kind, 'reservation-displaced');
  assert.ok((await call(people.visitor, '/api/workplace/notifications')).items.some(n => n.kind === 'reservation.displaced'));
  // Reassigning a booked desk to another position changes its owner: also confirmed first.
  assert.equal((await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z4', date: '2026-10-15' })).status, 201);
  const again = await call(people.admin, '/api/workspace');
  const desk = again.workspace.planning.seating.rooms[0].desks.find(d => d.id === 'desk-z4');
  desk.hotDesk = false; desk.positionId = 'POS-009';
  const owner = await call(people.admin, '/api/workspace', { workspace: again.workspace, version: again.version }, 'PUT');
  assert.equal(owner.reservations?.[0]?.reason, 'owner-changed');
  // Office closures too; a room or desk from another office is refused rather than silently closing nothing.
  assert.equal((await call(people.admin, '/api/workplace/admin/closures', { officeId: 'zrh', roomId: 'room-lon', start: '2026-10-15', end: '2026-10-15' })).status, 400);
  assert.equal((await call(people.admin, '/api/workplace/admin/closures', { officeId: 'lon', deskId: 'desk-z4', start: '2026-10-15', end: '2026-10-15' })).status, 400);
  const closure = await call(people.admin, '/api/workplace/admin/closures', { officeId: 'zrh', start: '2026-10-15', end: '2026-10-15', reason: 'Fire drill' });
  assert.equal(closure.status, 409);
  assert.equal(closure.reservations.length, 1);
  const closed = await call(people.admin, '/api/workplace/admin/closures', { officeId: 'zrh', start: '2026-10-15', end: '2026-10-15', reason: 'Fire drill', confirm: true });
  assert.equal(closed.status, 201);
  assert.equal(closed.displaced, 1);
  assert.equal((await call(people.visitor, '/api/workplace/offices/zrh/map?date=2026-10-15')).rooms[0].desks.every(d => d.state === 'unavailable'), true);
});

test('scheduling access never grants the organization chart; records stay personal (8, 9)', async t => {
  const { call, people } = await setup(t);
  assert.equal((await call(people.visitor, '/api/workspace')).status, 403);
  assert.equal((await call(people.visitor, '/api/org/summary')).status, 403);
  assert.equal((await call(people.visitor, '/api/workspace', { workspace: workspace(), version: 2 }, 'PUT')).status, 403);
  assert.equal((await call(people.visitor, '/api/tokens', { name: 'x' })).status, 403);
  const session = await call(people.visitor, '/api/session');
  assert.equal(session.orgAccess, false);
  assert.equal(session.canWrite, false);
  assert.equal((await call(people.visitor, '/api/workplace/availability?date=2026-10-14')).status, 403, 'no organization-wide seat map');
  assert.equal((await call(people.visitor, '/api/workplace/directory?q=a')).status, 403);
  assert.equal((await call(people.visitor, '/api/workplace/admin/sharing', { roomId: 'room-zrh', enabled: false }, 'PUT')).status, 403);
  assert.equal((await call(people.manager, '/api/workplace/admin/approvers', { employeeId: 'EMP-008', approverId: 'EMP-001' }, 'PUT')).status, 403);
  const vac = await call(people.owner, '/api/workplace/vacations', { start: '2026-11-09', end: '2026-11-09' });
  assert.equal((await call(people.visitor, `/api/workplace/vacations/${vac.id}`, { start: '2026-11-10', end: '2026-11-10' }, 'PATCH')).status, 404);
  assert.equal((await call(people.visitor, `/api/workplace/vacations/${vac.id}/cancel`, {})).status, 404);
  const unlinked = await call(people.unlinked, '/api/workplace/week?start=2026-10-12');
  assert.equal(unlinked.code, 'not_linked');
  // Administrator correction of the approver re-routes the pending request.
  const corrected = await call(people.admin, '/api/workplace/admin/approvers', { employeeId: 'EMP-008', approverId: 'EMP-001' }, 'PUT');
  assert.equal(corrected.status, 200, corrected.error);
  assert.equal((await call(people.manager, `/api/workplace/vacations/${vac.id}/decision`, { decision: 'approve' })).status, 403, 'the previous manager lost responsibility');
  assert.equal((await call(people.admin, `/api/workplace/vacations/${vac.id}/decision`, { decision: 'approve' })).status, 200, 'the corrected approver decides');
  assert.equal((await call(people.admin, '/api/workplace/admin/approvers', { employeeId: 'EMP-008', approverId: 'EMP-008' }, 'PUT')).status, 400);
  // Vacation notes are private to requester, approver and OrgFlow administrators.
  assert.equal((await call(people.owner, `/api/workplace/vacations/${vac.id}`)).decisionNote, '');
});

test('OrgFlow administrators are workplace administrators; the tick grants it to others', async t => {
  const { call, member, people } = await setup(t);
  const plainAdmin = await member('second-admin@test.example', 'EMP-014', 'admin', { workplaceAdmin: false });
  assert.equal((await call(plainAdmin, '/api/session')).workplaceAdmin, true);
  assert.equal((await call(plainAdmin, '/api/workplace/admin/sharing', { deskIds: ['desk-l1'], enabled: true }, 'PUT')).status, 200);
  assert.equal((await call(plainAdmin, '/api/workplace/me')).workplaceAdmin, true);
  assert.equal((await call(people.other, '/api/workplace/admin/sharing', { deskIds: ['desk-l1'], enabled: false }, 'PUT')).status, 403);
  const facilities = await member('facilities@test.example', 'EMP-015', 'employee', { workplaceAdmin: true });
  assert.equal((await call(facilities, '/api/workplace/admin/closures', { officeId: 'zrh', start: '2026-12-24', end: '2026-12-24', reason: 'Holiday' })).status, 201);
  assert.equal((await call(facilities, '/api/workplace/admin/approvers', { employeeId: 'EMP-008', approverId: 'EMP-001' }, 'PUT')).status, 403, 'approver corrections stay with OrgFlow administrators');
  // Conflict notifications reach every OrgFlow administrator and every flagged workplace administrator.
  await call(people.owner, '/api/workplace/pattern', { weekdays: { 3: 'remote' } }, 'PUT');
  await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z1', date: '2026-10-14' });
  await call(people.owner, '/api/workplace/days', { dates: ['2026-10-14'], location: 'office:zrh' }, 'PUT');
  for (const cookie of [people.admin, plainAdmin, facilities]) assert.ok((await call(cookie, '/api/workplace/notifications')).items.some(n => n.kind === 'conflict.opened'));
  assert.ok(!(await call(people.other, '/api/workplace/notifications')).items.some(n => n.kind === 'conflict.opened'));
});

test('wrong or outdated reporting lines never strand a request', async t => {
  const { app, call, member, people } = await setup(t);
  const ceo = people.admin; // EMP-001 tops the chart: Current names no approver
  const second = await member('second@test.example', 'EMP-014', 'admin');
  const top = await call(ceo, '/api/workplace/vacations', { start: '2026-11-02', end: '2026-11-03' });
  assert.equal(top.status, 201, 'submitted instead of refused');
  assert.equal(top.routing, 'unassigned');
  assert.equal((await call(ceo, '/api/workplace/me')).approver, null);
  assert.ok((await call(second, '/api/workplace/notifications')).items.some(n => n.kind === 'vacation.unassigned' && n.route === 'admin/routing/' + top.id));
  const queue = await call(second, '/api/workplace/admin');
  assert.ok(queue.routing.some(r => r.id === top.id));
  assert.equal(queue.approvers.find(x => x.employeeId === 'EMP-001').hint, 'no-approver');
  assert.equal((await call(people.manager, `/api/workplace/admin/vacations/${top.id}/approver`, { approverId: 'EMP-014' }, 'PUT')).status, 403, 'only OrgFlow administrators route requests');
  assert.equal((await call(second, `/api/workplace/admin/vacations/${top.id}/approver`, { approverId: 'EMP-001' }, 'PUT')).status, 400, 'never to the requester');
  const pinned = await call(second, `/api/workplace/admin/vacations/${top.id}/approver`, { approverId: 'EMP-014' }, 'PUT');
  assert.equal(pinned.routing, 'pinned');
  assert.equal((await call(second, `/api/workplace/vacations/${top.id}/decision`, { decision: 'approve' })).status, 200);

  // A manager who receives someone else's request hands it back instead of approving or rejecting it.
  const req = await call(people.owner, '/api/workplace/vacations', { start: '2026-11-09', end: '2026-11-10', note: 'Trip' });
  assert.equal(req.approverName, 'Luca Rossi');
  assert.equal((await call(people.other, `/api/workplace/vacations/${req.id}/return`, { note: 'x' })).status, 403, 'only the assigned approver');
  const back = await call(people.manager, `/api/workplace/vacations/${req.id}/return`, { note: 'Priya moved to Product last month' });
  assert.equal(back.status, 200, back.error);
  assert.equal(back.routing, 'unassigned');
  assert.equal((await call(people.manager, `/api/workplace/vacations/${req.id}/decision`, { decision: 'approve' })).status, 403, 'no longer theirs');
  assert.equal((await call(people.manager, '/api/workplace/approvals')).pending.length, 0);
  assert.ok((await call(people.owner, '/api/workplace/notifications')).items.some(n => n.kind === 'vacation.routing'));
  // Reconciliation after other changes does not send it back to the manager who returned it.
  await call(people.owner, '/api/workplace/days', { dates: ['2026-10-20'], location: 'remote' }, 'PUT');
  assert.equal((await call(people.owner, `/api/workplace/vacations/${req.id}`)).routing, 'unassigned');
  const report = (await call(ceo, '/api/workplace/reports')).reports.find(r => r.employeeId === 'EMP-008' && r.kind === 'approver');
  assert.match(report.note, /not this person's approver/);
  // Routing with "remember" corrects the approver for future requests and closes the report.
  const routed = await call(ceo, `/api/workplace/admin/vacations/${req.id}/approver`, { approverId: 'EMP-002', remember: true }, 'PUT');
  assert.equal(routed.approverName, 'Maya Chen');
  assert.equal(routed.routing, 'auto');
  assert.equal((await call(ceo, '/api/workplace/reports')).reports.find(r => r.id === report.id).status, 'resolved');
  assert.equal((await call(people.owner, '/api/workplace/me')).approver.source, 'correction');
  assert.equal((await call(people.owner, '/api/workplace/vacations', { start: '2026-11-16', end: '2026-11-16' })).approverName, 'Maya Chen');

  // Employees report wrong details themselves; only OrgFlow administrators close reports.
  const filed = await call(people.other, '/api/workplace/reports', { kind: 'desk', note: 'I sit at Z4 now' });
  assert.equal(filed.status, 201);
  assert.equal(filed.employeeName, undefined, 'reporters see their own report without directory data');
  assert.equal((await call(people.other, '/api/workplace/reports', { kind: 'salary' })).status, 400);
  assert.equal((await call(people.manager, `/api/workplace/reports/${filed.id}/resolve`, { status: 'resolved' })).status, 403);
  assert.equal((await call(ceo, `/api/workplace/reports/${filed.id}/resolve`, { status: 'dismissed', note: 'Seating plan is correct' })).status, 200);
  assert.ok((await call(people.other, '/api/workplace/notifications')).items.some(n => n.kind === 'report.dismissed'));

  // A correction pointing at someone who left stops working: the request goes to administrators, and the correction is flagged.
  const loaded = await call(ceo, '/api/workspace');
  const cur = loaded.workspace.planning.scenarios.find(s => s.id === 'current');
  Object.assign(cur.positions.find(p => p.id === 'POS-002'), { personId: '', hiringState: 'Vacant' });
  cur.employees = cur.employees.filter(e => e.id !== 'EMP-002');
  assert.equal((await call(ceo, '/api/workspace', { workspace: loaded.workspace, version: loaded.version, acknowledgeReservations: true }, 'PUT')).status, 200);
  const later = (await call(people.owner, '/api/workplace/vacations')).requests.find(r => r.start === '2026-11-16');
  assert.equal(later.routing, 'unassigned');
  assert.equal((await call(ceo, '/api/workplace/admin')).approvers.find(x => x.employeeId === 'EMP-008').hint, 'approver-gone');
  // Clearing the correction hands it back to Current, which names the owner's manager again.
  await call(ceo, '/api/workplace/admin/approvers', { employeeId: 'EMP-008', approverId: '' }, 'PUT');
  assert.equal((await call(ceo, '/api/workplace/admin')).approvers.find(x => x.employeeId === 'EMP-008').hint, '');
  void app;
});

test('planning scenarios do not affect live schedules or reservations (10)', async t => {
  const { call, people, desk } = await setup(t);
  await call(people.owner, '/api/workplace/pattern', { weekdays: { 3: 'remote' } }, 'PUT');
  const loaded = await call(people.admin, '/api/workspace');
  const growth = loaded.workspace.planning.scenarios.find(s => s.id !== 'current');
  growth.positions.find(p => p.id === 'POS-008').personId = '';
  growth.positions.find(p => p.id === 'POS-008').hiringState = 'Vacant';
  loaded.workspace.planning.activeScenarioId = growth.id;
  const saved = await call(people.admin, '/api/workspace', { workspace: loaded.workspace, version: loaded.version }, 'PUT');
  assert.equal(saved.status, 200, saved.error);
  assert.equal((await desk(people.visitor, '2026-10-14')).state, 'available', 'owner still resolved from Current');
  assert.equal((await call(people.owner, '/api/workplace/me')).desk.label, 'Z1');
  assert.equal((await call(people.owner, '/api/workplace/approvals')).status, 200);
  assert.equal((await call(people.owner, '/api/workplace/vacations', { start: '2026-11-16', end: '2026-11-16' })).approverName, 'Luca Rossi');
});

test('dates follow each office’s time zone across daylight-saving changes (13)', async t => {
  // 20:00 UTC on Monday 12 October is already Tuesday in Auckland.
  const { call, people } = await setup(t, { now: () => new Date('2026-10-12T20:00:00Z') });
  await call(people.admin, '/api/workplace/admin/offices', { id: 'akl', name: 'Auckland', timezone: 'Pacific/Auckland' }, 'PUT');
  await call(people.admin, '/api/workplace/admin/offices', { id: 'lax', name: 'Los Angeles', timezone: 'America/Los_Angeles' }, 'PUT');
  await call(people.admin, '/api/workplace/admin/rooms/room-zrh/office', { officeId: 'akl' }, 'PUT');
  await call(people.admin, '/api/workplace/admin/rooms/room-lon/office', { officeId: 'lax' }, 'PUT');
  await call(people.admin, '/api/workplace/admin/sharing', { roomId: 'room-lon', enabled: true }, 'PUT');
  assert.equal((await call(people.visitor, '/api/workplace/offices/akl/map?date=2026-10-12')).today, '2026-10-13');
  assert.equal((await call(people.visitor, '/api/workplace/offices/lax/map?date=2026-10-12')).today, '2026-10-12');
  assert.equal((await call(people.visitor, '/api/workplace/reservations', { deskId: 'desk-z3', date: '2026-10-12' })).status, 400, 'already past in Auckland');
  assert.equal((await call(people.other, '/api/workplace/reservations', { deskId: 'desk-z3', date: '2026-10-13' })).status, 201);
  await call(people.visitor, '/api/workplace/pattern', { weekdays: { 1: 'remote' } }, 'PUT');
  const owner = await call(people.owner, '/api/workplace/reservations', { deskId: 'desk-l1', date: '2026-10-12' });
  assert.equal(owner.status, 201, 'still Monday in Los Angeles');
  // Weekly patterns land on the right weekday on both sides of the European and US clock changes.
  await call(people.owner, '/api/workplace/pattern', { weekdays: { 7: 'remote', 1: 'remote' } }, 'PUT');
  const week = await call(people.owner, '/api/workplace/week?start=2026-10-19&days=21');
  assert.equal(week.days.length, 21);
  assert.deepEqual(week.days.filter(d => d.location === 'remote').map(d => d.date), ['2026-10-19', '2026-10-25', '2026-10-26', '2026-11-01', '2026-11-02', '2026-11-08']);
});

test('older databases migrate and workplace records survive the backup tooling (14)', async t => {
  const os = require('node:os'), { DatabaseSync } = require('node:sqlite'), backup = require('../server/backup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-wp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'old.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY, issuer_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE memberships (tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')), can_export INTEGER NOT NULL DEFAULT 0, scope_position_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, PRIMARY KEY (tenant_id, user_id));
    CREATE TABLE oauth_states (state TEXT PRIMARY KEY, nonce TEXT NOT NULL, code_verifier TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE workspaces (tenant_id TEXT PRIMARY KEY, document TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, updated_by TEXT);
    INSERT INTO workspaces VALUES ('tenant-default', '${JSON.stringify(require('../server/lib/document').emptyDocument('2025-01-01')).replace(/'/g, "''")}', 1, '2025-01-01', NULL);
    INSERT INTO tenants VALUES ('tenant-default','default','Org','2025-01-01');
    INSERT INTO users VALUES ('usr-1','local:a@b.c','a@b.c','A','2025-01-01');
    INSERT INTO memberships VALUES ('tenant-default','usr-1','editor',1,'POS-003','2025-01-01');`);
  old.close();
  const { openDatabase, createStore } = require('../server/lib/db');
  const db = openDatabase(file), store = createStore(db);
  const kept = store.getMembership('usr-1');
  assert.equal(kept.role, 'editor');
  assert.equal(kept.scope_position_id, 'POS-003');
  assert.equal(store.putMembership({ email: 'e@b.c', role: 'employee', employeeId: 'EMP-001' }).role, 'employee');
  store.saveWorkspace(require('../server/lib/document').validateDocument(workspace()), 'usr-1');
  db.close();
  assert.equal(backup.backup(file, path.join(dir, 'copy.sqlite')), 1);
  const copy = new DatabaseSync(path.join(dir, 'copy.sqlite'), { readOnly: true });
  assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('reservations','vacation_requests','work_days','work_patterns')").get().n, 4);
  assert.equal(JSON.parse(copy.prepare('SELECT document FROM workspaces').get().document).planning.seating.rooms.length, 2, 'seating plans are stored unchanged');
  copy.close();
});

test('retention removes old schedule records and keeps recent ones', async t => {
  let clock = NOW;
  const { app, call, people } = await setup(t, { now: () => clock });
  await call(people.owner, '/api/workplace/days', { dates: ['2026-10-13'], location: 'remote' }, 'PUT');
  const vac = await call(people.owner, '/api/workplace/vacations', { start: '2026-10-20', end: '2026-10-20' });
  await call(people.manager, `/api/workplace/vacations/${vac.id}/decision`, { decision: 'reject' });
  clock = new Date('2027-12-01T00:00:00Z');
  app.workplace.prune();
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM work_days').get().n, 0);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM vacation_requests').get().n, 1, 'vacation history is kept longer');
  clock = new Date('2030-01-01T00:00:00Z');
  app.workplace.prune();
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM vacation_requests').get().n, 0);
});
