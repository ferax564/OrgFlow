/**
 * Subtree visibility and scoped saves. The filtered document must still
 * pass OrgFlow.validatePlanning: the scoped root becomes a local top node
 * (managerId cleared) so missing parents do not leak or fail validation.
 */
'use strict';

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

function filterScenarioTree(scenario, scopePositionId) {
  if (!scopePositionId) return structuredClone(scenario);
  const allowed = descendantIds(scenario.positions, scopePositionId);
  const positions = scenario.positions.filter(p => allowed.has(p.id)).map(p => clipPosition(p, allowed));
  const employees = filterPeople(scenario.employees, positions);
  let baseSnapshot = null;
  if (scenario.baseSnapshot) {
    const snapAllowed = descendantIds(scenario.baseSnapshot.positions, scopePositionId);
    const snapPositions = (scenario.baseSnapshot.positions || []).filter(p => snapAllowed.has(p.id)).map(p => clipPosition(p, snapAllowed));
    baseSnapshot = {
      ...scenario.baseSnapshot,
      positions: snapPositions,
      employees: filterPeople(scenario.baseSnapshot.employees, snapPositions)
    };
  }
  return { ...structuredClone({ ...scenario, positions: undefined, employees: undefined, baseSnapshot: undefined }), positions, employees, baseSnapshot };
}

function filterDocument(doc, scopePositionId) {
  if (!doc) return doc;
  if (!scopePositionId) return structuredClone(doc);
  const planning = doc.planning;
  return {
    ...structuredClone({ ...doc, planning: undefined }),
    planning: {
      ...planning,
      scenarios: planning.scenarios.map(s => filterScenarioTree(s, scopePositionId))
    }
  };
}

function mergeScenario(stored, incoming, scopePositionId) {
  if (!scopePositionId) return structuredClone(incoming);
  const storedById = new Map(stored.positions.map(p => [p.id, p]));
  const incomingById = new Map((incoming?.positions || []).map(p => [p.id, p]));
  const allowed = descendantIds(stored.positions, scopePositionId);
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
      included.set(id, { ...structuredClone(inc), id, managerId: storedRoot.managerId });
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
  const usedPeople = new Set(positions.map(p => p.personId).filter(Boolean));
  const peopleById = new Map();
  for (const e of stored.employees || []) {
    if (usedPeople.has(e.id)) peopleById.set(e.id, structuredClone(e));
  }
  for (const e of incoming.employees || []) {
    if (usedPeople.has(e.id)) peopleById.set(e.id, structuredClone(e));
  }
  return {
    ...structuredClone(stored),
    ...pickIncomingMeta(incoming, stored),
    positions,
    employees: [...peopleById.values()],
    baseSnapshot: stored.baseSnapshot ? structuredClone(stored.baseSnapshot) : null
  };
}

function pickIncomingMeta(incoming, stored) {
  if (!incoming) return { name: stored.name, description: stored.description, updatedAt: stored.updatedAt };
  return {
    name: stored.id === 'current' ? 'Current' : (incoming.name || stored.name),
    description: incoming.description != null ? incoming.description : stored.description,
    updatedAt: incoming.updatedAt || stored.updatedAt
  };
}

function mergeDocument(stored, incoming, scopePositionId) {
  if (!scopePositionId) return structuredClone(incoming);
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
    view: incoming.view || stored.view
  };
}

function canWriteRole(role) {
  return role === 'admin' || role === 'editor';
}

module.exports = {
  descendantIds,
  filterDocument,
  filterScenarioTree,
  mergeDocument,
  mergeScenario,
  canWriteRole
};
