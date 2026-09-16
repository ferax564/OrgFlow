/**
 * Subtree visibility and scoped saves. The filtered document must still
 * pass OrgFlow.validatePlanning: the scoped root becomes a local top node
 * (managerId cleared) so missing parents do not leak or fail validation.
 */
'use strict';
const Management = require('../../js/management-core');
// Permissions follow reporting relationships effective today, not editable legacy anchors.
const scopedIds = (scenario, rootId) => descendantIds(Management.effectivePositions(scenario), rootId);

function descendantIds(positions, rootId) {
  if (!rootId) return null;
  const byId = new Map((positions || []).map(p => [p.id, p]));
  if (!byId.has(rootId)) return new Set();
  const children = new Map();
  for (const p of positions) {
    if (!p.managerId) continue;
    if (!children.has(p.managerId)) children.set(p.managerId, []);
    children.get(p.managerId).push(p.id);
  }
  const seen = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of children.get(id) || []) stack.push(child);
  }
  return seen;
}

function clipPosition(p, allowed) {
  const copy = { ...p };
  if (copy.managerId && !allowed.has(copy.managerId)) copy.managerId = '';
  if (copy.secondaryManagerId && !allowed.has(copy.secondaryManagerId)) copy.secondaryManagerId = '';
  return copy;
}

function filterPeople(employees, positions) {
  const used = new Set(positions.map(p => p.personId).filter(Boolean));
  return (employees || []).filter(e => used.has(e.id)).map(e => structuredClone(e));
}

function filterScenarioTree(scenario, scopePositionId, nested = false) {
  if (!scopePositionId) return structuredClone(scenario);
  const allowed = scopedIds(scenario, scopePositionId);
  const positions = scenario.positions.filter(p => allowed.has(p.id)).map(p => clipPosition(p, allowed));
  const assignments = (scenario.assignments || []).filter(r => allowed.has(r.positionId));
  const used = new Set([...positions.map(p => p.personId), ...assignments.map(r => r.personId)].filter(Boolean));
  const employees = (scenario.employees || []).filter(e => used.has(e.id));
  const out = { ...structuredClone(scenario), positions, employees: structuredClone(employees), assignments: structuredClone(assignments),
    reportingLines: (scenario.reportingLines || []).filter(r => allowed.has(r.positionId)).map(r => ({ ...r, managerId: allowed.has(r.managerId) ? r.managerId : '' })),
    costs: (scenario.costs || []).filter(r => allowed.has(r.positionId)).map(r => ({ ...r })),
    allocations: (scenario.allocations || []).filter(r => used.has(r.personId)).map(r => ({ ...r })),
    // Free-form organization-wide commitments and decision notes are not subtree-scoped records.
    commitments: [], description: '' };
  if (scenario.workflow) out.workflow = { ...scenario.workflow, owner: '', rationale: '', reviewers: [], comments: [], events: [], approvedBy: '' };
  if (!nested) for (const field of ['baseSnapshot', 'applicationBaseline', 'appliedBefore', 'appliedAfter']) out[field] = scenario[field] ? filterScenarioTree(scenario[field], scopePositionId, true) : null;
  return out;
}

function filterDocument(doc, scopePositionId) {
  if (!doc) return doc;
  if (!scopePositionId) return structuredClone(doc);
  const planning = doc.planning;
  return {
    ...structuredClone({ ...doc, planning: undefined }), view: {},
    planning: {
      ...planning,
      namedViews: [], importProfiles: [],
      scenarios: planning.scenarios.map(s => filterScenarioTree(s, scopePositionId))
    }
  };
}

