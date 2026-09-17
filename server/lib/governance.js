'use strict';
const M = require('../../js/management-core');
const C = require('../../js/orgflow-core');
const { validateDocument } = require('./document');
const { mergeDocument } = require('./subtree');
function denied(message) { return Object.assign(new Error(message), { status: 403 }); }
function checkVersion(row, expected) {
  if (!Number.isSafeInteger(Number(expected)) || expected == null || Number(expected) < 1) throw Object.assign(new Error('A workspace version is required.'), { status: 400 });
  if (Number(expected) !== row.version) throw Object.assign(new Error('Current changed. Your edits have not been discarded. Reconcile with the latest version.'), { status: 409, code: 'version_conflict', currentVersion: row.version });
}
/** General saves may edit planning data, but never manufacture decision or audit state. */
function reconcileSave(stored, incoming, membership, user, now = new Date().toISOString()) {
  stored = validateDocument(stored);incoming = validateDocument(incoming);
  const scoped = Boolean(membership.scope_position_id);
  const next = scoped ? validateDocument(mergeDocument(stored, incoming, membership.scope_position_id)) : structuredClone(incoming);
  const before = new Map(stored.planning.scenarios.map(s => [s.id, s]));
  for (const previous of before.values()) {
    if (!next.planning.scenarios.some(s => s.id === previous.id) && previous.workflow.state === 'Applied') throw denied('Applied scenarios cannot be deleted. Archive them to retain the decision record.');
  }
  for (const s of next.planning.scenarios) {
    const previous = before.get(s.id);
    if (!previous) {
      if (scoped) throw denied('Subtree editors cannot create organization-wide scenarios.');
      if (s.workflow.state !== 'Draft' || s.workflow.events.length || s.workflow.comments.length || s.workflow.approvedBy || s.workflow.approvedAt || s.workflow.appliedAt || s.appliedBefore || s.appliedAfter) throw denied('Imported scenarios must be Drafts without approval or application records.');
      s.applicationBaseline = M.snapshot(next.planning.scenarios.find(x => x.id === 'current'));
      s.workflow = M.workflow({ owner: s.workflow.owner, rationale: s.workflow.rationale, reviewers: s.workflow.reviewers, effectiveDate: s.workflow.effectiveDate }, s.id);
      M.recordEvent(s.workflow, 'created', { actor: user.email, now });
      continue;
    }
    const legacyDraft = previous.workflow.state === 'Draft' && s.workflow.state === 'Draft' && !s.workflow.events.length && !s.workflow.comments.length && !s.workflow.approvedBy && !s.workflow.approvedAt && !s.workflow.appliedAt && !s.workflow.owner && !s.workflow.rationale && !s.workflow.reviewers.length && !s.workflow.effectiveDate;
    if (!scoped && !legacyDraft && !M.same(previous.workflow, s.workflow)) throw denied('Use the decision endpoint to change scenario workflow, comments or approval state.');
    for (const field of ['baseSnapshot', 'applicationBaseline', 'appliedBefore', 'appliedAfter']) {
      if (!scoped && !(field === 'applicationBaseline' && !s[field]) && !M.same(previous[field], s[field])) throw denied('Frozen baselines and application records cannot be replaced through a workspace save.');
      s[field] = structuredClone(previous[field]);
    }
    s.workflow = structuredClone(previous.workflow);
    M.invalidateDecision(previous, s, { actor: user.email, now });
  }
  return validateDocument(next);
}
function atomicSave(store, incoming, membership, user, expected) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const row = store.getWorkspaceRow();checkVersion(row, expected);
    const next = reconcileSave(JSON.parse(row.document), incoming, membership, user);
    const saved = store.saveWorkspace(next, user.id, expected);
    store.audit({ userId: user.id, action: 'save', detail: { version: saved.version, scoped: Boolean(membership.scope_position_id) } });
    store.db.exec('COMMIT');return { ...saved, workspace: next };
  } catch (error) { store.db.exec('ROLLBACK');throw error; }
}
function decisionCommand(store, scenarioId, action, input, membership, user, expected) {
  if (!['admin', 'editor'].includes(membership.role) || membership.scope_position_id) throw denied('Organization-wide scenario decisions require an unscoped editor or administrator.');
  if (['approve', 'schedule', 'apply'].includes(action) && membership.role !== 'admin') throw denied('Only administrators may approve, schedule or apply organizational changes.');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const row = store.getWorkspaceRow();checkVersion(row, expected);
    const stored = validateDocument(JSON.parse(row.document));
    let planning;
    if (action === 'rollback') planning = C.validatePlanning(M.rollbackProposal(stored.planning, scenarioId, 'scenario-' + require('node:crypto').randomUUID(), input.name, user.email));
    else planning = M.transition(stored.planning, scenarioId, action, input, { actor: user.email, canApprove: membership.role === 'admin', now: new Date().toISOString() }, C.validatePlanning);
    // Retried application is a true no-op: no extra workspace revision or duplicate audit event.
    if (M.same(planning, stored.planning)) { store.db.exec('COMMIT');return { workspace: stored, version: row.version, updatedAt: row.updated_at }; }
    const next = validateDocument({ ...stored, planning });
    const saved = store.saveWorkspace(next, user.id, expected);
    store.audit({ userId: user.id, action: 'scenario.' + action, detail: { scenarioId, version: saved.version } });
    store.db.exec('COMMIT');return { ...saved, workspace: next };
  } catch (error) { store.db.exec('ROLLBACK');throw error; }
}
function applyProposalChanges(stored, input, actorEmail) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.changes) || input.changes.length > 500) throw new Error('Provide at most 500 record changes.');
  const name = M.text(input.name || 'Preview', 'Proposal name', 80, true);
  const rationale = M.text(input.rationale || 'Preview', 'Rationale', 3000, true);
  const id = input.previewId || ('scenario-' + require('node:crypto').randomUUID());
  let planning = M.createProposal(stored.planning, { id, name, owner: actorEmail, rationale });
  const scenario = planning.scenarios.at(-1);
  for (const change of input.changes) {
    if (!change || !M.COLLECTIONS.includes(change.entity) || !['upsert', 'remove'].includes(change.operation)) throw new Error('Unknown proposal collection or operation.');
    const recordId = M.text(change.id, 'Record ID', 150, true), rows = scenario[change.entity], index = rows.findIndex(r => r.id === recordId);
    if (change.operation === 'remove') { if (index < 0) throw new Error('Cannot remove a record that does not exist.'); rows.splice(index, 1); }
    else {
      if (!change.values || typeof change.values !== 'object' || Array.isArray(change.values)) throw new Error('Upsert values must be an object.');
      if (Object.keys(change.values).some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) throw new Error('Reserved record field.');
      if (Object.hasOwn(change.values, 'id') && change.values.id !== recordId) throw new Error('Stable record IDs cannot be changed.');
      const record = { ...(index < 0 ? {} : rows[index]), ...change.values, id: recordId };
      if (index < 0) rows.push(record); else rows[index] = record;
    }
  }
  planning = C.validatePlanning(planning);
  return { planning, scenarioId: id, name, preview: M.applicationPreview(planning, id) };
}

