'use strict';

const Management = require('../../js/management-core.js');
const OrgFlow = require('../../js/orgflow-core.js');
const { descendantIds } = require('./subtree');

function activeScenario(doc, scenarioId) {
  const id = scenarioId || doc.planning.activeScenarioId;
  const scenario = doc.planning.scenarios.find(s => s.id === id);
  if (!scenario) throw new Error('Scenario was not found.');
  return {...scenario, positions:Management.effectivePositions(scenario)};
}

function summary(doc, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  const t = OrgFlow.totals(scenario);
  return {
    tenantName: doc.branding?.companyName || '',
    chartTitle: doc.branding?.chartTitle || '',
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    assignmentsAsOf:Management.isoToday(),
    positions: t.positions,
    filled: t.filled,
    open: t.open,
    recruiting: t.recruiting,
    fte: t.fte,
    groups: [...new Set(scenario.positions.map(p => p.group).filter(Boolean))].sort()
  };
}

function searchPositions(doc, query, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  const q = String(query || '').trim().toLowerCase();
  const people = new Map(scenario.employees.map(e => [e.id, e]));
  return scenario.positions.filter(p => {
    if (!q) return true;
    const person = people.get(p.personId);
    const blob = [p.id, p.title, p.group, p.type, p.location, p.costCenter, p.jobFamily, person?.name, person?.employeeNumber].join(' ').toLowerCase();
    return blob.includes(q);
  }).map(p => projectPosition(p, people));
}

function projectPosition(p, people) {
  const person = p.personId ? people.get(p.personId) : null;
  return {
    id: p.id,
    title: p.title,
    type: p.type,
    group: p.group,
    fte: p.fte,
    status: p.status,
    hiringState: p.hiringState,
    managerId: p.managerId,
    secondaryManagerId: p.secondaryManagerId,
    location: p.location,
    costCenter: p.costCenter,
    jobFamily: p.jobFamily,
    personId: p.personId,
    personName: person?.name || '',
    employeeNumber: person?.employeeNumber || ''
  };
}

function getPerson(doc, personId, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  const person = scenario.employees.find(e => e.id === personId);
  if (!person) throw new Error('Person was not found in the visible organization.');
  const seats=scenario.positions.filter(p=>p.personId===personId),seat=seats[0];
  return {
    id: person.id,
    name: person.name,
    employeeNumber: person.employeeNumber || '',
    capacityFte:person.capacityFte??1, skills:person.skills||[],
    positions:seats.map(p=>({id:p.id,title:p.title,group:p.group,managerId:p.managerId,assignedFte:p.assignedFte})),
    position: seat ? { id: seat.id, title: seat.title, group: seat.group, managerId: seat.managerId } : null
  };
}

function spanOfControl(doc, positionId, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  const position = scenario.positions.find(p => p.id === positionId);
  if (!position) throw new Error('Position was not found in the visible organization.');
  const tree = descendantIds(scenario.positions, positionId);
  const direct = scenario.positions.filter(p => p.managerId === positionId);
  const dotted = scenario.positions.filter(p => p.secondaryManagerId === positionId);
  return {
    positionId,
    title: position.title,
    directReports: direct.length,
    descendants: Math.max(0, tree.size - 1),
    dottedLineReports: dotted.length,
    directReportIds: direct.map(p => p.id)
  };
}

function dottedLines(doc, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  const byId = new Map(scenario.positions.map(p => [p.id, p]));
  return scenario.positions.filter(p => p.secondaryManagerId).map(p => ({
    positionId: p.id,
    title: p.title,
    secondaryManagerId: p.secondaryManagerId,
    secondaryManagerTitle: byId.get(p.secondaryManagerId)?.title || ''
  }));
}

function vacancies(doc, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  return scenario.positions.filter(p => p.hiringState !== 'Filled').map(p => ({
    id: p.id,
    title: p.title,
    group: p.group,
    hiringState: p.hiringState,
    fte: p.fte,
    managerId: p.managerId
  }));
}

function diffScenarios(doc, fromId, toId) {
  const from = activeScenario(doc, fromId);
  const to = activeScenario(doc, toId);
  return OrgFlow.scenarioChanges(from, to).filter(c => c.kind !== 'unchanged').map(c => ({
    id: c.id,
    kind: c.kind,
    title: (c.after || c.before).title,
    fields: c.fields
  }));
}

function context(doc, extra = {}) {
  const planning = doc.planning || {};
  return {
    workspaceId: planning.workspaceId || '',
    revision: Number.isInteger(planning.revision) ? planning.revision : 0,
    lastCommittedAt: planning.lastCommittedAt || '',
    documentVersion: planning.version || 0,
    schema: planning.schema || 0,
    scenario: extra.scenario || planning.activeScenarioId || 'current',
    asOf: extra.asOf || Management.isoToday(),
    serverVersion: extra.serverVersion || '',
    serverDocumentVersion: extra.serverDocumentVersion ?? null,
    scopePositionId: extra.scopePositionId || ''
  };
}

function withContext(doc, payload, extra) {
  return { context: context(doc, extra), ...payload };
}

function workspaceStatus(doc, extra = {}) {
  const stamp = OrgFlow.workspaceStamp(doc.planning);
  return withContext(doc, {
    storage: extra.storage || 'shared-server',
    workspaceId: stamp.workspaceId,
    revision: stamp.revision,
    lastCommittedAt: stamp.lastCommittedAt,
    documentVersion: doc.planning?.version || 0,
    schema: doc.planning?.schema || 0,
    scenarios: (doc.planning?.scenarios || []).map(s => ({ id: s.id, name: s.name, archived: Boolean(s.archived), state: s.workflow?.state || '' })),
    latest: extra.latest !== false
  }, extra);
}

function positionChangesSince(currentDoc, previousDoc, scenarioId) {
  const id = scenarioId || currentDoc.planning.activeScenarioId;
  const from = activeScenario(previousDoc, id);
  const to = activeScenario(currentDoc, id);
  return OrgFlow.scenarioChanges(from, to).filter(c => c.kind !== 'unchanged').map(c => ({
    id: c.id,
    kind: c.kind,
    title: (c.after || c.before).title,
    fields: c.fields
  }));
}

function capacityGap(doc, { scenario, month, months, group } = {}) {
  const s = doc.planning.scenarios.find(x => x.id === (scenario || doc.planning.activeScenarioId)) || doc.planning.scenarios[0];
  if (!s) throw new Error('Scenario was not found.');
  const rows = Management.forecast(s, { startMonth: month || undefined, months: months ?? 12, group: group || '' });
  const gaps = rows.filter(r => r.demandGapFte > 0 || r.staffingGapFte > 0).map(r => ({
    month: r.month,
    requiredFte: r.requiredFte,
    availableFte: r.availableFte,
    demandGapFte: r.demandGapFte,
    approvedFte: r.approvedFte,
    filledFte: r.filledFte,
    staffingGapFte: r.staffingGapFte
  }));
  const asOf = (month ? month + '-01' : Management.isoToday());
  const ov = Management.overview(s, asOf, group || '');
  return {
    gaps,
    commitments: ov.commitments,
    assumptions: 'Demand gap is required commitment FTE minus available person capacity. Staffing gap is planned position FTE minus filled FTE. End dates are inclusive. Missing budgets are not treated as zero.'
  };
}

module.exports = {
  summary,
  searchPositions,
  getPerson,
  spanOfControl,
  dottedLines,
  vacancies,
  diffScenarios,
  activeScenario,
  context,
  withContext,
  workspaceStatus,
  positionChangesSince,
  capacityGap
};
