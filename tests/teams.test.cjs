'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const { createApp, safeReturn } = require('../server/lib/app');

const TENANT = '11111111-2222-3333-4444-555555555555', CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', BOT = 'bbbbbbbb-0000-1111-2222-333333333333', APP = 'cccccccc-0000-1111-2222-333333333333';
const AUTHORITY = 'https://login.example.test', SERVICE = 'http://127.0.0.1:9/teams/';
const entra = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), botKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), rogue = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (pair, kid, extra = {}) => ({ ...pair.publicKey.export({ format: 'jwk' }), kid, use: 'sig', ...extra });
function sign(claims, pair = entra, kid = 'entra-1') {
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const input = enc({ alg: 'RS256', typ: 'JWT', kid }) + '.' + enc(claims);
  return input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url');
}
const NOW = new Date('2026-10-12T09:00:00Z'), t0 = Math.floor(NOW.getTime() / 1000);
const ssoClaims = (extra = {}) => ({ iss: `${AUTHORITY}/${TENANT}/v2.0`, aud: CLIENT, tid: TENANT, oid: 'oid-manager', scp: 'access_as_user', preferred_username: 'manager@test.example', name: 'Luca Rossi', iat: t0 - 60, nbf: t0 - 60, exp: t0 + 3600, ...extra });
const botClaims = (extra = {}) => ({ iss: 'https://api.botframework.com', aud: BOT, serviceurl: SERVICE, iat: t0 - 60, nbf: t0 - 60, exp: t0 + 3600, ...extra });

function mockFetch() {
  const sent = [], plan = { fail: [] };
  async function impl(url, init = {}) {
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url === `${AUTHORITY}/${TENANT}/discovery/v2.0/keys`) return json({ keys: [jwk(entra, 'entra-1')] });
    if (url === 'https://bot.example.test/openid') return json({ jwks_uri: 'https://bot.example.test/keys' });
    if (url === 'https://bot.example.test/keys') return json({ keys: [jwk(botKey, 'bot-1', { endorsements: ['msteams'] })] });
    if (url === `${AUTHORITY}/${TENANT}/oauth2/v2.0/token`) return json({ access_token: 'bot-access', expires_in: 3600 });
    if (url.startsWith(SERVICE)) {
      const next = plan.fail.shift();
      if (next === 'network') throw new Error('connection reset');
      if (next) return json({ error: 'nope' }, next);
      sent.push({ url, auth: init.headers.authorization, body: JSON.parse(init.body) });
      return json({ id: 'activity-' + sent.length }, 201);
    }
    throw new Error('Unexpected fetch ' + url);
  }
  return { impl, sent, plan };
}

async function setup(t) {
  let clock = NOW;
  const fake = mockFetch();
  const app = createApp({
    memory: true, now: () => clock, fetch: fake.impl,
    env: { AUTH_MODE: 'dev', SESSION_SECRET: 'teams-test' },
    teams: { tenantId: TENANT, clientId: CLIENT, appIdUri: `api://orgflow.example.test/${CLIENT}`, appId: APP, botId: BOT, botPassword: 'secret', authority: AUTHORITY, botOpenId: 'https://bot.example.test/openid', serviceHosts: ['127.0.0.1'], allowHttpServiceUrl: true, ssoEnabled: true, botEnabled: true, autoEnroll: false }
  });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => new Promise(r => app.server.close(r)));
  const call = async (route, { body, headers = {}, method = body ? 'POST' : 'GET' } = {}) => {
    const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text(), out = text ? JSON.parse(text) : {};
    return { http: res.status, headers: res.headers, ...out };
  };
  const adminRes = await fetch(base + '/auth/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.example' }) });
  const admin = adminRes.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/harbor-and-co/workspace.json'), 'utf8'));
  assert.equal((await call('/api/workspace', { method: 'PUT', body: { workspace: doc, version: 1 }, headers: { cookie: admin } })).http, 200);
  for (const [email, employeeId] of [['manager@test.example', 'EMP-003'], ['owner@test.example', 'EMP-008']]) assert.equal((await call('/api/members', { method: 'PUT', body: { email, role: 'employee', employeeId }, headers: { cookie: admin } })).http, 200);
  return { app, base, call, fake, admin, tick: ms => { clock = new Date(clock.getTime() + ms); } };
}