function previewProposal(store, input, membership, user) {
  if (!['admin', 'editor'].includes(membership.role) || membership.scope_position_id) throw denied('Creating organization-wide proposals requires an unscoped editor or administrator.');
  const row = store.getWorkspaceRow();
  const stored = validateDocument(JSON.parse(row.document));
  const applied = applyProposalChanges(stored, { ...input, previewId: 'scenario-preview' }, user.email);
  return { ok: true, name: applied.name, baseVersion: row.version, changes: applied.preview.changes, conflicts: applied.preview.conflicts || [] };
}

function validateProposal(store, input, membership, user) {
  try { return previewProposal(store, input, membership, user); }
  catch (error) { return { ok: false, error: error.message, status: error.status || 400 }; }
}

module.exports = { reconcileSave, atomicSave, decisionCommand, checkVersion, applyProposalChanges, previewProposal, validateProposal };

/** API/agent writes only create validated Draft proposals; they never approve or apply. */
function proposalCommand(store, input, membership, user) {
  if (!['admin', 'editor'].includes(membership.role) || membership.scope_position_id) throw denied('Creating organization-wide proposals requires an unscoped editor or administrator.');
  const name = M.text(input.name, 'Proposal name', 80, true), rationale = M.text(input.rationale, 'Rationale', 3000, true);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const row = store.getWorkspaceRow(); checkVersion(row, input.version);
    const stored = validateDocument(JSON.parse(row.document));
    const applied = applyProposalChanges(stored, { ...input, name, rationale }, user.email);
    const scenario = applied.planning.scenarios.find(s => s.id === applied.scenarioId);
    M.recordEvent(scenario.workflow, 'created', { actor: user.email, now: new Date().toISOString() }, 'Created through the proposal API; approval and application require separate decisions.');
    const planning = C.validatePlanning(applied.planning);
    const next = validateDocument({ ...stored, planning }), saved = store.saveWorkspace(next, user.id, input.version);
    store.audit({ userId: user.id, action: 'proposal.create', detail: { scenarioId: applied.scenarioId, version: saved.version, changes: input.changes.length } });
    store.db.exec('COMMIT');
    return { scenarioId: applied.scenarioId, name, version: saved.version, state: 'Draft', changes: M.applicationPreview(planning, applied.scenarioId).changes, message: 'Current is unchanged. Review, approval and application remain separate.' };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
module.exports.proposalCommand = proposalCommand;
