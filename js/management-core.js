/** Effective-dated workforce planning and decision workflow; shared by browser and server. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrgFlowManagement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLLECTIONS = ['positions', 'employees', 'assignments', 'reportingLines', 'costs', 'allocations', 'commitments'];
  const STATES = ['Draft', 'In review', 'Approved', 'Scheduled', 'Applied'];
  const DAY = 86400000;
  const copy = value => structuredClone(value);
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const stable = value => JSON.stringify(canonical(value));
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  }
  const same = (a, b) => stable(a) === stable(b);
  function text(value, label, max = 200, required = false) {
    if (value == null) value = '';
    if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Invalid ${label}.`);
    value = value.trim();
    if (required && !value) throw new Error(`${label} is required.`);
    return value;
  }
  function number(value, label, min, max, fallback) {
    if (value === undefined && fallback !== undefined) value = fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) throw new Error(`${label} must be ${min} to ${max}, with at most two decimals.`);
    return value;
  }
  function date(value, label, required = false) {
    value = text(value, label, 10, required);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)) throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
    return value;
  }
  function dayAfter(d, offset = 1) { return new Date(Date.parse(d + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10); }
  const active = (record, d) => (!record.startDate || record.startDate <= d) && (!record.endDate || record.endDate >= d);
  function interval(record) {
    const startDate = date(record.startDate, 'Start date', true), endDate = date(record.endDate, 'End date');
    if (endDate && endDate < startDate) throw new Error('End date precedes start date. End dates are inclusive.');
    return { startDate, endDate };
  }
  function array(input, label, limit = 10000) {
    if (input == null) return [];
    if (!Array.isArray(input) || input.length > limit) throw new Error(`${label} must contain at most ${limit} entries.`);
    return input;
  }
  function uniqueRecords(input, label, transform, limit = 10000) {
    const seen = new Set();
    return array(input, label, limit).map(raw => {
      if (!raw || typeof raw !== 'object') throw new Error(`Invalid ${label} record.`);
      const id = text(raw.id, `${label} ID`, 150, true);
      if (seen.has(id)) throw new Error(`Duplicate ${label} ID: ${id}.`);
      seen.add(id);
      return { id, ...transform(raw) };
    });
  }
  function personExtras(person) {
    return {
      capacityFte: number(person.capacityFte, 'Person capacity FTE', 0, 1, 1),
      skills: [...new Set(array(person.skills, 'Skills', 40).map(v => text(v, 'Skill', 80, true)))],
      externalId: text(person.externalId, 'External person ID', 150)
    };
  }
  function positionExtras(position) {
    return {
      assignmentMode: position.assignmentMode === 'timeline' ? 'timeline' : 'snapshot',
      reportingMode: position.reportingMode === 'timeline' ? 'timeline' : 'snapshot',
      externalId: text(position.externalId, 'External position ID', 150)
    };
  }
  function assertNoOverlap(records, key, label) {
    const groups = new Map();
    for (const r of records) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, rows] of groups) {
      rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
      for (let i = 1; i < rows.length; i++) if (!rows[i - 1].endDate || rows[i].startDate <= rows[i - 1].endDate) throw new Error(`${label} overlap for ${k}. End dates are inclusive.`);
    }
  }
  function assertCapacity(records, employees, label) {
    const capacities = new Map(employees.map(e => [e.id, e.capacityFte ?? 1]));
    const events = new Map();
    for (const r of records) {
      if (!events.has(r.personId)) events.set(r.personId, []);
      const list = events.get(r.personId);
      list.push([r.startDate || '0001-01-01', r.fte]);
      if (r.endDate && r.endDate < '9999-12-31') list.push([dayAfter(r.endDate), -r.fte]);
    }
    for (const [id, changes] of events) {
      changes.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
      let total = 0;
      for (const [d, delta] of changes) {
        total += delta;
        if (total > (capacities.get(id) ?? 1) + 1e-7) throw new Error(`${label} exceed available capacity for ${id} on ${d}.`);
      }
    }
  }
  function validateTemporal(raw, positions, employees) {
    const pmap = new Map(positions.map(p => [p.id, p])), people = new Set(employees.map(e => e.id));
    function positionRef(id) { id = text(id, 'Position ID', 150, true); if (!pmap.has(id)) throw new Error(`Timeline references missing position ${id}.`); return id; }
    function personRef(id) { id = text(id, 'Person ID', 150, true); if (!people.has(id)) throw new Error(`Timeline references missing person ${id}.`); return id; }
    const assignments = uniqueRecords(raw.assignments, 'Assignment', r => {
      const positionId = positionRef(r.positionId), dates = interval(r), p = pmap.get(positionId);
      if (p.assignmentMode !== 'timeline') throw new Error(`Enable assignment timeline for ${positionId} before adding dated assignments.`);
      if ((p.startDate && dates.startDate < p.startDate) || (p.endDate && (!dates.endDate || dates.endDate > p.endDate))) throw new Error(`Assignment must be within position ${positionId}'s active dates.`);
      return { positionId, personId: personRef(r.personId), fte: number(r.fte, 'Assignment FTE', 0.01, p.fte, p.fte), ...dates };
    });
    const reportingLines = uniqueRecords(raw.reportingLines, 'Reporting line', r => {
      const positionId = positionRef(r.positionId), managerId = r.managerId ? positionRef(r.managerId) : '';
      if (managerId === positionId) throw new Error('A position cannot report to itself.');
      if (!['solid', 'dotted'].includes(r.kind)) throw new Error('Reporting kind must be solid or dotted.');
      if (pmap.get(positionId).reportingMode !== 'timeline') throw new Error(`Enable reporting timeline for ${positionId} first.`);
      return { positionId, managerId, kind: r.kind, ...interval(r) };
    });
    const costs = uniqueRecords(raw.costs, 'Budget', r => {
      const currency = text(r.currency, 'Currency', 3, true).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a three-letter code, such as CHF, EUR or USD.');
      return { positionId: positionRef(r.positionId), annualCost: number(r.annualCost, 'Annual budget per FTE', 0, 1000000000), currency, ...interval(r) };
    });
    const allocations = uniqueRecords(raw.allocations, 'Project allocation', r => ({ personId: personRef(r.personId), project: text(r.project, 'Project', 150, true), fte: number(r.fte, 'Project FTE', 0.01, 1), ...interval(r) }));
    const commitments = uniqueRecords(raw.commitments, 'Commitment', r => ({ name: text(r.name, 'Commitment name', 150, true), group: text(r.group, 'Group', 200), skill: text(r.skill, 'Required capability', 80), requiredFte: number(r.requiredFte, 'Required FTE', 0.01, 10000), ...interval(r) }));
    assertNoOverlap(assignments, r => r.positionId, 'Assignments');
    assertNoOverlap(reportingLines, r => r.positionId + ':' + r.kind, 'Reporting lines');
    assertNoOverlap(costs, r => r.positionId, 'Budgets');
    const snapshotAssignments = positions.filter(p => p.assignmentMode !== 'timeline' && p.personId).map(p => ({ personId: p.personId, startDate: p.startDate, endDate: p.endDate, fte: Math.min(p.fte, employees.find(e => e.id === p.personId)?.capacityFte ?? 1) }));
    assertCapacity([...snapshotAssignments, ...assignments], employees, 'Dated assignments');
    assertCapacity(allocations, employees, 'Project allocations');
    const out = { assignments, reportingLines, costs, allocations, commitments };
    if (reportingLines.length) {
      const boundaryDates = new Set(reportingLines.flatMap(r => [r.startDate, ...(r.endDate && r.endDate < '9999-12-31' ? [dayAfter(r.endDate)] : [])]));
      if (boundaryDates.size > 2000) throw new Error('Reporting timeline supports at most 2,000 distinct transition dates.');
      for (const d of boundaryDates) validateReportingAt({ positions, ...out }, d);
    }
    return out;
  }
  function validateReportingAt(scenario, d) {
    const rows = effectivePositions(scenario, d), byId = new Map(rows.map(p => [p.id, p])), done = new Set();
    for (const p of rows) {
      if (p.secondaryManagerId && p.secondaryManagerId === p.managerId) throw new Error(`Dotted and solid manager are the same on ${d} for ${p.id}.`);
      let id = p.id;
      const seen = new Set();
      while (id && !done.has(id)) {
        if (seen.has(id)) throw new Error(`Reporting-line cycle on ${d}.`);
        seen.add(id);
        if (seen.size > 150) throw new Error(`Reporting hierarchy exceeds 150 levels on ${d}.`);
        id = byId.get(id)?.managerId || '';
      }
      for (const key of seen) done.add(key);
    }
  }
  function effectivePositions(scenario, d = isoToday()) {
    date(d, 'As-of date', true);
    const assignments = new Map((scenario.assignments || []).filter(r => active(r, d)).map(r => [r.positionId, r]));
    const lines = new Map((scenario.reportingLines || []).filter(r => active(r, d)).map(r => [r.positionId + ':' + r.kind, r.managerId]));
    return scenario.positions.map(p => {
      const out = { ...p };
      if (p.assignmentMode === 'timeline') {
        const a = assignments.get(p.id);
        out.personId = a?.personId || '';
        out.hiringState = a ? 'Filled' : p.hiringState === 'Recruiting' ? 'Recruiting' : 'Vacant';
        out.assignedFte = a?.fte || 0;
      } else out.assignedFte = p.personId ? p.fte : 0;
      if (p.reportingMode === 'timeline') {
        out.managerId = lines.get(p.id + ':solid') || '';
        out.secondaryManagerId = lines.get(p.id + ':dotted') || '';
      }
      return out;
    });
  }
  function snapshot(scenario) {
    return Object.fromEntries(COLLECTIONS.map(k => [k, copy(scenario[k] || [])]));
  }
  function workflow(raw = {}, id = '') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid scenario workflow.');
    const state = id === 'current' ? 'Live' : raw.state || 'Draft';
    if (id !== 'current' && !STATES.includes(state)) throw new Error('Unknown scenario decision state.');
    return {
      state, owner: text(raw.owner, 'Scenario owner', 150), rationale: text(raw.rationale, 'Rationale', 3000),
      reviewers: [...new Set(array(raw.reviewers, 'Reviewers', 30).map(v => text(v, 'Reviewer', 150, true)))],
      effectiveDate: date(raw.effectiveDate, 'Effective date'), approvedBy: text(raw.approvedBy, 'Approver', 150),
      approvedAt: text(raw.approvedAt, 'Approval timestamp', 40), appliedAt: text(raw.appliedAt, 'Applied timestamp', 40),
      rollbackOf: text(raw.rollbackOf, 'Rollback reference', 150),
      comments: uniqueRecords(raw.comments, 'Comment', r => ({ body: text(r.body, 'Comment', 3000, true), author: text(r.author, 'Comment author', 150, true), at: text(r.at, 'Comment time', 40, true) }), 500),
      events: uniqueRecords(raw.events, 'Decision event', r => ({ action: text(r.action, 'Action', 40, true), actor: text(r.actor, 'Actor', 150, true), at: text(r.at, 'Event time', 40, true), note: text(r.note, 'Event note', 1000) }), 500)
    };
  }
  function makeEvent(action, actor, at, note = '') {
    return { id: 'evt-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)), action, actor: text(actor, 'Actor', 150, true), at, note };
  }
  function recordEvent(wf, action, context, note = '') {
    if (wf.events.length >= 500) throw new Error('This scenario has 500 decision events. Archive it and create a new scenario.');
    wf.events.push(makeEvent(action, context.actor, context.now, note));
  }
  function decisionContent(s) { return { ...snapshot(s), name: s.name, description: s.description, owner: s.workflow?.owner || '', rationale: s.workflow?.rationale || '', reviewers: s.workflow?.reviewers || [], effectiveDate: s.workflow?.effectiveDate || '' }; }
  function invalidateDecision(before, after, context) {
    const previous = workflow(before.workflow, before.id);
    if (same(decisionContent(before), decisionContent(after))) return after;
    if (previous.state === 'Applied') throw new Error('Applied scenarios are immutable. Copy one to create a new proposal.');
    if (['In review', 'Approved', 'Scheduled'].includes(previous.state)) {
      after.workflow = { ...workflow(after.workflow, after.id), state: 'Draft', approvedBy: '', approvedAt: '' };
      recordEvent(after.workflow, 'invalidated', context, 'Proposal changed; review and approval are required again.');
    }
    return after;
  }
  /** Field-level three-way merge. Unrelated live changes survive; no conflict is silently selected. */
  function mergeSnapshots(base, proposed, current, resolutions = {}) {
    const result = {}, conflicts = [], changes = [];
    for (const collection of COLLECTIONS) {
      const b = new Map((base[collection] || []).map(r => [r.id, r]));
      const p = new Map((proposed[collection] || []).map(r => [r.id, r]));
      const c = new Map((current[collection] || []).map(r => [r.id, r]));
      const merged = new Map([...c].map(([id, r]) => [id, copy(r)]));
      function conflict(id, field, before, ours, theirs) {
        const key = stable([collection, id, field]), choice = resolutions[key];
        if (choice === 'proposed') return { resolved: true, value: ours };
        if (choice === 'current') return { resolved: true, value: theirs };
        conflicts.push({ key, collection, id, field, baseline: before ?? null, proposed: ours ?? null, current: theirs ?? null });
        return { resolved: false };
      }
      for (const id of new Set([...b.keys(), ...p.keys()])) {
        const before = b.get(id), ours = p.get(id), theirs = c.get(id);
        if (same(before, ours)) continue;
        changes.push({ collection, id, kind: !before ? 'added' : !ours ? 'removed' : 'changed' });
        if (!before || !ours || !theirs) {
          let value = ours;
          if (!same(theirs, before) && !same(theirs, ours)) {
            const resolution = conflict(id, '*', before, ours, theirs);
            if (!resolution.resolved) continue;
            value = resolution.value;
          }
          if (value) merged.set(id, copy(value)); else merged.delete(id);
          continue;
        }
        const row = copy(theirs);
        for (const field of new Set([...Object.keys(before), ...Object.keys(ours)])) {
          if (field === 'id' || same(before[field], ours[field])) continue;
          let value = ours[field];
          if (!same(theirs[field], before[field]) && !same(theirs[field], ours[field])) {
            const resolution = conflict(id, field, before[field], ours[field], theirs[field]);
            if (!resolution.resolved) continue;
            value = resolution.value;
          }
          if (value === undefined) delete row[field]; else row[field] = copy(value);
        }
        merged.set(id, row);
      }
      result[collection] = [...merged.values()];
    }
    return { result, conflicts, changes };
  }
  /** Reconcile a stale client with the server without last-writer-wins data loss. */
  function mergeWorkspace(baseDoc, localDoc, remoteDoc, resolutions = {}) {
    const base = baseDoc.planning, local = localDoc.planning, remote = remoteDoc.planning;
    const conflicts = [], scenarios = [];
    function mergeWithPrefix(prefix, b, ours, theirs) {
      const selected = Object.fromEntries(Object.entries(resolutions).filter(([k]) => k.startsWith(prefix + ':')).map(([k,v]) => [k.slice(prefix.length + 1),v]));
      const merged = mergeSnapshots(b, ours, theirs, selected);
      conflicts.push(...merged.conflicts.map(c => ({ ...c, key: prefix + ':' + c.key, scenarioId: prefix })));
      return merged.result;
    }
    const bmap = new Map(base.scenarios.map(s => [s.id,s])), lmap = new Map(local.scenarios.map(s => [s.id,s])), rmap = new Map(remote.scenarios.map(s => [s.id,s]));
    for (const id of new Set([...rmap.keys(),...lmap.keys(),...bmap.keys()])) {
      const b=bmap.get(id), l=lmap.get(id), r=rmap.get(id);
      if (!b || !l || !r) {
        const result = mergeWithPrefix(id, {positions:b?[b]:[]}, {positions:l?[l]:[]}, {positions:r?[r]:[]});
        if(result.positions.length)scenarios.push(result.positions[0]);
        continue;
      }
      const data=mergeWithPrefix(id,snapshot(b),snapshot(l),snapshot(r));
      const meta = s => ({positions:[{id:'scenario-details',name:s.name,description:s.description,archived:s.archived}]});
      const details=mergeWithPrefix(id+':details',meta(b),meta(l),meta(r)).positions[0];
      // Server decisions/baselines remain authoritative. A subsequent data save invalidates approval if necessary.
      scenarios.push({...copy(r),...data,name:details.name,description:details.description,archived:details.archived});
    }
    const meta = doc => ({positions:[{id:'workspace-settings',branding:doc.branding,palette:doc.palette,theme:doc.theme,positionLevels:doc.planning.positionLevels||[],namedViews:doc.planning.namedViews||[],importProfiles:doc.planning.importProfiles||[],seating:doc.planning.seating}]});
    const details=mergeWithPrefix('workspace',meta(baseDoc),meta(localDoc),meta(remoteDoc)).positions[0];
    return {conflicts,workspace:{...copy(remoteDoc),branding:details.branding,palette:details.palette,theme:details.theme,
      view:copy(localDoc.view||{}),planning:{...copy(remote),scenarios,positionLevels:details.positionLevels,namedViews:details.namedViews,importProfiles:details.importProfiles,
        ...(details.seating===undefined?{}:{seating:details.seating}),
        activeScenarioId:scenarios.some(s=>s.id===local.activeScenarioId&&!s.archived)?local.activeScenarioId:'current'}}};
  }

  function applicationPreview(planning, scenarioId, resolutions) {
    const s = planning.scenarios.find(s => s.id === scenarioId), current = planning.scenarios.find(s => s.id === 'current');
    if (!s || s.id === 'current') throw new Error('Choose a proposal rather than Current.');
    const baseline = s.applicationBaseline || (s.baseScenarioId === 'current' ? s.baseSnapshot : null);
    if (!baseline) throw new Error('This older scenario has no Current application baseline. Create a new proposal from Current first.');
    return mergeSnapshots(baseline, s, current, resolutions);
  }
  function transition(planning, scenarioId, action, input = {}, options = {}, validate = x => x) {
    const context = { actor: options.actor || 'Local planner', now: options.now || new Date().toISOString(), canApprove: options.canApprove !== false };
    const next = copy(planning), s = next.scenarios.find(s => s.id === scenarioId), current = next.scenarios.find(s => s.id === 'current');
    if (!s || !current || s.id === 'current') throw new Error('Choose a planning scenario. Current is not a proposal.');
    if (s.archived) throw new Error('Restore this archived scenario before changing its decision.');
    s.workflow = workflow(s.workflow, s.id);
    const w = s.workflow, today = context.now.slice(0, 10);
    if (action === 'apply' && w.state === 'Applied') return next; // Idempotent retry.
    if (action === 'comment') {
      if (w.comments.length >= 500) throw new Error('This scenario has reached its comment limit.');
      w.comments.push({ id: makeEvent('comment', context.actor, context.now).id, body: text(input.body, 'Comment', 3000, true), author: context.actor, at: context.now });
    } else if (action === 'metadata') {
      if (w.state === 'Applied') throw new Error('Applied scenarios are immutable.');
      const before = copy(s);
      for (const key of ['owner', 'rationale', 'reviewers', 'effectiveDate']) if (Object.hasOwn(input, key)) w[key] = input[key];
      s.workflow = workflow(w, s.id);
      invalidateDecision(before, s, context);
    } else if (action === 'submit') {
      if (w.state !== 'Draft') throw new Error('Only a Draft can be submitted.');
      if (!w.owner || !w.rationale) throw new Error('Set an owner and rationale before submitting.');
      if (!w.reviewers.length) throw new Error('Name at least one reviewer before submitting.');
      applicationPreview(next, s.id);
      w.state = 'In review';
      recordEvent(w, 'submitted', context);
    } else if (action === 'approve') {
      if (!context.canApprove) throw new Error('Only an authorized administrator may approve scenarios.');
      if (w.state !== 'In review') throw new Error('Only a scenario In review can be approved.');
      const preview = applicationPreview(next, s.id);
      if (preview.conflicts.length) throw Object.assign(new Error('Resolve live conflicts before approval.'), { conflicts: preview.conflicts });
      validate({ ...next, scenarios: next.scenarios.map(item => item.id === 'current' ? { ...item, ...preview.result } : item) });
      w.state = 'Approved';w.approvedBy = context.actor;w.approvedAt = context.now;
      recordEvent(w, 'approved', context);
    } else if (action === 'draft') {
      if (w.state === 'Applied') throw new Error('Create a rollback proposal to reverse an applied scenario.');
      w.state = 'Draft';w.approvedBy = '';w.approvedAt = '';
      recordEvent(w, 'returned-to-draft', context, text(input.note, 'Decision note', 1000));
    } else if (action === 'schedule') {
      if (!context.canApprove) throw new Error('Only an authorized administrator may schedule scenarios.');
      if (w.state !== 'Approved') throw new Error('Approve the scenario before scheduling.');
      if (!w.effectiveDate || w.effectiveDate < today) throw new Error('Set an effective date of today or later before approval.');
      w.state = 'Scheduled';recordEvent(w, 'scheduled', context, w.effectiveDate);
    } else if (action === 'rebase') {
      if (w.state === 'Applied') throw new Error('Applied scenarios cannot be rebased.');
      const preview = applicationPreview(next, s.id, input.resolutions || {});
      if (preview.conflicts.length) throw Object.assign(new Error('Choose a resolution for every conflict.'), { conflicts: preview.conflicts });
      Object.assign(s, preview.result);
      s.applicationBaseline = snapshot(current);
      w.state = 'Draft';w.approvedBy = '';w.approvedAt = '';
      recordEvent(w, 'rebased', context, 'Original comparison snapshot preserved; application baseline updated to Current.');
    } else if (action === 'apply') {
      if (!context.canApprove) throw new Error('Only an authorized administrator may apply scenarios.');
      if (!['Approved', 'Scheduled'].includes(w.state)) throw new Error('Only approved scenarios may be applied.');
      if (w.effectiveDate && w.effectiveDate > today) throw new Error(`This proposal is effective on ${w.effectiveDate}; it cannot be applied early.`);
      const preview = applicationPreview(next, s.id);
      if (preview.conflicts.length) throw Object.assign(new Error('Current changed. Resolve conflicts and approve the rebased proposal before applying.'), { conflicts: preview.conflicts });
      s.appliedBefore = snapshot(current);
      Object.assign(current, preview.result);
      current.updatedAt = context.now;
      s.appliedAfter = snapshot(current);
      w.state = 'Applied';w.appliedAt = context.now;
      recordEvent(w, 'applied', context, `Applied ${preview.changes.length} changed records to Current.`);
    } else throw new Error('Unknown scenario action.');
    s.updatedAt = context.now;
    return validate(next);
  }
  function createProposal(planning, { id, name, sourceId = 'current', owner = '', rationale = '' }, now = new Date().toISOString()) {
    const next = copy(planning), source = next.scenarios.find(s => s.id === sourceId), current = next.scenarios.find(s => s.id === 'current');
    if (!source || source.archived) throw new Error('Choose an active source scenario.');
    if (!id || next.scenarios.some(s => s.id === id)) throw new Error('A unique proposal ID is required.');
    next.scenarios.push({ id, name: text(name, 'Scenario name', 80, true), description: '', createdAt: now, updatedAt: now, archived: false, baseScenarioId: source.id,
      ...snapshot(source), baseSnapshot: { ...snapshot(source), name: source.name, capturedAt: now }, applicationBaseline: snapshot(current),
      workflow: workflow({ owner, rationale }, id) });
    next.activeScenarioId = id;
    return next;
  }
  function rollbackProposal(planning, scenarioId, id, name, actor = 'Local planner', now = new Date().toISOString()) {
    const applied = planning.scenarios.find(s => s.id === scenarioId);
    if (applied?.workflow?.state !== 'Applied' || !applied.appliedBefore || !applied.appliedAfter) throw new Error('This scenario has no application record to roll back.');
    const next = createProposal(planning, { id, name, owner: actor, rationale: `Review reversal of ${applied.name}.` }, now), s = next.scenarios.at(-1);
    Object.assign(s, copy(applied.appliedBefore));
    s.applicationBaseline = copy(applied.appliedAfter);
    s.baseSnapshot = { ...copy(applied.appliedAfter), name: `Applied ${applied.name}`, capturedAt: applied.workflow.appliedAt };
    s.workflow.rollbackOf = applied.id;
    recordEvent(s.workflow, 'rollback-proposed', { actor, now }, `Rollback of ${applied.id}; approval is still required.`);
    return next;
  }
  function forecast(scenario, { startMonth = isoToday().slice(0, 7), months = 12, group = '' } = {}) {
    if (!/^\d{4}-\d{2}$/.test(startMonth)) throw new Error('Start month must be YYYY-MM.');
    date(startMonth + '-01', 'Start month', true);
    if (!Number.isInteger(months) || months < 1 || months > 36) throw new Error('Choose 1 to 36 forecast months.');
    if (Number(startMonth.slice(0, 4)) > 9996) throw new Error('Forecast start year must be 9996 or earlier.');
    const employees = new Map(scenario.employees.map(e => [e.id, e])), rows = [];
    for (let offset = 0; offset < months; offset++) {
      const start = new Date(startMonth + '-01T00:00:00Z');start.setUTCMonth(start.getUTCMonth() + offset);
      const end = new Date(start);end.setUTCMonth(end.getUTCMonth() + 1);
      const days = (end - start) / DAY, month = start.toISOString().slice(0, 7);
      const totals = { month, approvedFte: 0, proposedFte: 0, filledFte: 0, availableFte: 0, allocatedFte: 0, requiredFte: 0, monthlyCost: {}, approvedCost: {}, proposedCost: {}, missingBudgetFte: 0, positions: 0, filled: 0, open: 0 };
      const breakdown = new Map();
      for (let day = 0; day < days; day++) {
        const d = new Date(+start + day * DAY).toISOString().slice(0, 10);
        const positions = effectivePositions(scenario, d).filter(p => active(p, d) && (!group || p.group === group));
        const activePeople = new Map();
        const budgets = new Map((scenario.costs || []).filter(r => active(r, d)).map(r => [r.positionId, r]));
        for (const p of positions) {
          if (!breakdown.has(p.id)) breakdown.set(p.id, { id: p.id, title: p.title, group: p.group, approval: p.status, positionFte: p.fte, activeDays: 0, filledDays: 0, monthlyCost: {}, missingBudgetDays: 0 });
          const line = breakdown.get(p.id);line.activeDays++;
          totals[p.status === 'Approved' ? 'approvedFte' : 'proposedFte'] += p.fte / days;
          if (p.personId) {
            line.filledDays++;
            const assigned = Math.min(p.assignedFte ?? p.fte, employees.get(p.personId)?.capacityFte ?? 1);
            totals.filledFte += assigned / days;
            activePeople.set(p.personId, (activePeople.get(p.personId) || 0) + assigned);
          }
          const budget = budgets.get(p.id);
          if (budget) {
            const amount = budget.annualCost * p.fte / 12 / days, code = budget.currency;
            totals.monthlyCost[code] = (totals.monthlyCost[code] || 0) + amount;
            const byApproval = p.status === 'Approved' ? totals.approvedCost : totals.proposedCost;
            byApproval[code] = (byApproval[code] || 0) + amount;
            line.monthlyCost[code] = (line.monthlyCost[code] || 0) + amount;
          } else { totals.missingBudgetFte += p.fte / days;line.missingBudgetDays++; }
        }
        for (const [id, available] of activePeople) totals.availableFte += Math.min(available, employees.get(id)?.capacityFte ?? 1) / days;
        for (const r of scenario.allocations || []) if (active(r, d) && activePeople.has(r.personId)) totals.allocatedFte += r.fte / days;
        for (const r of scenario.commitments || []) if (active(r, d) && (!group || r.group === group)) totals.requiredFte += r.requiredFte / days;
        if (day === days - 1) { totals.positions = positions.length;totals.filled = new Set(positions.map(p => p.personId).filter(Boolean)).size;totals.open = positions.filter(p => !p.personId).length; }
      }
      for (const key of ['approvedFte', 'proposedFte', 'filledFte', 'availableFte', 'allocatedFte', 'requiredFte', 'missingBudgetFte']) totals[key] = round(totals[key]);
      totals.staffingGapFte = round(totals.approvedFte + totals.proposedFte - totals.filledFte);
      totals.unallocatedFte = round(totals.availableFte - totals.allocatedFte);
      totals.demandGapFte = round(Math.max(0, totals.requiredFte - totals.availableFte));
      for (const field of ['monthlyCost', 'approvedCost', 'proposedCost']) for (const code of Object.keys(totals[field])) totals[field][code] = round(totals[field][code]);
      totals.breakdown = [...breakdown.values()].map(r => ({ ...r, monthlyCost: Object.fromEntries(Object.entries(r.monthlyCost).map(([k, v]) => [k, round(v)])) }));
      rows.push(totals);
    }
    return rows;
  }
  function overview(scenario, asOf = isoToday(), group = '') {
    const positions = effectivePositions(scenario, asOf).filter(p => active(p, asOf) && (!group || p.group === group));
    const activeIds = new Set(positions.map(p => p.personId).filter(Boolean)), employees = scenario.employees.filter(e => activeIds.has(e.id));
    const capabilities = new Map();
    for (const person of employees) for (const skill of person.skills || []) { if (!capabilities.has(skill)) capabilities.set(skill, []); capabilities.get(skill).push({ id: person.id, name: person.name }); }
    const byManager = new Map();for (const p of positions) if (p.managerId) byManager.set(p.managerId, (byManager.get(p.managerId) || 0) + 1);
    const commitments = (scenario.commitments || []).filter(c => active(c, asOf) && (!group || c.group === group)).map(c => ({ ...c, qualifiedPeople: c.skill ? (capabilities.get(c.skill) || []).length : employees.length }));
    return { asOf, group, positions: positions.length, people: employees.length,
      approvedVacancies: positions.filter(p => p.status === 'Approved' && !p.personId),
      proposedPositions: positions.filter(p => p.status !== 'Approved'),
      spans: positions.map(p => ({ id: p.id, title: p.title, reports: byManager.get(p.id) || 0 })).filter(p => p.reports).sort((a, b) => b.reports - a.reports),
      capabilities: [...capabilities].map(([skill, people]) => ({ skill, people, singlePoint: people.length === 1 })), commitments };
  }
  return { COLLECTIONS, STATES, stable, same, snapshot, workflow, personExtras, positionExtras, validateTemporal, validateReportingAt,
    effectivePositions, active, date, dayAfter, transition, invalidateDecision, decisionContent, createProposal, rollbackProposal,
    applicationPreview, mergeSnapshots, mergeWorkspace, forecast, overview, round, isoToday, text, number, recordEvent };
});