test('Teams single sign-on validates the Entra ID token on the server and maps it to the member', async t => {
  const { call } = await setup(t);
  const ok = await call('/auth/teams/sso', { body: { token: sign(ssoClaims()) } });
  assert.equal(ok.http, 200, ok.error);
  assert.equal(ok.landing, '/workplace.html');
  assert.equal(ok.session.employeeId, 'EMP-003');
  const me = await call('/api/workplace/me', { headers: { 'x-orgflow-session': ok.sessionToken } });
  assert.equal(me.http, 200);
  assert.equal(me.employee.name, 'Luca Rossi');
  assert.equal((await call('/api/workplace/me', { headers: { 'x-orgflow-session': ok.sessionToken + 'x' } })).http, 401, 'tampered session');
  // The object ID is remembered: a renamed account still maps to the same member.
  const renamed = await call('/auth/teams/sso', { body: { token: sign(ssoClaims({ preferred_username: 'luca.rossi@test.example' })) } });
  assert.equal(renamed.session.employeeId, 'EMP-003');
  const rejected = [
    sign(ssoClaims(), rogue), sign(ssoClaims({ exp: t0 - 3600 })), sign(ssoClaims({ aud: 'someone-else' })),
    sign(ssoClaims({ iss: 'https://login.example.test/other/v2.0' })), sign(ssoClaims({ scp: 'User.Read' })), 'not-a-token'
  ];
  for (const token of rejected) assert.equal((await call('/auth/teams/sso', { body: { token } })).http, 401, token.slice(0, 20));
  assert.equal((await call('/auth/teams/sso', { body: { token: sign(ssoClaims({ tid: 'other-tenant' })) } })).http, 403, 'other tenants');
  const stranger = await call('/auth/teams/sso', { body: { token: sign(ssoClaims({ oid: 'oid-x', preferred_username: 'stranger@test.example' })) } });
  assert.equal(stranger.http, 403);
  assert.equal(stranger.code, 'not_member');
  // A name, email or employee ID sent by the client alone is never trusted.
  assert.equal((await call('/auth/teams/sso', { body: { email: 'manager@test.example', employeeId: 'EMP-003' } })).http, 401);
});

test('bot activities are authenticated and record where to send personal notifications', async t => {
  const { call, app } = await setup(t);
  const activity = { type: 'conversationUpdate', channelId: 'msteams', serviceUrl: SERVICE, from: { id: '29:x', aadObjectId: 'oid-manager' }, conversation: { id: 'a:personal-1', conversationType: 'personal' }, channelData: { tenant: { id: TENANT } }, membersAdded: [{ id: '28:' + BOT }] };
  assert.equal((await call('/api/teams/messages', { body: activity })).http, 401);
  assert.equal((await call('/api/teams/messages', { body: activity, headers: { authorization: 'Bearer ' + sign(botClaims(), rogue, 'bot-1') } })).http, 401);
  assert.equal((await call('/api/teams/messages', { body: activity, headers: { authorization: 'Bearer ' + sign(botClaims({ serviceurl: 'https://evil.example/' }), botKey, 'bot-1') } })).http, 401);
  assert.equal((await call('/api/teams/messages', { body: { ...activity, channelData: { tenant: { id: 'x' } } }, headers: { authorization: 'Bearer ' + sign(botClaims(), botKey, 'bot-1') } })).http, 403);
  assert.equal((await call('/api/teams/messages', { body: activity, headers: { authorization: 'Bearer ' + sign(botClaims(), botKey, 'bot-1') } })).http, 200);
  assert.equal(app.db.prepare('SELECT conversation_id FROM teams_conversations WHERE aad_object_id = ?').get('oid-manager').conversation_id, 'a:personal-1');
});

