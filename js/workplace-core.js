/** Work locations, vacation and desk sharing: pure rules shared by the enterprise host, the workplace
 *  screens and tests. Every date is a calendar day (YYYY-MM-DD). Arithmetic runs on UTC midnights so a
 *  daylight-saving change can never skip or repeat a day; time zones only decide which day is "today"
 *  in a given office. The first release plans whole days only. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OrgFlowWorkplace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY = 86400000;
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const DESK_STATES = ['protected', 'available', 'reserved', 'unavailable'];
  const STATE_LABELS = { protected: 'Protected for owner', available: 'Available to borrow', reserved: 'Reserved by a visitor', unavailable: 'Unavailable' };
  const VACATION_ACTIVE = ['pending', 'approved'];
  const MAX_VACATION_DAYS = 366;
  const FULL_DAY_NOTICE = 'Plans, vacation and desk reservations cover whole days. Half days are not supported in this release. A confirmed desk reservation stays with the visitor even if the desk owner later changes plans.';

  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const t = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
  }
  function date(value, label = 'Date') {
    if (!isDate(value)) throw new Error(`${label} must be a calendar date (YYYY-MM-DD).`);
    return value;
  }
  function toUtc(d) { return Date.parse(date(d) + 'T00:00:00Z'); }
  function fromUtc(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(d, n) { return fromUtc(toUtc(d) + Math.round(n) * DAY); }
  function daysBetween(a, b) { return Math.round((toUtc(b) - toUtc(a)) / DAY); }
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  function weekday(d) { const w = new Date(toUtc(d)).getUTCDay(); return w === 0 ? 7 : w; }
  function mondayOf(d) { return addDays(d, 1 - weekday(d)); }
  function dateRange(start, end) {
    const n = daysBetween(start, end);
    if (n < 0) throw new Error('The end date is before the start date.');
    return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
  }
  function overlaps(aStart, aEnd, bStart, bEnd) { return aStart <= bEnd && bStart <= aEnd; }

  function validTimezone(tz) {
    if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
  }
  /** The calendar date in `tz` at instant `now`. */
  function todayIn(tz = 'UTC', now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: validTimezone(tz) ? tz : 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = type => parts.find(p => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  // ---- Locations --------------------------------------------------------------------
  /** Stored location values: `remote`, `office:<id>`, and for a single day `none` (explicitly no plan). */
  function parseLocation(value, { allowNone = false } = {}) {
    if (value === 'remote') return { kind: 'remote', value };
    if (allowNone && value === 'none') return { kind: 'none', value };
    if (typeof value === 'string' && /^office:[A-Za-z0-9._:-]{1,150}$/.test(value)) return { kind: 'office', officeId: value.slice(7), value };
    throw new Error(allowNone ? 'Location must be an office, remote or no plan.' : 'Location must be an office or remote.');
  }
  function officeLocation(officeId) { return 'office:' + officeId; }

  /** One person's effective plan for one day.
   *  Approved vacation wins, then an explicit day entry, then the recurring weekday pattern; otherwise no plan.
   *  A pending request is reported but never changes the location. */
  function resolveDay({ date: d, override = null, pattern = null, approvedVacation = null, pendingVacation = null }) {
    date(d);
    const base = { date: d, pendingVacation: pendingVacation ? pendingVacation.id || true : null };
    if (approvedVacation) return { ...base, location: 'vacation', source: 'vacation', vacationId: approvedVacation.id || '' };
    if (override) return { ...base, location: override, source: 'day' };
    const w = pattern ? pattern[weekday(d)] : '';
    if (w) return { ...base, location: w, source: 'pattern' };
    return { ...base, location: 'none', source: 'none' };
  }
  /** True when the owner is confirmed away from a desk in `officeId`. Missing information keeps the desk. */
  function confirmedAway(day, officeId) {
    if (!day) return false;
    if (day.location === 'vacation' || day.location === 'remote') return true;
    if (day.location.startsWith('office:')) return day.location.slice(7) !== officeId;
    return false;
  }
  function protectionReason(day) {
    if (!day || day.location === 'none') return day?.pendingVacation ? 'owner-pending-vacation' : 'owner-no-plan';
    return 'owner-in-office';
  }

  /** Desk state for one date. Order matters: closures, then a confirmed reservation (which is never
   *  taken back), then sharing eligibility, then the owner's confirmed plan. A vacancy alone never frees a desk. */
  function deskState({ officeId, closed = false, reservation = null, sharing = false, assigned = false, ownerId = '', ownerDay = null }) {
    if (closed) return { state: 'unavailable', reason: 'closed' };
    if (reservation) return { state: 'reserved', reason: 'reserved', reservationId: reservation.id || '' };
    if (!sharing) return assigned ? { state: 'protected', reason: 'not-shared' } : { state: 'unavailable', reason: 'not-shared' };
    if (!assigned) return { state: 'available', reason: 'shared-desk' };
    if (!ownerId) return { state: 'protected', reason: 'vacant' };
    if (confirmedAway(ownerDay, officeId)) return { state: 'available', reason: ownerDay.location === 'vacation' ? 'owner-vacation' : ownerDay.location === 'remote' ? 'owner-remote' : 'owner-other-office' };
    return { state: 'protected', reason: protectionReason(ownerDay) };
  }

  function validateVacationRange(start, end, today, { maxDays = MAX_VACATION_DAYS, horizonDays = 730 } = {}) {
    date(start, 'Start date'); date(end, 'End date');
    if (end < start) throw new Error('The end date is before the start date.');
    if (daysBetween(start, end) + 1 > maxDays) throw new Error(`A request can cover at most ${maxDays} days.`);
    if (end < today) throw new Error('This vacation has already ended.');
    if (daysBetween(today, start) > horizonDays) throw new Error('Vacation can be requested at most two years ahead.');
    return { start, end, days: daysBetween(start, end) + 1 };
  }

  return {
    DAY, WEEKDAYS, DESK_STATES, STATE_LABELS, VACATION_ACTIVE, MAX_VACATION_DAYS, FULL_DAY_NOTICE,
    isDate, date, addDays, daysBetween, weekday, mondayOf, dateRange, overlaps, validTimezone, todayIn,
    parseLocation, officeLocation, resolveDay, confirmedAway, protectionReason, deskState, validateVacationRange
  };
});
