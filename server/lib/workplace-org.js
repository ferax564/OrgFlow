'use strict';
/** Reads people, managers and desk owners from the live Current scenario only. Proposed scenarios
 *  never influence schedules, approvals or reservations. */
const Management = require('../../js/management-core');
const Seating = require('../../js/seating-core');

function activeOn(p, d) { return (!p.startDate || p.startDate <= d) && (!p.endDate || p.endDate >= d); }

function createOrgView(doc) {
  const planning = doc.planning;
  const current = planning.scenarios.find(s => s.id === 'current');
  const seating = planning.seating || { rooms: [] };
  const employees = new Map((current?.employees || []).map(e => [e.id, e]));
  const cache = new Map();

  /** Positions as they stand on `d`, with dated assignments and reporting lines applied. */
  function positionsOn(d) {
    if (!current) return [];
    if (!cache.has(d)) {
      if (cache.size > 120) cache.clear();
      cache.set(d, Management.effectivePositions(current, d).filter(p => activeOn(p, d)));
    }
    return cache.get(d);
  }
  function ownerOfPosition(positionId, d) {
    if (!positionId) return '';
    return positionsOn(d).find(p => p.id === positionId)?.personId || '';
  }
  function positionOf(employeeId, d) { return positionsOn(d).find(p => p.personId === employeeId) || null; }
  /** Nearest filled position above the employee's own, skipping vacancies. */
  function derivedManager(employeeId, d) {
    const positions = positionsOn(d), byId = new Map(positions.map(p => [p.id, p]));
    let p = positions.find(x => x.personId === employeeId);
    const seen = new Set();
    while (p && p.managerId && !seen.has(p.managerId)) {
      seen.add(p.managerId);
      p = byId.get(p.managerId);
      if (p?.personId && p.personId !== employeeId) return p.personId;
    }
    return '';
  }
  function desks() {
    const out = [];
    for (const room of seating.rooms) for (const desk of room.desks) out.push({ room, desk });
    return out;
  }
  function findDesk(deskId) { return Seating.findDesk(seating, deskId); }
  function deskOf(employeeId, d) {
    const p = positionOf(employeeId, d);
    return p ? Seating.deskForPosition(seating, p.id) : null;
  }
  function person(id) { return employees.get(id) || null; }
  function name(id) { return employees.get(id)?.name || ''; }
  function findByEmail(email) {
    const want = String(email || '').trim().toLowerCase();
    if (!want) return [];
    return [...employees.values()].filter(e => typeof e.email === 'string' && e.email.trim().toLowerCase() === want);
  }
  return { current, seating, employees, positionsOn, ownerOfPosition, positionOf, derivedManager, desks, findDesk, deskOf, person, name, findByEmail };
}

module.exports = { createOrgView, activeOn };