test('notifications retry without duplicates, link to the record, and failures never lose the request (12)', async t => {
  const { call, app, fake, tick } = await setup(t);
  const manager = (await call('/auth/teams/sso', { body: { token: sign(ssoClaims()) } })).sessionToken;
  const owner = (await call('/auth/teams/sso', { body: { token: sign(ssoClaims({ oid: 'oid-owner', preferred_username: 'owner@test.example' })) } })).sessionToken;
  const install = { type: 'installationUpdate', action: 'add', channelId: 'msteams', serviceUrl: SERVICE, from: { aadObjectId: 'oid-manager' }, conversation: { id: 'a:personal-1', conversationType: 'personal' }, channelData: { tenant: { id: TENANT } } };
  assert.equal((await call('/api/teams/messages', { body: install, headers: { authorization: 'Bearer ' + sign(botClaims(), botKey, 'bot-1') } })).http, 200);

  const req = await call('/api/workplace/vacations', { body: { start: '2026-10-26', end: '2026-10-27', note: 'Private reason' }, headers: { 'x-orgflow-session': owner } });
  assert.equal(req.http, 201, req.error);
  fake.plan.fail.push(503, 'network');
  assert.deepEqual(await app.teams.deliverPending(), { sent: 0, retry: 1, failed: 0, skipped: 0 }, 'a server error is retried later');
  assert.deepEqual(await app.teams.deliverPending(), { sent: 0, retry: 0, failed: 0, skipped: 0 }, 'retries wait for their backoff');
  tick(61000);
  assert.equal((await app.teams.deliverPending()).retry, 1, 'a network error is retried');
  tick(121000);
  assert.equal((await app.teams.deliverPending()).sent, 1);
  tick(3600000);
  await app.teams.deliverPending();
  assert.equal(fake.sent.length, 1, 'never sent twice');
  const message = fake.sent[0];
  assert.equal(message.auth, 'Bearer bot-access');
  assert.match(message.url, /\/v3\/conversations\/a%3Apersonal-1\/activities$/);
  const cardText = JSON.stringify(message.body);
  assert.ok(!cardText.includes('Private reason') && !cardText.includes('2026-10-26'), 'minimal content only');
  const actions = message.body.attachments[0].content.actions;
  assert.equal(actions[1].url, `http://127.0.0.1:8787/workplace.html#approvals/${req.id}`);
  assert.equal(JSON.parse(new URL(actions[0].url).searchParams.get('context')).subEntityId, `approvals/${req.id}`);
  assert.match(actions[0].url, new RegExp(`^https://teams\\.microsoft\\.com/l/entity/${APP}/workplace\\?`));

  // A permanent failure leaves the action visible in OrgFlow.
  const second = await call('/api/workplace/vacations', { body: { start: '2026-11-02', end: '2026-11-02' }, headers: { 'x-orgflow-session': owner } });
  fake.plan.fail.push(403);
  assert.equal((await app.teams.deliverPending()).failed, 1);
  const inbox = await call('/api/workplace/approvals', { headers: { 'x-orgflow-session': manager } });
  assert.ok(inbox.pending.some(r => r.id === second.id));
  assert.ok((await call('/api/workplace/notifications', { headers: { 'x-orgflow-session': manager } })).items.some(n => n.route === 'approvals/' + second.id));
  assert.equal((await call('/api/workplace/vacations/' + second.id + '/decision', { body: { decision: 'approve' }, headers: { 'x-orgflow-session': manager } })).http, 200, 'approval happens in OrgFlow, from Teams too');

  // An interrupted send is not repeated.
  const third = await call('/api/workplace/vacations', { body: { start: '2026-11-09', end: '2026-11-09' }, headers: { 'x-orgflow-session': owner } });
  const id = app.db.prepare("SELECT id FROM notifications WHERE route = ? AND user_id = (SELECT user_id FROM memberships WHERE employee_id = 'EMP-003')").get('approvals/' + third.id).id;
  app.db.prepare("UPDATE notification_deliveries SET status = 'sending', lease_until = '2000-01-01T00:00:00.000Z' WHERE notification_id = ?").run(id);
  const before = fake.sent.length;
  await app.teams.deliverPending();
  assert.equal(fake.sent.length, before);
  assert.equal(app.db.prepare('SELECT status FROM notification_deliveries WHERE notification_id = ?').get(id).status, 'uncertain');
});