function mergeScenario(stored, incoming, scopePositionId) {
  if (!scopePositionId) return structuredClone(incoming);
  const storedById = new Map(stored.positions.map(p => [p.id, p]));
  const incomingById = new Map((incoming?.positions || []).map(p => [p.id, p]));
  const allowed = scopedIds(stored, scopePositionId);
  if (!allowed.size) return structuredClone(stored);

  const included = new Map();
  for (const p of stored.positions) {
    if (!allowed.has(p.id)) included.set(p.id, structuredClone(p));
  }

  const growing = new Set(allowed);
  for (const id of allowed) {
    if (id === scopePositionId) {
      const storedRoot = storedById.get(id);
      const inc = incomingById.get(id) || storedRoot;
      included.set(id, { ...structuredClone(inc), id, managerId: storedRoot.managerId, secondaryManagerId: storedRoot.secondaryManagerId, reportingMode: storedRoot.reportingMode });
      continue;
    }
    const inc = incomingById.get(id);
    if (!inc) continue;
    let managerId = inc.managerId || '';
    if (managerId && !growing.has(managerId)) managerId = storedById.get(id).managerId;
    included.set(id, { ...structuredClone(inc), id, managerId });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of incoming.positions || []) {
      if (included.has(p.id) || storedById.has(p.id)) continue;
      if (p.managerId && growing.has(p.managerId)) {
        included.set(p.id, structuredClone(p));
        growing.add(p.id);
        changed = true;
      }
    }
  }

  const positions = [...included.values()];
  // Merge only records belonging to allowed positions/people; preserve outside and unassigned people.
  const allowedPeople = new Set([...stored.positions.filter(p => allowed.has(p.id)).map(p => p.personId), ...(stored.assignments || []).filter(r => allowed.has(r.positionId)).map(r => r.personId)].filter(Boolean));
  const existingPeople = new Set(stored.employees.map(e => e.id));
  for (const e of incoming.employees || []) if (!existingPeople.has(e.id)) allowedPeople.add(e.id);
  const outsiders = new Set([...stored.positions.filter(p => !allowed.has(p.id)).map(p => p.personId), ...(stored.assignments || []).filter(r => !allowed.has(r.positionId)).map(r => r.personId)].filter(Boolean));
  for (const p of positions) if (growing.has(p.id) && p.personId && outsiders.has(p.personId)) {
    const original=storedById.get(p.id);p.personId=original?.personId || '';p.hiringState=original?.hiringState || 'Vacant';
  }
  const peopleById = new Map(stored.employees.map(e => [e.id, structuredClone(e)]));
  for (const e of incoming.employees || []) if (allowedPeople.has(e.id) && !outsiders.has(e.id)) peopleById.set(e.id, structuredClone(e));
  function mergeRows(key, inScope, accepts = () => true) {
    const original=stored[key] || [], externalIds=new Set(original.filter(r => !inScope(r)).map(r => r.id));
    return [...original.filter(r => !inScope(r)), ...(incoming[key] || []).filter(r => inScope(r) && !externalIds.has(r.id) && accepts(r))].map(r => structuredClone(r));
  }
  const assignments = mergeRows('assignments', r => growing.has(r.positionId), r => allowedPeople.has(r.personId) && !outsiders.has(r.personId));
  const reportingLines = mergeRows('reportingLines', r => growing.has(r.positionId) && r.positionId !== scopePositionId, r => !r.managerId || growing.has(r.managerId));
  // A scoped root may not detach itself through its dated reporting line.
  for(const r of reportingLines) if(r.positionId===scopePositionId) { const prior=(stored.reportingLines||[]).find(x=>x.id===r.id); if(prior) r.managerId=prior.managerId; }
  return {
    ...structuredClone(stored), positions, employees: [...peopleById.values()], assignments, reportingLines,
    costs: mergeRows('costs', r => growing.has(r.positionId)),
    allocations: mergeRows('allocations', r => allowedPeople.has(r.personId) && !outsiders.has(r.personId)),
    commitments: structuredClone(stored.commitments || []),
    baseSnapshot: stored.baseSnapshot ? structuredClone(stored.baseSnapshot) : null
  };
}

function mergeDocument(stored, incoming, scopePositionId) {
  if (!scopePositionId) return structuredClone(incoming);
  if (!incoming || !incoming.planning || !Array.isArray(incoming.planning.scenarios)) return structuredClone(stored);
  const storedById = new Map(stored.planning.scenarios.map(s => [s.id, s]));
  const incomingById = new Map((incoming.planning?.scenarios || []).map(s => [s.id, s]));
  const scenarios = stored.planning.scenarios.map(s => mergeScenario(s, incomingById.get(s.id) || s, scopePositionId));
  return {
    ...structuredClone(stored),
    planning: {
      ...stored.planning,
      activeScenarioId: storedById.has(incoming.planning?.activeScenarioId)
        ? incoming.planning.activeScenarioId
        : stored.planning.activeScenarioId,
      scenarios
    },
    view: structuredClone(stored.view)
  };
}

function canWriteRole(role) {
  return role === 'admin' || role === 'editor';
}

module.exports = {
  descendantIds,
  scopedIds,
  filterDocument,
  filterScenarioTree,
  mergeDocument,
  mergeScenario,
  canWriteRole
};
