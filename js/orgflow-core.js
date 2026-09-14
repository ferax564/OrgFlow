/**
 * OrgFlow domain logic. No DOM. Shared by the app and automated tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrgFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROLE_TYPES = ['Head', 'Team Leader', 'Engineer', 'Specialist', 'Graduate', 'Intern'];
  const STATUSES = ['Approved', 'Not approved'];
  const HIRING_STATES = ['Filled', 'Recruiting', 'Vacant'];
  const POSITION_FIELDS = ['id', 'managerId', 'secondaryManagerId', 'title', 'type', 'group', 'fte', 'status', 'hiringState', 'personId', 'startDate', 'endDate', 'location', 'costCenter', 'jobFamily'];
  const DIFF_FIELDS = [
    ['title', 'Position title'], ['managerId', 'Reports to'], ['secondaryManagerId', 'Dotted-line to'],
    ['type', 'Position type'], ['group', 'Group / team'], ['fte', 'Position FTE'], ['status', 'Approval'],
    ['hiringState', 'Hiring state'], ['personId', 'Assigned person'],
    ['startDate', 'Position start'], ['endDate', 'Position end'],
    ['location', 'Location'], ['costCenter', 'Cost center'], ['jobFamily', 'Job family'],
    ['sortOrder', 'Reporting order'], ['stacked', 'Stacked reports']
  ];
  const POSITION_CSV_COLUMNS = ['positionId', 'reportsToPositionId', 'secondaryManagerId', 'title', 'type', 'group', 'fte', 'approval', 'hiringState', 'personId', 'name', 'employeeNumber', 'startDate', 'endDate', 'location', 'costCenter', 'jobFamily', 'sortOrder', 'stacked'];
  const CARD_DISPLAY_DEFAULTS = { fte: true, site: true, group: true, type: true, approval: true, hiring: true, cumulative: false, groupGap: 32, chartDots: true };
  const CARD_W = 248;
  const ALIASES = {
    id: ['positionid', 'id'],
    managerId: ['reportstopositionid', 'managerpositionid', 'managerid', 'reportstoid', 'parentid'],
    secondaryManagerId: ['secondarymanagerid', 'dottedlineid', 'dottedlineto', 'matrixmanagerid'],
    managerName: ['manager', 'reports to', 'reportsto', 'managername', 'reportingmanager'],
    personId: ['personid', 'userid'],
    employeeNumber: ['employeenumber', 'employeeno', 'staffid', 'badgeid'],
    name: ['name', 'fullname', 'person', 'employee', 'employeename'],
    title: ['title', 'jobtitle', 'position', 'role'],
    type: ['type', 'positiontype', 'employmenttype', 'employeetype'],
    group: ['group', 'team', 'department', 'function'],
    startDate: ['startdate', 'start', 'effectivestart', 'datefrom', 'joiningdate'],
    endDate: ['enddate', 'end', 'effectiveend', 'dateto', 'leavingdate'],
    status: ['status', 'approval', 'approved', 'approvalstatus'],
    hiringState: ['hiringstate', 'hiringstatus', 'vacancystatus', 'staffingstatus'],
    fte: ['fte', 'fulltimeequivalent', 'positionfte'],
    location: ['location', 'site', 'office', 'city'],
    costCenter: ['costcenter', 'costcentre', 'cc'],
    jobFamily: ['jobfamily', 'jobfunction', 'family'],
    sortOrder: ['sortorder', 'reportingorder', 'order', 'siblingorder'],
    stacked: ['stacked', 'stackreports', 'stack']
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function slug(s) {
    return String(s || 'group').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
  }
  function makeId(prefix = 'pos') {
    return prefix + '-' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12)));
  }
  function isISODate(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const parsed = new Date(d + 'T12:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  }
  function cleanString(v, label, max = 1000, required = false) {
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error(`Invalid ${label}.`);
    const value = v.trim();
    if (required && !value) throw new Error(`${label} is required.`);
    return value;
  }
  function fmtDate(d) {
    if (!d) return '—';
    try { return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(d + 'T00:00:00')); }
    catch { return d; }
  }
  function fteText(value) {
    return Number(value).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function csvEscape(value) {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  function csvRows(headers, rows) {
    return '\ufeff' + [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n');
  }
  function positionCSVValues(p, scenario) {
    const person = scenario.employees.find(x => x.id === p.personId);
    return [p.id, p.managerId, p.secondaryManagerId, p.title, p.type, p.group, p.fte, p.status, p.hiringState, p.personId, person?.name || '', person?.employeeNumber || '', p.startDate, p.endDate, p.location, p.costCenter, p.jobFamily, p.sortOrder ?? 0, p.stacked === true ? 'true' : p.stacked === false ? 'false' : ''];
  }
  function validPersonPhoto(v) {
    if (!v) return null;
    if (typeof v !== 'object') throw new Error('Invalid person photo.');
    if (typeof v.data !== 'string' || v.data.length > 160000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.data)) throw new Error('Person photos must be small PNG images stored in this browser.');
    if (!Number.isFinite(v.width) || v.width < 1 || v.width > 512 || !Number.isFinite(v.height) || v.height < 1 || v.height > 512) throw new Error('Person photo dimensions are invalid.');
    return { data: v.data, width: v.width, height: v.height };
  }
  function wouldCreateCycle(positions, id, newManagerId) {
    if (!newManagerId) return false;
    if (newManagerId === id) return true;
    const byId = new Map(positions.map(p => [p.id, p.id === id ? { ...p, managerId: newManagerId } : p]));
    if (!byId.has(newManagerId)) return true;
    let cur = newManagerId;
    const path = new Set([id]);
    while (cur) {
      if (path.has(cur)) return true;
      path.add(cur);
      cur = byId.get(cur)?.managerId || '';
      if (path.size > 150) return true;
    }
    return false;
  }
  function detectDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { i++; continue; }
        quoted = !quoted;
      } else if (!quoted) {
        if (c === '\n' || c === '\r') break;
        if (c in counts) counts[c]++;
      }
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  function parseCSV(raw) {
    const text = raw.replace(/^\uFEFF/, ''), delimiter = detectDelimiter(text), rows = [];
    let row = [], cell = '', quoted = false, closed = false;
    const pushRow = () => { row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = ''; closed = false; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else { quoted = false; closed = true; }
        } else cell += c;
        continue;
      }
      if (c === delimiter) { row.push(cell); cell = ''; closed = false; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; pushRow(); }
      else if (c === '"') {
        if (cell.trim() || closed) throw new Error('Invalid quotation in CSV. Quote the whole field and double embedded quotes.');
        cell = ''; quoted = true;
      } else {
        if (closed && !/\s/.test(c)) throw new Error('Unexpected text after a closing CSV quote.');
        if (!closed) cell += c;
      }
    }
    if (quoted) throw new Error('An opening quote in this CSV is not closed.');
    if (cell || row.length || closed) pushRow();
    return rows;
  }
  function normHeader(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  function headerMap(headers) {
    const normalized = headers.map(normHeader), map = {};
    for (const [key, aliases] of Object.entries(ALIASES)) {
      const indexes = normalized.flatMap((h, i) => aliases.map(normHeader).includes(h) ? [i] : []);
      if (indexes.length > 1) throw new Error(`Multiple columns map to ${key}. Keep only one.`);
      if (indexes.length) map[key] = indexes[0];
    }
    return map;
  }
  function sanitizePositionLevels(input) {
    if (!Array.isArray(input)) return [];
    const out = [], seen = new Set(ROLE_TYPES.map(x => x.toLowerCase()));
    for (const raw of input) {
      if (typeof raw !== 'string') continue;
      const name = cleanString(raw, 'Position level', 40, true);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= 24) break;
    }
    return out;
  }
  function positionTypes(levels) {
    return ROLE_TYPES.concat(sanitizePositionLevels(levels));
  }
  function normalizeType(value, warnings, rowNo, extraTypes = []) {
    const s = String(value || '').trim();
    if (!s) return 'Engineer';
    const extra = sanitizePositionLevels(extraTypes);
    const extraHit = extra.find(t => t.toLowerCase() === s.toLowerCase());
    if (extraHit) return extraHit;
    const key = s.toLowerCase();
    if (ROLE_TYPES.some(t => t.toLowerCase() === key)) return ROLE_TYPES.find(t => t.toLowerCase() === key);
    if (['head', 'director', 'department head', 'function head', 'chief', 'ceo', 'coo'].includes(key)) return 'Head';
    if (['team leader', 'team lead', 'lead', 'leader', 'group leader', 'manager'].includes(key)) return 'Team Leader';
    if (['engineer', 'senior engineer', 'normal engineer', 'staff', 'software engineer'].includes(key)) return 'Engineer';
    if (['specialist', 'analyst', 'designer', 'product manager', 'customer success', 'buyer', 'partner'].includes(key)) return 'Specialist';
    if (['graduate', 'grad', 'graduate engineer'].includes(key)) return 'Graduate';
    if (['intern', 'internship', 'trainee'].includes(key)) return 'Intern';
    warnings.push(`Row ${rowNo}: unknown position type “${value}”; mapped to Engineer.`);
    return 'Engineer';
  }
  function normalizeStatus(value) {
    const s = String(value || '').trim().toLowerCase();
    if (['approved', 'yes', 'y', 'true', '1', 'ok'].includes(s)) return 'Approved';
    if (['not approved', 'unapproved', 'no', 'n', 'false', '0', 'pending', ''].includes(s)) return 'Not approved';
    throw new Error(`Unknown approval “${value}”. Use Approved or Not approved.`);
  }
  function normalizeDate(value, warnings, rowNo, label) {
    let s = String(value || '').trim();
    if (!s) return '';
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) s = s.replaceAll('/', '-');
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
      const [day, month, year] = s.split('.');
      s = `${year}-${month}-${day}`;
    }
    if (!isISODate(s)) throw new Error(`Row ${rowNo}: invalid or ambiguous ${label} “${value}”. Use YYYY-MM-DD.`);
    return s;
  }
  function validatePeopleData(input) {
    if (!Array.isArray(input) || input.length > 10000) throw new Error('Workspace must contain a people array with no more than 10,000 entries.');
    const ids = new Set();
    const list = input.map((p, index) => {
      if (!p || typeof p !== 'object') throw new Error(`Invalid person at row ${index + 1}.`);
      const fields = ['id', 'managerId', 'name', 'title', 'type', 'group', 'startDate', 'endDate', 'status'], out = {};
      for (const f of fields) {
        if (typeof p[f] !== 'string' || p[f].length > 1000) throw new Error(`Invalid ${f} at row ${index + 1}.`);
        out[f] = p[f];
      }
      if (!out.id || !out.name.trim() || ids.has(out.id)) throw new Error(`Missing name or duplicate person ID at row ${index + 1}.`);
      ids.add(out.id);
      if (!ROLE_TYPES.includes(out.type) || !STATUSES.includes(out.status)) throw new Error(`Unknown position type or approval status at row ${index + 1}.`);
      if ((out.startDate && !isISODate(out.startDate)) || (out.endDate && !isISODate(out.endDate)) || (out.startDate && out.endDate && out.endDate < out.startDate)) throw new Error(`Invalid dates at row ${index + 1}.`);
      return out;
    });
    const byId = new Map(list.map(p => [p.id, p]));
    for (const p of list) if (p.managerId && !byId.has(p.managerId)) throw new Error(`${p.name} has a missing manager.`);
    const complete = new Set();
    for (const p of list) {
      let id = p.id;
      const path = new Set();
      while (id && !complete.has(id)) {
        if (path.has(id)) throw new Error('This workspace contains a reporting-line cycle.');
        path.add(id);
        id = byId.get(id)?.managerId || '';
      }
      for (const key of path) complete.add(key);
    }
    return list;
  }
  function parseStackedFlag(value) {
    if (value === true || value === false) return value;
    if (typeof value !== 'string') return undefined;
    const s = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'stacked'].includes(s)) return true;
    if (['false', 'no', '0', 'spread', 'horizontal'].includes(s)) return false;
    if (!s) return undefined;
    throw new Error('Stacked must be true or false.');
  }
  function parseSortOrder(value) {
    if (value === undefined || value === null || value === '') return 0;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(n) || n < -10000 || n > 10000) throw new Error('Reporting order must be a number between -10,000 and 10,000.');
    return Math.round(n);
  }
  function validateScenarioData(data, extraTypes = []) {
    if (!data || !Array.isArray(data.positions) || !Array.isArray(data.employees)) throw new Error('A scenario needs positions and people arrays.');
    if (data.positions.length > 2500 || data.employees.length > 5000) throw new Error('Maximum 2,500 positions and 5,000 people per scenario.');
    const allowedTypes = new Set(positionTypes(extraTypes));
    const ids = new Set(), personIds = new Set(), assigned = new Set();
    const employees = data.employees.map(p => {
      if (!p || typeof p !== 'object') throw new Error('Invalid person record.');
      const id = cleanString(p.id, 'Person ID', 150, true), name = cleanString(p.name, 'Person name', 150, true);
      if (personIds.has(id)) throw new Error(`Duplicate person ID: ${id}.`);
      personIds.add(id);
      return { id, name, employeeNumber: cleanString(p.employeeNumber || '', 'Employee number', 80), photo: validPersonPhoto(p.photo) };
    });
    const positions = data.positions.map(p => {
      if (!p || typeof p !== 'object') throw new Error('Invalid position record.');
      const out = {};
      for (const key of POSITION_FIELDS.filter(k => k !== 'fte')) out[key] = cleanString(p[key] || '', key === 'title' ? 'Position title' : key, ['title', 'group', 'location', 'jobFamily'].includes(key) ? 200 : 150, ['id', 'title', 'type', 'status', 'hiringState'].includes(key));
      if (ids.has(out.id)) throw new Error(`Duplicate position ID: ${out.id}.`);
      ids.add(out.id);
      if (!allowedTypes.has(out.type)) throw new Error(`Unknown position type on ${out.id}.`);
      if (!STATUSES.includes(out.status)) throw new Error(`Unknown approval on ${out.id}.`);
      if (!HIRING_STATES.includes(out.hiringState)) throw new Error(`Unknown hiring state on ${out.id}.`);
      if (typeof p.fte !== 'number' || !Number.isFinite(p.fte) || p.fte <= 0 || p.fte > 1 || Math.abs(p.fte * 100 - Math.round(p.fte * 100)) > 1e-8) throw new Error(`FTE on ${out.id} must be 0.01 to 1.00, with at most two decimals.`);
      out.fte = p.fte;
      out.sortOrder = parseSortOrder(p.sortOrder);
      const stacked = parseStackedFlag(p.stacked);
      if (stacked === true || stacked === false) out.stacked = stacked;
      if ((out.startDate && !isISODate(out.startDate)) || (out.endDate && !isISODate(out.endDate)) || (out.startDate && out.endDate && out.endDate < out.startDate)) throw new Error(`Invalid position dates on ${out.id}.`);
      if (out.personId && !personIds.has(out.personId)) throw new Error(`Assigned person is missing on ${out.id}.`);
      if (out.hiringState === 'Filled' && !out.personId) throw new Error(`Filled position ${out.id} needs an assigned person.`);
      if (out.hiringState !== 'Filled' && out.personId) throw new Error(`An open position cannot also have an assigned person (${out.id}).`);
      if (out.personId && assigned.has(out.personId)) throw new Error('A person can fill only one position within a scenario.');
      if (out.personId) assigned.add(out.personId);
      return out;
    });
    const byId = new Map(positions.map(p => [p.id, p]));
    for (const p of positions) if (p.managerId && !ids.has(p.managerId)) throw new Error(`Position ${p.id} has a missing reporting position: ${p.managerId}.`);
    for (const p of positions) {
      if (p.secondaryManagerId) {
        if (!ids.has(p.secondaryManagerId)) throw new Error(`Position ${p.id} has a missing dotted-line manager: ${p.secondaryManagerId}.`);
        if (p.secondaryManagerId === p.id) throw new Error(`Position ${p.id} cannot have a dotted line to itself.`);
        if (p.secondaryManagerId === p.managerId) throw new Error(`Position ${p.id}: dotted-line manager must differ from the solid reporting line.`);
      }
    }
    const done = new Set();
    for (const p of positions) {
      let id = p.id;
      const path = new Set();
      while (id && !done.has(id)) {
        if (path.has(id)) throw new Error('This change would create a reporting-line cycle.');
        path.add(id);
        id = byId.get(id)?.managerId || '';
        if (path.size > 150) throw new Error('Reporting hierarchy is too deep (150 levels maximum).');
      }
      for (const key of path) done.add(key);
    }
    return { positions, employees };
  }
  function validatePlanning(input) {
    if (!input || input.version !== 2 || !Array.isArray(input.scenarios) || !input.scenarios.length || input.scenarios.length > 30) throw new Error('Invalid planning workspace (maximum 30 scenarios).');
    const positionLevels = sanitizePositionLevels(input.positionLevels);
    const ids = new Set(), names = new Set();
    const scenarios = input.scenarios.map(s => {
      const id = cleanString(s.id, 'Scenario ID', 150, true), name = cleanString(s.name, 'Scenario name', 80, true);
      if (ids.has(id) || names.has(name.toLocaleLowerCase())) throw new Error('Scenario names and IDs must be unique.');
      ids.add(id); names.add(name.toLocaleLowerCase());
      const data = validateScenarioData(s, positionLevels);
      const baseSnapshot = s.baseSnapshot ? { ...validateScenarioData(s.baseSnapshot, positionLevels), name: cleanString(s.baseSnapshot.name || 'Original baseline', 'Baseline name', 80), capturedAt: String(s.baseSnapshot.capturedAt || '').slice(0, 40) } : null;
      return { id, name, description: cleanString(s.description || '', 'Scenario notes', 1000), createdAt: String(s.createdAt || '').slice(0, 40), updatedAt: String(s.updatedAt || '').slice(0, 40), baseScenarioId: typeof s.baseScenarioId === 'string' ? s.baseScenarioId.slice(0, 150) : '', baseSnapshot, ...data };
    });
    if (!ids.has('current')) throw new Error('Workspace must include the protected Current scenario.');
    if (scenarios.find(s => s.id === 'current').name !== 'Current') throw new Error('The Current scenario cannot be renamed.');
    if (!ids.has(input.activeScenarioId)) throw new Error('Active scenario was not found.');
    return { version: 2, activeScenarioId: input.activeScenarioId, scenarios, positionLevels };
  }
  function migrateLegacy(legacy) {
    const roster = validatePeopleData(legacy), stamp = new Date().toISOString();
    return {
      version: 2, activeScenarioId: 'current', scenarios: [{
        id: 'current', name: 'Current', description: '', createdAt: stamp, updatedAt: stamp, baseScenarioId: '', baseSnapshot: null,
        employees: roster.map(p => ({ id: p.id, name: p.name, employeeNumber: '', photo: null })),
        positions: roster.map(p => ({ id: p.id, managerId: p.managerId, secondaryManagerId: '', title: p.title.trim() || `${p.type} position`, type: p.type, group: p.group, fte: 1, status: p.status, hiringState: 'Filled', personId: p.id, startDate: p.startDate, endDate: p.endDate, location: '', costCenter: '', jobFamily: '' }))
      }]
    };
  }
  function projection(scenario) {
    const people = new Map(scenario.employees.map(p => [p.id, p]));
    return scenario.positions.map(p => {
      const person = p.personId ? people.get(p.personId) : null;
      return { ...p, name: person ? person.name : p.hiringState === 'Recruiting' ? 'Recruiting' : 'Vacant position', personName: person?.name || '', photo: person?.photo || null, employeeNumber: person?.employeeNumber || '' };
    });
  }
  function totals(scenario, filter = () => true) {
    const rows = scenario.positions.filter(filter);
    const filled = rows.filter(p => p.hiringState === 'Filled').length;
    const sum = xs => Math.round(xs.reduce((n, p) => n + p.fte, 0) * 100) / 100;
    return { positions: rows.length, filled, open: rows.length - filled, recruiting: rows.filter(p => p.hiringState === 'Recruiting').length, approved: rows.filter(p => p.status === 'Approved').length, fte: sum(rows), approvedFte: sum(rows.filter(p => p.status === 'Approved')) };
  }
  function scenarioChanges(baseline, target) {
    const before = new Map(baseline.positions.map(p => [p.id, p])), after = new Map(target.positions.map(p => [p.id, p]));
    const beforeNames = new Map(baseline.employees.map(p => [p.id, p.name])), afterNames = new Map(target.employees.map(p => [p.id, p.name]));
    const result = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(id) || null, b = after.get(id) || null;
      let fields = [];
      if (a && b) {
        for (const [key, label] of DIFF_FIELDS) if (a[key] !== b[key]) fields.push({ key, label, before: a[key], after: b[key] });
        if (a.personId && a.personId === b.personId && beforeNames.get(a.personId) !== afterNames.get(b.personId)) fields.push({ key: 'personName', label: 'Person name', before: beforeNames.get(a.personId), after: afterNames.get(b.personId) });
      }
      result.push({ id, before: a, after: b, kind: !a ? 'added' : !b ? 'removed' : fields.length ? 'changed' : 'unchanged', fields });
    }
    return result.sort((a, b) => ({ added: 0, removed: 1, changed: 2, unchanged: 3 }[a.kind] - { added: 0, removed: 1, changed: 2, unchanged: 3 }[b.kind]) || (a.after || a.before).title.localeCompare((b.after || b.before).title) || (a.id.localeCompare(b.id)));
  }
  function fieldValue(key, value, scenario) {
    if (key === 'managerId' || key === 'secondaryManagerId') {
      if (!value) return key === 'secondaryManagerId' ? 'None' : 'Top level';
      const p = scenario.positions.find(x => x.id === value);
      return p ? `${p.title} [${p.id}]` : String(value);
    }
    if (key === 'personId') {
      if (!value) return 'Unassigned';
      const p = scenario.employees.find(x => x.id === value);
      return p ? `${p.name} [${p.id}]` : String(value);
    }
    if (key === 'fte') return fteText(value);
    if (key === 'sortOrder') return String(Number.isFinite(value) ? value : 0);
    if (key === 'stacked') return value === true ? 'Stacked' : value === false ? 'Side by side' : 'Auto';
    return String(value || '—');
  }
  function prepareImport(text, fileName, source, idFactory = makeId, extraTypes = []) {
    const rows = parseCSV(text), errors = [], warnings = [], positions = [], employees = [];
    const result = { positions, employees, errors, warnings, filename: fileName, scenarioId: source.id };
    if (rows.length < 2) { errors.push('The CSV has no data rows.'); return result; }
    if (rows.length > 2501) { errors.push('Import supports at most 2,500 positions at a time.'); return result; }
    const headers = rows.shift(), map = headerMap(headers);
    result.columns = Object.keys(map);
    if (map.name === undefined && map.title === undefined && map.id === undefined) { errors.push('A position ID, title or name column is required.'); return result; }
    const recognized = new Set(Object.values(map)), ignored = headers.filter((_, i) => !recognized.has(i));
    if (ignored.length) warnings.push('Ignored columns: ' + ignored.join(', ') + '.');
    const seen = new Set(), employeeMap = new Map();
    let generated = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], rowNo = i + 2, get = key => map[key] === undefined ? '' : String(row[map[key]] ?? '').trim();
      if (row.length !== headers.length) { errors.push(`Row ${rowNo}: ${row.length} cells, but the header has ${headers.length}.`); continue; }
      try {
        let id = get('id');
        if (!id) { id = idFactory('pos'); generated++; }
        if (seen.has(id)) throw new Error(`Row ${rowNo}: duplicate position ID “${id}”.`);
        seen.add(id);
        let name = get('name'), personId = get('personId');
        const old = source.positions.find(x => x.id === id), oldPerson = source.employees.find(x => x.id === old?.personId);
        if (map.name === undefined && map.personId === undefined && get('hiringState').toLowerCase() === 'filled' && oldPerson) { personId = oldPerson.id; name = oldPerson.name; }
        if (name && !personId) personId = oldPerson?.name === name ? oldPerson.id : 'person-' + id;
        if (!name && personId) name = source.employees.find(x => x.id === personId)?.name || '';
        if (personId && !name) throw new Error(`Row ${rowNo}: personId requires a name or an existing person in this scenario.`);
        let hiringState = get('hiringState');
        if (!hiringState) hiringState = personId ? 'Filled' : 'Vacant';
        else {
          const synonyms = { filled: 'Filled', occupied: 'Filled', assigned: 'Filled', vacant: 'Vacant', open: 'Vacant', recruiting: 'Recruiting', hiring: 'Recruiting' };
          hiringState = synonyms[hiringState.toLowerCase()];
          if (!hiringState) throw new Error(`Row ${rowNo}: hiringState must be Filled, Recruiting or Vacant.`);
        }
        if (hiringState === 'Filled' && !personId) throw new Error(`Row ${rowNo}: Filled requires a person name.`);
        if (hiringState !== 'Filled' && personId) throw new Error(`Row ${rowNo}: ${hiringState} must not have an assigned person. Clear name/personId or select Filled.`);
        if (personId) {
          if (employeeMap.has(personId) && employeeMap.get(personId).name !== name) throw new Error(`Row ${rowNo}: conflicting names for person ${personId}.`);
          employeeMap.set(personId, { id: personId, name, employeeNumber: get('employeeNumber'), photo: source.employees.find(x => x.id === personId)?.photo || null });
        }
        const type = normalizeType(get('type'), warnings, rowNo, extraTypes), title = get('title') || `${type} position`;
        if (!get('title')) warnings.push(`Row ${rowNo}: no title supplied. New/replaced positions use “${title}”; Update by ID keeps an existing title when its column is omitted.`);
        let sortOrder = 0, stacked;
        if (map.sortOrder !== undefined && get('sortOrder') !== '') sortOrder = parseSortOrder(get('sortOrder'));
        if (map.stacked !== undefined && get('stacked') !== '') stacked = parseStackedFlag(get('stacked'));
        const rowPos = { id, managerId: get('managerId'), managerName: get('managerName'), secondaryManagerId: get('secondaryManagerId'), title, type, group: get('group'), fte: get('fte') ? Number(get('fte')) : 1, status: normalizeStatus(get('status')), hiringState, personId, startDate: normalizeDate(get('startDate'), warnings, rowNo, 'position start'), endDate: normalizeDate(get('endDate'), warnings, rowNo, 'position end'), location: get('location'), costCenter: get('costCenter'), jobFamily: get('jobFamily'), sortOrder };
        if (stacked === true || stacked === false) rowPos.stacked = stacked;
        positions.push(rowPos);
      } catch (error) { errors.push(error.message); }
    }
    employees.push(...employeeMap.values());
    const incomingIds = new Set(positions.map(p => p.id)), pool = [...positions, ...source.positions.filter(p => !incomingIds.has(p.id))];
    const names = new Map([...source.employees, ...employees].map(p => [p.id, p.name]));
    for (const p of positions) {
      if (!p.managerId && p.managerName) {
        const wanted = p.managerName.toLowerCase();
        let matches = pool.filter(x => x.id.toLowerCase() === wanted);
        if (!matches.length) matches = pool.filter(x => x.title.toLowerCase() === wanted || (x.personId && names.get(x.personId)?.toLowerCase() === wanted));
        if (matches.length === 1) p.managerId = matches[0].id;
        else errors.push(`${p.title}: reporting manager “${p.managerName}” ${matches.length ? 'is ambiguous; use a position ID' : 'was not found'}.`);
      }
      delete p.managerName;
    }
    if (generated) warnings.push(`Generated ${generated} position ID(s). Keep IDs from an export to match positions across scenarios.`);
    if (map.hiringState === undefined) warnings.push('Hiring defaults: named person = Filled; no person = Vacant. Update by ID keeps the assignment when all person/hiring columns are omitted.');
    if (map.fte === undefined) warnings.push('Missing FTE defaults to 1.00 for new/replaced positions; Update by ID keeps existing FTE.');
    if (map.status === undefined) warnings.push('Missing approval defaults to Not approved for new/replaced positions; Update by ID keeps existing approval.');
    return result;
  }
  function makeImportScenario(result, mode, source, extraTypes = []) {
    const s = structuredClone(source);
    if (result.scenarioId !== s.id) throw new Error('The active scenario changed. Select the file again.');
    const allPeople = new Map(s.employees.map(p => [p.id, p]));
    result.employees.forEach(p => allPeople.set(p.id, structuredClone(p)));
    s.employees = [...allPeople.values()];
    if (mode === 'replace') s.positions = structuredClone(result.positions);
    else if (mode === 'append') {
      for (const p of result.positions) if (s.positions.some(x => x.id === p.id)) throw new Error(`Position ${p.id} already exists. Choose “Update by ID” instead of Append.`);
      s.positions.push(...structuredClone(result.positions));
    } else if (mode === 'update') {
      const byId = new Map(s.positions.map(p => [p.id, p])), supplied = new Set(result.columns || Object.keys(ALIASES));
      result.positions.forEach(p => {
        const next = structuredClone(p), old = byId.get(p.id);
        if (old) {
          for (const key of ['title', 'type', 'group', 'fte', 'status', 'startDate', 'endDate', 'location', 'costCenter', 'jobFamily', 'secondaryManagerId', 'sortOrder', 'stacked']) if (!supplied.has(key)) {
            if (key === 'stacked' && old.stacked !== true && old.stacked !== false) { delete next.stacked; continue; }
            next[key] = old[key];
          }
          if (!supplied.has('managerId') && !supplied.has('managerName')) next.managerId = old.managerId;
          if (!supplied.has('personId') && !supplied.has('name') && !supplied.has('hiringState')) { next.personId = old.personId; next.hiringState = old.hiringState; }
        }
        byId.set(next.id, next);
      });
      s.positions = [...byId.values()];
    } else throw new Error('Unknown import mode.');
    Object.assign(s, validateScenarioData(s, extraTypes));
    return s;
  }
  // Pre-Specialist chips. A saved “every type on” view from that era should gain Specialist.
  const LEGACY_ROLE_TYPES = ['Head', 'Team Leader', 'Engineer', 'Graduate', 'Intern'];
  function sanitizeChipFilters(saved, all, previousAll = all) {
    if (!Array.isArray(saved)) return all.slice();
    const picked = new Set(saved.filter(x => all.includes(x)));
    if (previousAll.every(x => saved.includes(x))) {
      for (const x of all) if (!previousAll.includes(x)) picked.add(x);
    }
    return all.filter(x => picked.has(x));
  }
  function emptyWorkspace(today, stamp = new Date().toISOString()) {
    return validatePlanning({
      version: 2,
      activeScenarioId: 'current',
      positionLevels: [],
      scenarios: [{
        id: 'current', name: 'Current', description: '', createdAt: stamp, updatedAt: stamp, baseScenarioId: '', baseSnapshot: null,
        employees: [],
        positions: [{ id: 'POS-001', managerId: '', secondaryManagerId: '', title: 'Head of organization', type: 'Head', group: 'Leadership', fte: 1, status: 'Approved', hiringState: 'Vacant', personId: '', startDate: today, endDate: '', location: '', costCenter: '', jobFamily: '' }]
      }]
    });
  }

  function compareSiblings(a, b) {
    const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
    const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
    if (ao !== bo) return ao - bo;
    const head = (a.type === 'Head' ? -1 : 0) - (b.type === 'Head' ? -1 : 0);
    if (head) return head;
    return String(a.name || a.title || '').localeCompare(String(b.name || b.title || '')) || String(a.title || '').localeCompare(String(b.title || '')) || String(a.id).localeCompare(String(b.id));
  }
  function defaultStacked(node) {
    return Array.isArray(node.children) && node.children.length > 0 && node.children.every(c => !c.children || !c.children.length);
  }
  function nodeStacked(node) {
    if (node.stacked === true) return true;
    if (node.stacked === false) return false;
    return defaultStacked(node);
  }
  function wrapText(text, maxWidth, charWidth = 7) {
    const raw = String(text || '').trim();
    if (!raw) return [''];
    const maxChars = Math.max(4, Math.floor(maxWidth / charWidth));
    const words = raw.split(/\s+/);
    const lines = [];
    let current = '';
    const flush = () => { if (current) { lines.push(current); current = ''; } };
    for (const word of words) {
      if (word.length > maxChars) {
        flush();
        for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
        continue;
      }
      const next = current ? current + ' ' + word : word;
      if (next.length > maxChars && current) { flush(); current = word; }
      else current = next;
    }
    flush();
    return lines.length ? lines : [''];
  }
  function showsCumulativeCount(type) {
    return type === 'Head' || type === 'Team Leader';
  }
  function personLabel(n) {
    return n.personName || n.name || (n.hiringState === 'Recruiting' ? 'Recruiting' : 'Vacant position');
  }
  function sanitizeCardDisplay(input) {
    const d = input && typeof input === 'object' ? input : {};
    const bool = (k, def) => d[k] === undefined ? def : d[k] === true;
    let groupGap = Number(d.groupGap);
    if (!Number.isFinite(groupGap)) groupGap = CARD_DISPLAY_DEFAULTS.groupGap;
    groupGap = Math.max(16, Math.min(96, Math.round(groupGap)));
    return {
      fte: bool('fte', true),
      site: bool('site', true),
      group: bool('group', true),
      type: bool('type', true),
      approval: bool('approval', true),
      hiring: bool('hiring', true),
      cumulative: d.cumulative === true,
      groupGap,
      chartDots: d.chartDots !== false
    };
  }
  function cardMetrics(n, display) {
    const d = sanitizeCardDisplay(display);
    const nameLines = wrapText(personLabel(n), 186, 7.1).slice(0, 4);
    const titleLines = wrapText(n.title || '', 224, 5.7).slice(0, 3);
    const groupLines = d.group ? wrapText(n.group || 'No group', 224, 5.4).slice(0, 2) : [];
    const siteLines = d.site ? wrapText(n.location || 'No site', 224, 5.4).slice(0, 2) : [];
    let h = 14 + Math.max(nameLines.length * 15, 30);
    h += 4 + titleLines.length * 13;
    h += groupLines.length * 13;
    h += siteLines.length * 13;
    if (d.type || d.approval) h += 20;
    if (d.hiring || d.fte || (d.cumulative && showsCumulativeCount(n.type))) h += 16;
    h += 12;
    return { width: CARD_W, height: Math.max(96, Math.min(280, Math.round(h))), nameLines, titleLines, groupLines, siteLines };
  }
  function subtreePeopleCount(positions, id) {
    const children = new Map();
    for (const p of positions) {
      const mid = p.managerId || '';
      if (!children.has(mid)) children.set(mid, []);
      children.get(mid).push(p.id);
    }
    let count = 0;
    const stack = [id], seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const p = positions.find(x => x.id === cur);
      if (p && p.hiringState === 'Filled') count++;
      for (const c of children.get(cur) || []) stack.push(c);
    }
    return count;
  }
  function reorderSiblings(positions, id, delta) {
    const pos = positions.find(p => p.id === id);
    if (!pos || !delta) return positions;
    const managerId = pos.managerId || '';
    const siblings = positions.filter(p => (p.managerId || '') === managerId).sort(compareSiblings);
    const i = siblings.findIndex(p => p.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= siblings.length) return positions;
    const ordered = siblings.slice();
    const [moved] = ordered.splice(i, 1);
    ordered.splice(j, 0, moved);
    const rank = new Map(ordered.map((p, idx) => [p.id, idx]));
    return positions.map(p => rank.has(p.id) ? { ...p, sortOrder: rank.get(p.id) } : p);
  }
  function siblingIndex(positions, id) {
    const pos = positions.find(p => p.id === id);
    if (!pos) return { index: -1, count: 0 };
    const siblings = positions.filter(p => (p.managerId || '') === (pos.managerId || '')).sort(compareSiblings);
    return { index: siblings.findIndex(p => p.id === id), count: siblings.length };
  }
  function applyCardSizes(nodes, display) {
    for (const n of nodes) {
      const m = cardMetrics(n, display);
      n._cardW = m.width;
      n._cardH = m.height;
      n._lines = m;
      if (n.children?.length) applyCardSizes(n.children, display);
    }
    return nodes;
  }
  function layoutOrgChart(nodes, opts = {}) {
    const groupGap = sanitizeCardDisplay(opts).groupGap;
    const stackGap = opts.stackGap ?? 14;
    const levelGap = opts.levelGap ?? 48;
    const trunkPad = 18;
    const forest = nodes || [];
    const r = v => Math.round(v * 100) / 100;

    function size(n) {
      n._w = n._cardW || CARD_W;
      n._h = n._cardH || 124;
      n._stacked = nodeStacked(n);
      if (!n.children?.length) {
        n._boxW = n._w;
        n._boxH = n._h;
        return;
      }
      n.children.forEach(size);
      if (n._stacked) {
        const kidsH = n.children.reduce((s, c) => s + c._boxH, 0) + stackGap * Math.max(0, n.children.length - 1);
        n._boxW = Math.max(n._w, ...n.children.map(c => c._boxW));
        n._boxH = n._h + levelGap + kidsH;
      } else {
        const kidsW = n.children.reduce((s, c) => s + c._boxW, 0) + groupGap * (n.children.length - 1);
        n._boxW = Math.max(n._w, kidsW);
        n._boxH = n._h + levelGap + Math.max(...n.children.map(c => c._boxH));
      }
    }
    function place(n, x, y) {
      if (!n.children?.length) {
        n._x = x;
        n._y = y;
        return;
      }
      if (n._stacked) {
        n._x = x;
        n._y = y;
        let cy = y + n._h + levelGap;
        for (const c of n.children) {
          place(c, x, cy);
          cy += c._boxH + stackGap;
        }
      } else {
        n._x = x + (n._boxW - n._w) / 2;
        n._y = y;
        const kidsW = n.children.reduce((s, c) => s + c._boxW, 0) + groupGap * (n.children.length - 1);
        let cx = x + Math.max(0, (n._boxW - kidsW) / 2);
        const cy = y + n._h + levelGap;
        for (const c of n.children) {
          place(c, cx, cy);
          cx += c._boxW + groupGap;
        }
      }
    }

    let cursor = 0;
    forest.forEach(n => {
      size(n);
      place(n, cursor, 0);
      cursor += n._boxW + groupGap;
    });
    const all = [];
    (function flatten(list) { for (const n of list) { all.push(n); if (n.children?.length) flatten(n.children); } })(forest);
    if (!all.length) return { all, width: 0, height: 0, cardW: CARD_W, connectors: [], groupGap };
    let minX = Math.min(...all.map(n => n._x));
    for (const n of all) if (n._stacked && n.children?.length) minX = Math.min(minX, n._x - trunkPad);
    all.forEach(n => { n._x -= minX; });
    const connectors = [];
    for (const n of all) {
      if (!n.children?.length) continue;
      const mx = r(n._x + n._w / 2);
      const bottomY = r(n._y + n._h);
      if (n._stacked) {
        const last = n.children[n.children.length - 1];
        const trunkX = r(n._x - trunkPad);
        const dropY = r(bottomY + Math.min(10, levelGap / 2));
        connectors.push({ kind: 'stack-lead', fromId: n.id, d: `M${mx},${bottomY} V${dropY} H${trunkX}` });
        connectors.push({ kind: 'stack-trunk', fromId: n.id, d: `M${trunkX},${dropY} V${r(last._y + last._h / 2)}` });
        for (const c of n.children) {
          connectors.push({ kind: 'stack-spur', fromId: n.id, toId: c.id, d: `M${trunkX},${r(c._y + c._h / 2)} H${r(c._x)}` });
        }
      } else {
        const busY = r(bottomY + levelGap / 2);
        connectors.push({ kind: 'tree-drop', fromId: n.id, d: `M${mx},${bottomY} V${busY}` });
        const xs = n.children.map(c => r(c._x + c._w / 2));
        if (xs.length > 1) connectors.push({ kind: 'tree-bus', fromId: n.id, d: `M${Math.min(...xs)},${busY} H${Math.max(...xs)}` });
        for (const c of n.children) {
          const cx = r(c._x + c._w / 2);
          connectors.push({ kind: 'tree-down', fromId: n.id, toId: c.id, d: `M${cx},${busY} V${r(c._y)}` });
        }
      }
    }
    const extentX = all.flatMap(n => n._stacked && n.children?.length ? [n._x - trunkPad, n._x + n._w] : [n._x, n._x + n._w]);
    const width = Math.max(...extentX) - Math.min(...extentX);
    const height = Math.max(...all.map(n => n._y + n._h));
    return { all, width, height, cardW: CARD_W, connectors, groupGap };
  }

  return {
    ROLE_TYPES, STATUSES, HIRING_STATES, LEGACY_ROLE_TYPES, POSITION_FIELDS, DIFF_FIELDS, POSITION_CSV_COLUMNS, ALIASES,
    CARD_DISPLAY_DEFAULTS, CARD_W,
    esc, slug, makeId, isISODate, cleanString, fmtDate, fteText, csvEscape, csvRows, positionCSVValues,
    detectDelimiter, parseCSV, normHeader, headerMap, normalizeType, normalizeStatus, normalizeDate,
    validatePeopleData, validateScenarioData, validatePlanning, migrateLegacy, projection, totals,
    scenarioChanges, fieldValue, prepareImport, makeImportScenario, emptyWorkspace, sanitizeChipFilters,
    wouldCreateCycle, validPersonPhoto, sanitizePositionLevels, positionTypes, compareSiblings,
    defaultStacked, nodeStacked, wrapText, showsCumulativeCount, personLabel, sanitizeCardDisplay,
    cardMetrics, subtreePeopleCount, reorderSiblings, siblingIndex, applyCardSizes, layoutOrgChart
  };
});
