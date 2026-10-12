#!/usr/bin/env node
'use strict';
/** orgflow — command line for the OrgFlow enterprise host: plan your week, request vacation, book desks,
 *  handle approvals and read the organization chart. Made for people and for coding agents (Claude Code,
 *  Codex): every command prints readable text, or the raw API response with --json.
 *  It authenticates with a personal token and can do exactly what that member can do in the browser. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const W = require('../js/workplace-core');
const VERSION = require('../package.json').version;

const HELP = `orgflow ${VERSION} — OrgFlow from the command line

Setup
  login --url URL [--token-stdin]   Check and save the host and your personal token
  logout                             Forget the saved token
  whoami                             Who the token acts as: desk, approver, roles

My week
  week [DATE] [--days N]             Plans, vacation and bookings for the week containing DATE
  plan DATES LOCATION                Set where you work. DATES: 2026-10-14, 2026-10-14..2026-10-16,
                                     a comma list, today or tomorrow. LOCATION: office id or name,
                                     remote, none (no plan for that day) or clear (back to the pattern)
  pattern [mon=LOC tue=LOC ...]      Show, or replace, the weekly pattern (LOC: office, remote or -)
  offices                            Offices and their time zones

Desks
  desks OFFICE DATE [--available]    Desk states on a date
  book OFFICE DATE [DESK] [--for EMPLOYEE_ID]
                                     Reserve a desk by label or id (first available if omitted;
                                     --for is for workplace administrators)
  bookings                           Your upcoming reservations
  unbook RESERVATION_ID [--reason TEXT]

Vacation
  vacation [list]                    Your requests and their status
  vacation request START END [--note TEXT]
  vacation change ID START END       New dates (approved vacation needs a fresh decision)
  vacation cancel ID                 Withdraw a pending request or ask to cancel approved vacation
  team [--from DATE] [--to DATE]     Team absence calendar

Approvals (managers)
  approvals                          Requests waiting for you and your team's absences
  approve ID [--note TEXT]
  reject ID [--note TEXT]
  not-mine ID [--note TEXT]          Hand a misrouted request back to the administrators

Other
  conflicts                          Seating conflicts on your desk (all, for workplace admins)
  notifications [--read-all]
  report KIND [NOTE]                 Report wrong details: approver, desk, identity or role

Organization chart (token with the read scope; --scenario ID reads a scenario instead of Current)
  org summary | org status | org search QUERY | org person ID | org span POSITION_ID
  org vacancies | org dotted-lines | org diff [FROM] TO

Coding agents
  mcp                                Run the organization-chart MCP server over stdio with the saved
                                     login (claude mcp add orgflow -- orgflow mcp; read scope)
  skills install [--claude] [--codex] [--dir DIR]
                                     Copy the OrgFlow skills to ~/.claude/skills (Claude Code) and
                                     ~/.agents/skills (Codex) so every project can use them
  skills list                        The skills this version ships

Options: --json  --url URL  --token TOKEN (prefer ORGFLOW_API_TOKEN or login)  --help  --version
Environment: ORGFLOW_API_URL, ORGFLOW_API_TOKEN, ORGFLOW_CONFIG (config file path)
Create a token in OrgFlow under "CLI & agents" (workplace.html#agents).`;

class UsageError extends Error {}
const usage = message => { throw new UsageError(message); };

function parse(argv) {
  const args = [], opts = {};
  // Unknown options are refused rather than guessed at: a misspelt option must never swallow a date.
  const flags = new Set(['json', 'help', 'version', 'available', 'token-stdin', 'read-all', 'insecure', 'claude', 'codex']);
  const values = new Set(['url', 'token', 'days', 'for', 'reason', 'note', 'from', 'to', 'dir', 'scenario']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.push(a); continue; }
    const [key, inline] = a.slice(2).split(/=(.*)/s);
    if (flags.has(key)) { if (inline !== undefined) usage(`--${key} takes no value.`); opts[key] = true; }
    else if (!values.has(key)) usage(`Unknown option --${key}. Run orgflow --help.`);
    else if (inline !== undefined) opts[key] = inline;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) opts[key] = argv[++i];
    else usage(`--${key} needs a value.`);
  }
  return { args, opts };
}

// Options each command accepts besides the global ones, so `vacation request --from A B` fails instead of booking B alone.
const GLOBAL_OPTIONS = ['json', 'help', 'version', 'url', 'token', 'insecure'];
const COMMAND_OPTIONS = {
  login: ['token-stdin'], logout: [], whoami: [], offices: [], week: ['days'], plan: [], pattern: [], desks: ['available'], book: ['for'], bookings: [], unbook: ['reason'],
  vacation: ['note'], team: ['from', 'to'], approvals: [], approve: ['note'], reject: ['note'], 'not-mine': ['note'], conflicts: [], notifications: ['read-all'],
  report: [], org: ['scenario'], mcp: [], skills: ['claude', 'codex', 'dir']
};

// ---- Configuration --------------------------------------------------------------------------------
function configPath(env = process.env) {
  if (env.ORGFLOW_CONFIG) return env.ORGFLOW_CONFIG;
  const base = process.platform === 'win32' ? (env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')) : (env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'orgflow', 'config.json');
}
function readConfig(env) { try { return JSON.parse(fs.readFileSync(configPath(env), 'utf8')); } catch { return {}; } }
function writeConfig(data, env) {
  const file = configPath(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* not supported on every file system */ }
  return file;
}
function checkUrl(raw, insecure) {
  let u;
  try { u = new URL(raw); } catch { usage(`Not a URL: ${raw}`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (local || insecure))) usage('Use an https:// address (plain http is only allowed for localhost).');
  return u.origin;
}

