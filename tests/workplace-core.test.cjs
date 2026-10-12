'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const W = require('../js/workplace-core');

test('calendar arithmetic is day-based and immune to daylight-saving changes', () => {
  // Europe moves its clocks on 25 Oct 2026, the US on 1 Nov 2026.
  assert.deepEqual(W.dateRange('2026-10-24', '2026-10-26'), ['2026-10-24', '2026-10-25', '2026-10-26']);
  assert.equal(W.dateRange('2026-10-19', '2026-11-08').length, 21);
  assert.equal(W.weekday('2026-10-25'), 7);
  assert.equal(W.weekday('2026-11-02'), 1);
  assert.equal(W.mondayOf('2026-11-01'), '2026-10-26');
  assert.equal(W.addDays('2027-03-27', 2), '2027-03-29');
  assert.equal(W.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(W.isDate('2026-02-30'), false);
  assert.equal(W.isDate('2026-1-01'), false);
});

test('"today" depends on the office time zone, including around clock changes', () => {
  const instant = new Date('2026-10-12T20:00:00Z');
  assert.equal(W.todayIn('Pacific/Auckland', instant), '2026-10-13');
  assert.equal(W.todayIn('America/Los_Angeles', instant), '2026-10-12');
  assert.equal(W.todayIn('Europe/Zurich', new Date('2026-10-24T22:30:00Z')), '2026-10-25', 'still summer time (UTC+2)');
  assert.equal(W.todayIn('Europe/Zurich', new Date('2026-10-25T22:30:00Z')), '2026-10-25', 'winter time (UTC+1)');
  assert.equal(W.todayIn('America/New_York', new Date('2026-11-02T04:30:00Z')), '2026-11-01');
  assert.equal(W.validTimezone('Mars/Base'), false);
  assert.equal(W.todayIn('Mars/Base', instant), '2026-10-12', 'unknown zones fall back to UTC');
});

test('plan precedence: approved vacation, then the day entry, then the weekly pattern', () => {
  const wed = '2026-10-14';
  assert.equal(W.resolveDay({ date: wed }).location, 'none');
  assert.equal(W.resolveDay({ date: wed, pattern: { 3: 'remote' } }).source, 'pattern');
  assert.equal(W.resolveDay({ date: wed, pattern: { 3: 'remote' }, override: 'office:zrh' }).location, 'office:zrh');
  assert.equal(W.resolveDay({ date: wed, override: 'office:zrh', approvedVacation: { id: 'v' } }).location, 'vacation');
  const pending = W.resolveDay({ date: wed, pendingVacation: { id: 'p' } });
  assert.equal(pending.location, 'none');
  assert.equal(pending.pendingVacation, 'p');
});

test('desk states follow the owner’s confirmed plan, sharing, closures and reservations', () => {
  const day = location => ({ location });
  const state = extra => W.deskState({ officeId: 'zrh', sharing: true, assigned: true, ownerId: 'E1', ...extra }).state;
  assert.equal(state({ ownerDay: day('office:zrh') }), 'protected');
  assert.equal(state({ ownerDay: day('remote') }), 'available');
  assert.equal(state({ ownerDay: day('office:lon') }), 'available');
  assert.equal(state({ ownerDay: day('vacation') }), 'available');
  assert.equal(state({ ownerDay: { location: 'none', pendingVacation: 'p' } }), 'protected');
  assert.equal(state({ ownerDay: day('none') }), 'protected');
  assert.equal(state({ ownerDay: day('remote'), sharing: false }), 'protected');
  assert.equal(state({ ownerDay: day('remote'), closed: true }), 'unavailable');
  assert.equal(state({ ownerDay: day('office:zrh'), reservation: { id: 'r' } }), 'reserved', 'a confirmed booking is never taken back');
  assert.equal(state({ ownerId: '' }), 'protected', 'a vacancy alone does not free a desk');
  assert.equal(W.deskState({ officeId: 'zrh', sharing: true, assigned: false }).state, 'available');
  assert.equal(W.deskState({ officeId: 'zrh', sharing: false, assigned: false }).state, 'unavailable');
});

test('locations and vacation ranges are validated', () => {
  assert.throws(() => W.parseLocation('none'), /office or remote/);
  assert.equal(W.parseLocation('none', { allowNone: true }).kind, 'none');
  assert.equal(W.parseLocation('office:zrh').officeId, 'zrh');
  assert.throws(() => W.parseLocation('office:'), /office/);
  assert.throws(() => W.validateVacationRange('2026-10-20', '2026-10-19', '2026-10-12'), /before the start/);
  assert.throws(() => W.validateVacationRange('2026-10-01', '2026-10-02', '2026-10-12'), /already ended/);
  assert.throws(() => W.validateVacationRange('2026-10-12', '2027-10-20', '2026-10-12'), /at most 366/);
  assert.equal(W.validateVacationRange('2026-10-10', '2026-10-14', '2026-10-12').days, 5);
});