test('only the Teams pages can be framed, and sign-in returns only to OrgFlow pages', async t => {
  const { base } = await setup(t);
  const tab = await fetch(base + '/workplace.html');
  assert.equal(tab.status, 200);
  assert.equal(tab.headers.get('x-frame-options'), null);
  assert.match(tab.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/teams\.microsoft\.com/);
  const planner = await fetch(base + '/app.html');
  for (const page of ['/teams/auth-start.html', '/teams/auth-end.html', '/js/vendor/MicrosoftTeams.min.js']) assert.equal((await fetch(base + page)).status, 200, page);
  assert.equal(planner.headers.get('x-frame-options'), 'DENY');
  assert.equal(safeReturn('/teams/auth-end.html'), '/teams/auth-end.html');
  assert.equal(safeReturn('/workplace.html#approvals/vac-1'), '/workplace.html#approvals/vac-1');
  for (const bad of ['https://evil.example/', '//evil.example/x', '/admin.html', '/workplace.html//evil', '/api/workspace']) assert.equal(safeReturn(bad), '', bad);
});

test('the Teams app package contains a valid manifest and both icons', t => {
  const os = require('node:os'), zlib = require('node:zlib'), pkg = require('../scripts/teams-package.cjs');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'orgflow-teams-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const opts = pkg.options(['--app-id', APP, '--client-id', CLIENT, '--bot-id', BOT, '--public-url', 'https://orgflow.example.com', '--company', 'Harbor & Co', '--out', out], {});
  const { file, manifest } = pkg.build(opts);
  assert.equal(manifest.staticTabs[0].contentUrl, 'https://orgflow.example.com/workplace.html?teams=1');
  assert.equal(manifest.webApplicationInfo.resource, `api://orgflow.example.com/${CLIENT}`);
  assert.deepEqual(manifest.validDomains, ['orgflow.example.com']);
  assert.equal(manifest.bots[0].isNotificationOnly, true);
  assert.equal(manifest.developer.name, 'Harbor & Co');
  assert.ok(!JSON.stringify(manifest).includes('{{'), 'every placeholder is filled');
  // Read the zip back through its central directory.
  const zipBuf = fs.readFileSync(file), entries = {};
  const end = zipBuf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let at = zipBuf.readUInt32LE(end + 16);
  for (let i = 0; i < zipBuf.readUInt16LE(end + 10); i++) {
    const nameLen = zipBuf.readUInt16LE(at + 28), name = zipBuf.toString('utf8', at + 46, at + 46 + nameLen), local = zipBuf.readUInt32LE(at + 42), size = zipBuf.readUInt32LE(at + 20), crc = zipBuf.readUInt32LE(at + 16);
    const start = local + 30 + zipBuf.readUInt16LE(local + 26) + zipBuf.readUInt16LE(local + 28);
    entries[name] = zlib.inflateRawSync(zipBuf.subarray(start, start + size));
    assert.equal(pkg.crc32(entries[name]), crc, name);
    at += 46 + nameLen;
  }
  assert.deepEqual(Object.keys(entries).sort(), ['color.png', 'manifest.json', 'outline.png']);
  assert.equal(JSON.parse(entries['manifest.json']).id, APP);
  assert.equal(entries['color.png'].readUInt32BE(16), 192);
  assert.equal(entries['outline.png'].readUInt32BE(16), 32);
  assert.throws(() => pkg.manifest({ ...opts, publicUrl: 'http://orgflow.example.com' }), /HTTPS/);
  assert.throws(() => pkg.manifest({ ...opts, appId: 'not-a-guid' }), /GUID/);
  assert.equal(pkg.manifest({ ...opts, botId: '' }).bots, undefined, 'sign-in-only packages have no bot');
});
