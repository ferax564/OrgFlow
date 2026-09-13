'use strict';

const OrgFlow = require('../../js/orgflow-core.js');
const { descendantIds } = require('./subtree');

function activeScenario(doc, scenarioId) {
  const id = scenarioId || doc.planning.activeScenarioId;
  const scenario = doc.planning.scenarios.find(s => s.id === id);
  if (!scenario) throw new Error('Scenario was not found.');
  return scenario;
}

function summary(doc, scenarioId) {
  const scenario = activeScenario(doc, scenarioId);
  const t = OrgFlow.totals(scenario);
  return {
    tenantName: doc.branding?.companyName || '',
    chartTitle: doc.branding?.chartTitle || '',
    scenarioId: scenario.id,
    scenarioName: scenario.name,
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
  const seat = scenario.positions.find(p => p.personId === personId);
  return {
    id: person.id,
    name: person.name,
    employeeNumber: person.employeeNumber || '',
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

module.exports = {
  summary,
  searchPositions,
  getPerson,
  spanOfControl,
  dottedLines,
  vacancies,
  diffScenarios,
  activeScenario
};
