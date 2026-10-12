'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createApp } = require('../server/lib/app');
const cli = require('../bin/orgflow.cjs');

const NOW = new Date('2026-10-12T09:00:00Z'); // Monday
const BIN = path.join(__dirname, '../bin/orgflow.cjs');

function workspace() {
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));
  doc.planning.seating = { rooms: [
    { id: 'room-zrh', name: 'Zurich floor 2', floor: 'HQ', outline: [[0, 0], [1200, 0], [1200, 800], [0, 800]], deskSize: { w: 160, h: 80 }, desks: [
      { id: 'desk-z1', label: 'Z1', x: 200, y: 200, w: 160, h: 80, rotation: 0, positionId: 'POS-008', hotDesk: false },
      { id: 'desk-z3', label: 'Z3', x: 600, y: 200, w: 160, h: 80, rotation: 0, positionId: '', hotDesk: false }
    ] }
  ] };
  return doc;
}

async function setup(t) {
  const app = createApp({ memory: true, now: () => NOW, env: { AUTH_MODE: 'dev', SESSION_SECRET: 'cli-test' } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => new Promise(r => app.server.close(r)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  async function call(cookie, route, body, method = body ? 'POST' : 'GET') {
    const res = await fetch(base + route, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  }
  async function login(email) {
    const res = await fetch(base + '/auth/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role: 'employee' }) });
    assert.equal(res.status, 200);
    return res.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  }
  const admin = await login('admin@test.example');
  assert.equal((await call(admin, '/api/workspace', { workspace: workspace(), version: 1 }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/members', { email: 'admin@test.example', role: 'admin', employeeId: 'EMP-001', workplaceAdmin: true }, 'PUT')).status, 200);
  const cookies = { admin };
  for (const [name, employeeId] of [['owner', 'EMP-008'], ['manager', 'EMP-003'], ['visitor', 'EMP-006']]) {
    assert.equal((await call(admin, '/api/members', { email: `${name}@test.example`, role: 'employee', employeeId }, 'PUT')).status, 200);
    cookies[name] = await login(`${name}@test.example`);
  }
  assert.equal((await call(admin, '/api/workplace/admin/offices', { id: 'zrh', name: 'Zurich', timezone: 'Europe/Zurich' }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/workplace/admin/rooms/room-zrh/office', { officeId: 'zrh' }, 'PUT')).status, 200);
  assert.equal((await call(admin, '/api/workplace/admin/sharing', { roomId: 'room-zrh', enabled: true }, 'PUT')).status, 200);
  async function token(who, scopes) {
    const r = await call(cookies[who], '/api/tokens', { name: 'cli test', scopes });
    assert.equal(r.status, 201, r.body.error);
    return r.body.token;
  }
  // Runs the CLI in-process with its own environment and returns everything it printed.
  async function orgflow(tok, ...argv) {
    const lines = [];
    await cli.run(argv, { env: { ORGFLOW_API_URL: base, ORGFLOW_API_TOKEN: tok, ORGFLOW_CONFIG: path.join(dir, 'unused.json') }, stdout: s => lines.push(s) });
    return lines.join('\n');
  }
  return { base, dir, call, cookies, token, orgflow };
}

test('a scheduling-only member plans, books and requests vacation from the command line; the manager approves', async t => {
  const { call, cookies, token, orgflow } = await setup(t);
  assert.equal((await call(cookies.owner, '/api/tokens', { name: 'x', scopes: ['workplace', 'read'] })).status, 403, 'employees cannot get organization-chart tokens');
  assert.equal((await call(cookies.owner, '/api/tokens', { name: 'x' })).status, 403, 'the default read scope is refused too');
  const owner = await token('owner', ['workplace']), visitor = await token('visitor', ['workplace']), manager = await token('manager', ['workplace']);

  const who = await orgflow(owner, 'whoami');
  assert.match(who, /owner@test\.example/);
  assert.match(who, /Desk Z1/);
  assert.match(who, /Approver Luca Rossi/);
  assert.match(await orgflow(owner, 'offices'), /zrh\s+Zurich\s+Europe\/Zurich/);

  assert.match(await orgflow(owner, 'plan', '2026-10-14..2026-10-15', 'remote'), /Set 2 day\(s\) to Remote/);
  assert.match(await orgflow(owner, 'plan', 'tomorrow', 'zurich'), /Set 1 day\(s\) to Zurich/, 'office names match case-insensitively');
  const week = await orgflow(owner, 'week', '2026-10-14');
  assert.match(week, /Week of 2026-10-12/);
  assert.match(week, /Tue 2026-10-13\s+Zurich/);
  assert.match(week, /Wed 2026-10-14\s+Remote/);
  assert.match(week, /Fri 2026-10-16\s+No plan — desk protected/);
  assert.match(await orgflow(owner, 'pattern', 'fri=remote'), /Fri\s+Remote/);
  assert.deepEqual(JSON.parse(await orgflow(owner, '--json', 'pattern')).pattern, { 5: 'remote' });

  assert.match(await orgflow(visitor, 'desks', 'zrh', '2026-10-14', '--available'), /Z1\s+Zurich floor 2\s+Available/);
  assert.doesNotMatch(await orgflow(visitor, 'desks', 'zrh', '2026-10-13', '--available'), /Z1/, 'the owner works in Zurich on Tuesday');
  const booked = JSON.parse(await orgflow(visitor, '--json', 'book', 'Zurich', '2026-10-14', 'Z1'));
  assert.equal(booked.deskLabel, 'Z1');
  assert.match(await orgflow(visitor, 'bookings'), new RegExp(`2026-10-14\\s+Z1.*${booked.id}`));
  await assert.rejects(orgflow(manager, 'book', 'zrh', '2026-10-14', 'Z1'), err => err.status === 409, 'one booking per desk and day');
  await assert.rejects(orgflow(owner, 'book', 'zrh', '2026-10-14', 'Z1'), /your own assigned desk/);
  assert.match(await orgflow(visitor, 'unbook', booked.id), /Cancelled\. Confirm where you will work on 2026-10-14/);

  const requested = await orgflow(owner, 'vacation', 'request', '2026-10-26', '2026-10-27', '--note', 'Family visit');
  assert.match(requested, /Requested 2026-10-26 – 2026-10-27 \(2 days\) — waiting for Luca Rossi/);
  const id = requested.match(/Id (\S+)\.$/)[1];
  await assert.rejects(orgflow(owner, 'approve', id), err => err.status === 403, 'no self-approval');
  const inbox = await orgflow(manager, 'approvals');
  assert.match(inbox, new RegExp(`${id}\\s+.*new\\s+2026-10-26 – 2026-10-27\\s+2d\\s+note: Family visit`));
  assert.match(await orgflow(manager, 'approve', id, '--note', 'Enjoy'), /Approved .*request for 2026-10-26 – 2026-10-27/);
  assert.match(await orgflow(owner, 'vacation'), /2026-10-26 – 2026-10-27\s+2\s+new\s+approved\s+Luca Rossi/);
  assert.match(await orgflow(owner, 'notifications'), /unread/);
  assert.match(await orgflow(owner, 'team', '--from', '2026-10-19', '--to', '2026-10-31'), /2026-10-26 – 2026-10-27\s+approved/);

  // The org chart stays closed to a scheduling-only member, whatever the token says.
  await assert.rejects(orgflow(owner, 'org', 'summary'), err => err.status === 403);
});

test('token scopes keep organization-chart and workplace access apart', async t => {
  const { token, orgflow } = await setup(t);
  const readOnly = await token('admin', ['read']);
  assert.match(await orgflow(readOnly, 'org', 'search', 'Platform'), /POS-008/);
  assert.match(await orgflow(readOnly, 'whoami'), /<admin@test\.example> · admin/, 'whoami works with any scope');
  await assert.rejects(orgflow(readOnly, 'week'), err => err.status === 403 && /scope/i.test(err.message) && /CLI & agents/.test(err.message));
  const both = await token('admin', ['read', 'workplace']);
  assert.match(await orgflow(both, 'whoami'), /workplace admin/);
  assert.match(await orgflow(both, 'org', 'vacancies'), /"items"/);
  assert.equal(JSON.parse(await orgflow(both, 'org', 'person', 'EMP-008')).id, 'EMP-008');
  assert.ok(JSON.parse(await orgflow(both, 'org', 'span', 'POS-003')));
  await assert.rejects(orgflow(both, 'org', 'span'), /org commands/);
  await assert.rejects(orgflow(both, 'desks', 'mars'), err => /Unknown office "mars"\. Offices: zrh \(Zurich\)/.test(err.message));
});

test('login checks the token and saves it privately; plain http is refused for remote hosts', async t => {
  const { base, dir, token } = await setup(t);
  const tok = await token('owner', ['workplace']);
  const file = path.join(dir, 'conf', 'config.json'), env = { ORGFLOW_CONFIG: file };
  const lines = [];
  await cli.run(['login', '--url', base, '--token-stdin'], { env, stdout: s => lines.push(s), stdin: () => tok + '\n' });
  assert.match(lines[0], /as owner@test\.example \(employee\)/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { url: base, token: tok });
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = [];
  await cli.run(['whoami'], { env, stdout: s => again.push(s) });
  assert.match(again.join('\n'), /owner@test\.example/, 'later commands use the saved host and token');
  await cli.run(['logout'], { env, stdout: () => {} });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).token, undefined);
  await assert.rejects(cli.run(['whoami'], { env, stdout: () => {} }), /No token/);
  await assert.rejects(cli.run(['login', '--url', base, '--token-stdin'], { env, stdout: () => {}, stdin: () => 'ofk_wrong' }), err => err.status === 401 && /orgflow login/.test(err.message));
  await assert.rejects(cli.run(['whoami', '--url', 'http://orgflow.example.com', '--token', 'x'], { env, stdout: () => {} }), /https/);
});

test('argument parsing, help and exit codes', () => {
  assert.deepEqual(cli.parse(['book', 'zrh', '--for', 'EMP-1', '--json', '--note=a=b']), { args: ['book', 'zrh'], opts: { for: 'EMP-1', json: true, note: 'a=b' } });
  assert.throws(() => cli.parse(['vacation', '--note']), /--note needs a value/);
  assert.equal(cli.configPath({ ORGFLOW_CONFIG: '/x/y.json' }), '/x/y.json');
  for (const name of ['login', 'week', 'plan', 'book', 'vacation request', 'approve', 'not-mine', 'org summary']) assert.ok(cli.HELP.includes(name), name);
  const version = spawnSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' });
  assert.equal(version.stdout.trim(), require('../package.json').version);
  const env = { ...process.env, ORGFLOW_API_URL: 'http://127.0.0.1:9', ORGFLOW_API_TOKEN: 'x', ORGFLOW_CONFIG: path.join(os.tmpdir(), 'orgflow-none.json') };
  const unknown = spawnSync(process.execPath, [BIN, 'frobnicate'], { encoding: 'utf8', env });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown command "frobnicate"/);
  const badDate = spawnSync(process.execPath, [BIN, 'plan', '2026-02-30', 'remote'], { encoding: 'utf8', env });
  assert.equal(badDate.status, 1, 'the date is checked after the host answers; an unreachable host is an error, not a usage problem');
  assert.match(badDate.stderr, /Cannot reach/);
});

test('skills install copies the user-facing skills for Claude Code and Codex', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-home-'));
  try {
    const lines = [];
    await cli.run(['skills', 'install'], { env: { HOME: home, USERPROFILE: home }, stdout: s => lines.push(s) });
    for (const dir of ['.claude', '.agents']) {
      for (const name of ['orgflow-workplace', 'orgflow-org']) assert.equal(fs.readFileSync(path.join(home, dir, 'skills', name, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', '.claude', 'skills', name, 'SKILL.md'), 'utf8'));
      assert.equal(fs.existsSync(path.join(home, dir, 'skills', 'orgflow-develop')), false, 'the repository skill stays in the repository');
    }
    assert.match(lines[0], /Restart Claude Code or Codex/);
    const only = path.join(home, 'only');
    await cli.run(['skills', 'install', '--dir', only], { env: { HOME: home }, stdout: () => {} });
    assert.ok(fs.existsSync(path.join(only, 'orgflow-workplace', 'SKILL.md')));
    const listed = [];
    await cli.run(['skills'], { env: {}, stdout: s => listed.push(s) });
    assert.match(listed[0], /^orgflow-workplace {2}Plan where you work/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('orgflow mcp serves the organization-chart tools over stdio', () => {
  const env = { ...process.env, ORGFLOW_API_URL: 'http://127.0.0.1:9', ORGFLOW_API_TOKEN: 'ofk_test', ORGFLOW_CONFIG: path.join(os.tmpdir(), 'orgflow-none.json') };
  const input = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }].map(m => JSON.stringify(m)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [BIN, 'mcp'], { encoding: 'utf8', env, input, timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  const [init, list] = r.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(init.result.serverInfo.name, 'orgflow');
  assert.ok(list.result.tools.some(t => t.name === 'search_positions'));
});