// ---- HTTP --------------------------------------------------------------------------------------------
function client({ url, token }) {
  return async function call(route, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(url + route, { method, headers: { accept: 'application/json', authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) { throw Object.assign(new Error(`Cannot reach ${url}: ${error.cause?.code || error.message}`), { exit: 1 }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = res.status === 401 ? ' Check ORGFLOW_API_TOKEN or run `orgflow login`.' : res.status === 403 && /scope/i.test(data.error || '') ? ' Create a token with the needed scope under "CLI & agents".' : '';
      throw Object.assign(new Error((data.error || `HTTP ${res.status}`) + hint), { status: res.status, code: data.code, data });
    }
    return data;
  };
}

// ---- Helpers -----------------------------------------------------------------------------------------
const WEEKDAYS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
function day(value, today) {
  if (value === 'today') return today;
  if (value === 'tomorrow') return W.addDays(today, 1);
  if (/^[+-]\d+$/.test(value || '')) return W.addDays(today, Number(value));
  if (!W.isDate(value)) usage(`Not a date: ${value ?? '(missing)'} — use YYYY-MM-DD, today, tomorrow or +N.`);
  return value;
}
function dates(spec, today) {
  if (!spec) usage('Give the dates.');
  return spec.split(',').flatMap(part => {
    const [a, b] = part.split('..');
    return b === undefined ? [day(a, today)] : W.dateRange(day(a, today), day(b, today));
  });
}
async function officeId(call, value) {
  const { offices } = await call('/api/workplace/offices');
  const want = String(value || '').toLowerCase();
  // Exact id, exact name, or a name prefix that matches exactly one office.
  const prefix = want ? offices.filter(o => o.name.toLowerCase().startsWith(want)) : [];
  const found = offices.find(o => o.id.toLowerCase() === want) || offices.find(o => o.name.toLowerCase() === want) || (prefix.length === 1 ? prefix[0] : null);
  if (!found) usage(`Unknown office "${value}". Offices: ${offices.map(o => `${o.id} (${o.name})`).join(', ') || 'none set up'}.`);
  return found;
}
async function location(call, value) {
  if (['remote', 'none', 'clear'].includes(value)) return value;
  if (/^office:/.test(value || '')) return value;
  return 'office:' + (await officeId(call, value)).id;
}
const label = (loc, offices) => loc === 'remote' ? 'Remote' : loc === 'vacation' ? 'On vacation' : loc?.startsWith('office:') ? (offices.find(o => o.id === loc.slice(7))?.name || loc.slice(7)) : 'No plan';
const range = (a, b) => (a === b ? a : `${a} – ${b}`);
const table = rows => {
  if (!rows.length) return '';
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i] ?? '').length)));
  return rows.map(r => r.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ').trimEnd()).join('\n');
};
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---- Agent skills ------------------------------------------------------------------------------------
// The repository keeps identical copies in .claude/skills (Claude Code) and .agents/skills (Codex);
// orgflow-develop is about working on OrgFlow itself and stays in the repository.
const SKILLS_DIR = path.join(__dirname, '..', '.claude', 'skills');
const USER_SKILLS = ['orgflow-workplace', 'orgflow-org'];
function skills([sub = 'list'], opts, env, stdout) {
  const describe = name => (fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8').match(/^description:\s*(.+)$/m) || [])[1] || '';
  if (sub === 'list') return stdout(USER_SKILLS.map(name => `${name}  ${describe(name)}`).join('\n'));
  if (sub !== 'install') usage('skills commands: list, install.');
  const home = env.HOME || env.USERPROFILE || os.homedir();
  const targets = opts.dir ? [opts.dir] : [...(opts.claude || !opts.codex ? [path.join(home, '.claude', 'skills')] : []), ...(opts.codex || !opts.claude ? [path.join(home, '.agents', 'skills')] : [])];
  for (const target of targets) for (const name of USER_SKILLS) fs.cpSync(path.join(SKILLS_DIR, name), path.join(target, name), { recursive: true });
  return stdout(`Installed ${USER_SKILLS.join(', ')} into ${targets.join(' and ')}. Restart Claude Code or Codex to pick them up.`);
}

// ---- Commands ----------------------------------------------------------------------------------------
async function run(argv, { env = process.env, stdout = s => process.stdout.write(s + '\n'), stdin = () => fs.readFileSync(0, 'utf8') } = {}) {
  const { args, opts } = parse(argv);
  const [cmd, ...rest] = args;
  if (opts.version) return stdout(VERSION);
  if (opts.help || !cmd || cmd === 'help') return stdout(HELP);
  const allowed = COMMAND_OPTIONS[cmd];
  if (allowed) for (const key of Object.keys(opts)) if (!GLOBAL_OPTIONS.includes(key) && !allowed.includes(key)) usage(`${cmd} does not take --${key}. Run orgflow --help.`);
  const saved = readConfig(env);
  const out = (data, text) => stdout(opts.json ? JSON.stringify(data, null, 2) : typeof text === 'function' ? text(data) : text);

  if (cmd === 'skills') return skills(rest, opts, env, stdout);
  if (cmd === 'logout') {
    if (saved.token) writeConfig({ ...saved, token: undefined }, env);
    return stdout('Signed out: the saved token was removed. Revoke it in OrgFlow under "CLI & agents" if it may have leaked.');
  }
  if (cmd === 'login') {
    const url = checkUrl(opts.url || env.ORGFLOW_API_URL || saved.url || usage('login needs --url.'), opts.insecure);
    const token = (opts['token-stdin'] ? stdin() : opts.token || env.ORGFLOW_API_TOKEN || '').trim();
    if (!token) usage('Pipe the token in with --token-stdin (or set ORGFLOW_API_TOKEN).');
    const session = await client({ url, token })('/api/session');
    const file = writeConfig({ url, token }, env);
    return out(session, `Signed in to ${session.tenant?.name || url} as ${session.user?.email} (${session.role}). Saved to ${file}.`);
  }

  const url = checkUrl(opts.url || env.ORGFLOW_API_URL || saved.url || usage('No OrgFlow host: run `orgflow login --url https://… --token-stdin` or set ORGFLOW_API_URL.'), opts.insecure);
  const token = opts.token || env.ORGFLOW_API_TOKEN || saved.token || usage('No token: run `orgflow login` or set ORGFLOW_API_TOKEN. Create one in OrgFlow under "CLI & agents".');
  if (cmd === 'mcp') {
    // Serve the organization-chart MCP tools over stdio with the saved login (Claude Code: `claude mcp add orgflow -- orgflow mcp`).
    Object.assign(process.env, { ORGFLOW_API_URL: url, ORGFLOW_API_TOKEN: token });
    require('../server/mcp-stdio.js');
    return;
  }
  const call = client({ url, token });
  let meCache = null;
  const me = async () => (meCache ||= await call('/api/workplace/me'));

  switch (cmd) {
    case 'whoami': {
      const [session, info] = await Promise.all([call('/api/session'), call('/api/workplace/me').catch(e => ({ error: e.message }))]);
      return out({ session, me: info }, () => [
        `${session.user?.name || session.user?.email} <${session.user?.email}> · ${session.role}${info.workplaceAdmin ? ' · workplace admin' : ''} · ${session.tenant?.name || ''}`,
        info.error ? `Workplace: ${info.error}` : info.linked ? `Employee ${info.employee.name} (${info.employee.id}) · today ${info.today} (${info.timezone})` : 'Not linked to an employee record yet — ask an OrgFlow administrator.',
        info.desk ? `Desk ${info.desk.label} · ${info.desk.roomName}` : '', info.approver ? `Approver ${info.approver.name} (${info.approver.source === 'correction' ? 'set by an administrator' : 'from the org chart'})` : info.linked ? 'No approver: requests go to the administrators for routing.' : '',
        info.isManager ? 'You approve vacation for your reports.' : ''
      ].filter(Boolean).join('\n'));
    }
    case 'offices': {
      const data = await call('/api/workplace/offices');
      return out(data, d => table([['ID', 'OFFICE', 'TIME ZONE'], ...d.offices.map(o => [o.id, o.name, o.timezone])]) || 'No offices are set up yet.');
    }
    case 'week': {
      const info = await me(), start = W.mondayOf(day(rest[0] || 'today', info.today));
      const data = await call(`/api/workplace/week?start=${start}&days=${Number(opts.days) || 7}`);
      return out(data, d => [`Week of ${start} (today ${d.today})`, table(d.days.map(x => [
        `${WD[x.weekday - 1]} ${x.date}${x.isToday ? '*' : ''}`, label(x.location, info.offices) + (x.source === 'pattern' ? ' (pattern)' : x.source === 'none' ? ' — desk protected' : ''),
        x.vacation && x.location !== 'vacation' ? `vacation ${x.vacation.status}` : '', x.reservation ? `desk ${x.reservation.deskLabel} · ${x.reservation.officeName}/${x.reservation.roomName} [${x.reservation.id}]` : '',
        x.deskLent ? 'your desk is lent' : '', x.attention.map(a => '! ' + a.message).join(' ')
      ]))].join('\n'));
    }
    case 'plan': {
      const info = await me(), ds = dates(rest[0], info.today), loc = await location(call, rest[1] || usage('plan needs a location: office, remote, none or clear.'));
      const data = await call('/api/workplace/days', { method: 'PUT', body: { dates: ds, location: loc } });
      return out(data, d => `Set ${ds.length} day(s) to ${loc === 'clear' ? 'the weekly pattern' : label(loc === 'none' ? 'none' : loc, info.offices)}.${d.conflicts.length ? `\n! A visitor holds your desk on ${d.conflicts.map(c => c.date).join(', ')}: run \`orgflow conflicts\`.` : ''}`);
    }
    case 'pattern': {
      const info = await me();
      if (!rest.length) return out({ pattern: info.pattern }, () => table(WD.map((n, i) => [n, label(info.pattern?.[i + 1] || 'none', info.offices)])));
      const weekdays = {};
      for (const pair of rest) {
        const [k, v] = pair.split('=');
        const n = WEEKDAYS[String(k).slice(0, 3).toLowerCase()] || usage(`Use mon=… tue=… (got ${pair}).`);
        weekdays[n] = !v || v === '-' || v === 'none' ? '' : await location(call, v);
      }
      const data = await call('/api/workplace/pattern', { method: 'PUT', body: { weekdays: { ...info.pattern, ...weekdays } } });
      return out(data, d => 'Weekly pattern saved:\n' + table(WD.map((n, i) => [n, label(d.pattern[i + 1] || 'none', info.offices)])));
    }
    case 'desks': {
      const info = await me(), office = await officeId(call, rest[0] || usage('desks needs an office.')), d0 = day(rest[1] || 'today', info.today);
      const data = await call(`/api/workplace/offices/${encodeURIComponent(office.id)}/map?date=${d0}&plans=0`);
      const rows = data.rooms.flatMap(r => r.desks.filter(x => !opts.available || (x.state === 'available' && !x.mine)).map(x => [x.label || x.id, r.name, W.STATE_LABELS[x.state] + (x.mine ? ' (your desk)' : '') + (x.reservedByMe ? ' (yours)' : ''), x.equipment, x.id]));
      return out(data, () => `${office.name} on ${d0} (today there: ${data.today})\n` + (table([['DESK', 'ROOM', 'STATE', 'EQUIPMENT', 'ID'], ...rows]) || 'No desks.'));
    }
    case 'book': {
      const info = await me(), office = await officeId(call, rest[0] || usage('book needs an office.')), d0 = day(rest[1] || usage('book needs a date.'), info.today);
      const map = await call(`/api/workplace/offices/${encodeURIComponent(office.id)}/map?date=${d0}&plans=0`);
      const desks = map.rooms.flatMap(r => r.desks.map(x => ({ ...x, room: r.name })));
      const wanted = rest[2];
      // Labels need not be unique across rooms; an ambiguous label must name the desk id instead.
      const matches = wanted ? (desks.filter(x => x.id === wanted).length ? desks.filter(x => x.id === wanted) : desks.filter(x => (x.label || '').toLowerCase() === wanted.toLowerCase())) : [];
      if (matches.length > 1) usage(`Several desks are labelled "${wanted}" in ${office.name}: ${matches.map(x => `${x.id} (${x.room})`).join(', ')}. Name the desk id.`);
      // Booking for someone else: skip that person's own desk, not the administrator's.
      const ownDesk = x => (opts.for ? x.ownerId === opts.for : x.mine);
      const desk = wanted ? matches[0] : desks.find(x => x.state === 'available' && !ownDesk(x));
      if (!desk) usage(wanted ? `No desk "${wanted}" in ${office.name}.` : `No desk is available in ${office.name} on ${d0}.`);
      const data = await call('/api/workplace/reservations', { method: 'POST', body: { deskId: desk.id, date: d0, ...(opts.for ? { employeeId: opts.for } : {}) } });
      return out(data, d => `Reserved desk ${d.deskLabel} · ${d.roomName} · ${d.officeName} on ${d.date}${d.onBehalf ? ' for ' + d.employeeName : ''} (reservation ${d.id}). Whole day; it stays yours even if the owner's plans change.`);
    }
    case 'bookings': {
      const data = await call('/api/workplace/reservations');
      return out(data, d => table([['DATE', 'DESK', 'OFFICE / ROOM', 'STATUS', 'ID'], ...d.reservations.map(r => [r.date, r.deskLabel, `${r.officeName} / ${r.roomName}`, r.status + (r.cancelReason ? ` (${r.cancelReason})` : ''), r.id])]) || 'No upcoming reservations.');
    }
    case 'unbook': {
      const data = await call(`/api/workplace/reservations/${encodeURIComponent(rest[0] || usage('unbook needs a reservation id.'))}/cancel`, { method: 'POST', body: { reason: opts.reason || '' } });
      return out(data, d => `Cancelled. Confirm where you will work on ${d.confirmLocation.date} (now: ${d.confirmLocation.current}): orgflow plan ${d.confirmLocation.date} <office|remote|none>`);
    }
    case 'vacation': {
      const [sub = 'list', a, b, c] = rest, info = await me();
      if (sub === 'list') {
        const data = await call('/api/workplace/vacations');
        return out(data, d => table([['DATES', 'DAYS', 'KIND', 'STATUS', 'APPROVER', 'ID'], ...d.requests.map(r => [range(r.start, r.end), r.days, r.kind, r.status + (r.routing === 'unassigned' && r.status === 'pending' ? ' (being routed)' : ''), r.approverName || '—', r.id])]) || 'No vacation requests.');
      }
      if (sub === 'request') {
        const data = await call('/api/workplace/vacations', { method: 'POST', body: { start: day(a, info.today), end: day(b || a, info.today), note: opts.note || '' } });
        return out(data, d => `Requested ${range(d.start, d.end)} (${d.days} day${d.days === 1 ? '' : 's'}) — ${d.approverName ? 'waiting for ' + d.approverName : 'an administrator will route it to your approver'}. Id ${d.id}.`);
      }
      if (sub === 'change') {
        const data = await call(`/api/workplace/vacations/${encodeURIComponent(a || usage('vacation change needs an id.'))}`, { method: 'PATCH', body: { start: day(b, info.today), end: day(c || b, info.today) } });
        return out(data, d => d.kind === 'change' ? `Change to ${range(d.start, d.end)} sent for approval; the approved dates stay in force until then. Id ${d.id}.` : `New dates ${range(d.start, d.end)} sent to your approver.`);
      }
      if (sub === 'cancel') {
        const data = await call(`/api/workplace/vacations/${encodeURIComponent(a || usage('vacation cancel needs an id.'))}/cancel`, { method: 'POST', body: {} });
        return out(data, d => d.kind === 'cancel' ? `Cancellation sent for approval; the vacation stays approved until then. Id ${d.id}.` : 'Request withdrawn.');
      }
      return usage(`Unknown vacation command: ${sub}.`);
    }
    case 'team': {
      const info = await me(), from = day(opts.from || W.mondayOf(info.today), info.today), to = day(opts.to || W.addDays(from, 27), info.today);
      const data = await call(`/api/workplace/team?from=${from}&to=${to}`);
      return out(data, d => `Absences ${from} – ${to}\n` + (table(d.absences.map(x => [d.members.find(m => m.id === x.employeeId)?.name || x.employeeId, range(x.start, x.end), x.status])) || 'No absences.'));
    }
    case 'approvals': {
      const data = await call('/api/workplace/approvals');
      return out(data, d => ['Waiting for your decision:', table(d.pending.map(r => [r.id, r.employeeName, r.kind, range(r.start, r.end), `${r.days}d`, r.note ? `note: ${r.note}` : ''])) || '  nothing',
        '', 'Team absences:', table(d.absences.map(r => [r.employeeName, range(r.start, r.end), r.status])) || '  none'].join('\n'));
    }
    case 'approve': case 'reject': {
      const data = await call(`/api/workplace/vacations/${encodeURIComponent(rest[0] || usage(`${cmd} needs a request id.`))}/decision`, { method: 'POST', body: { decision: cmd, note: opts.note || '' } });
      return out(data, d => `${cmd === 'approve' ? 'Approved' : 'Rejected'} ${d.employeeName}'s ${d.kind === 'new' ? 'request' : d.kind + ' request'} for ${range(d.start, d.end)}. They are notified.`);
    }
    case 'not-mine': {
      const data = await call(`/api/workplace/vacations/${encodeURIComponent(rest[0] || usage('not-mine needs a request id.'))}/return`, { method: 'POST', body: { note: opts.note || '' } });
      return out(data, () => 'Handed back. An OrgFlow administrator will route it to the right approver.');
    }
    case 'conflicts': {
      const data = await call('/api/workplace/conflicts');
      return out(data, d => table(d.conflicts.map(c => [c.date, `desk ${c.deskLabel}`, `${c.officeName}/${c.roomName}`, c.status, c.id])) || 'No seating conflicts.');
    }
    case 'notifications': {
      const data = opts['read-all'] ? await call('/api/workplace/notifications/read', { method: 'POST', body: { ids: 'all' } }) : await call('/api/workplace/notifications');
      return out(data, d => `${d.unread} unread\n` + (table(d.items.map(n => [n.read ? ' ' : '•', n.createdAt.slice(0, 16).replace('T', ' '), n.title, `${url}/workplace.html#${n.route}`])) || 'No notifications.'));
    }
    case 'report': {
      const data = await call('/api/workplace/reports', { method: 'POST', body: { kind: rest[0] || usage('report needs a kind: approver, desk, identity or role.'), note: rest.slice(1).join(' ') } });
      return out(data, d => `Reported "${d.label}". The OrgFlow administrators are notified.`);
    }
    case 'org': {
      const [sub, ...q] = rest;
      const routes = { summary: '/api/org/summary', status: '/api/org/status', vacancies: '/api/org/vacancies', 'dotted-lines': '/api/org/dotted-lines', search: '/api/org/positions?q=' + encodeURIComponent(q.join(' ')),
        person: '/api/org/people/' + encodeURIComponent(q[0] || ''), span: '/api/org/span/' + encodeURIComponent(q[0] || ''),
        diff: `/api/org/diff?from=${encodeURIComponent(q[1] ? q[0] : 'current')}&to=${encodeURIComponent(q[1] || q[0] || '')}` };
      if (!routes[sub] || (['person', 'span', 'diff'].includes(sub) && !q[0])) usage('org commands: summary, status, search QUERY, person ID, span POSITION_ID, vacancies, dotted-lines, diff [FROM] TO.');
      const scenario = opts.scenario && sub !== 'diff' && sub !== 'status' ? (routes[sub].includes('?') ? '&' : '?') + 'scenario=' + encodeURIComponent(opts.scenario) : '';
      const data = await call(routes[sub] + scenario);
      return out(data, d => sub === 'search' ? table(d.positions.map(p => [p.id, p.title, p.personName || p.hiringState || '', p.group || ''])) || 'No matches.' : JSON.stringify(d, null, 2));
    }
    default: return usage(`Unknown command "${cmd}". Run orgflow --help.`);
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).catch(error => {
    if (error instanceof UsageError) { process.stderr.write(`orgflow: ${error.message}\n`); process.exitCode = 2; return; }
    process.stderr.write(`orgflow: ${error.message}${error.code ? ` [${error.code}]` : ''}\n`);
    process.exitCode = 1;
  });
}
module.exports = { run, parse, configPath, HELP };
