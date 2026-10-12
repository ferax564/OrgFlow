#!/usr/bin/env node
'use strict';
/** Browser run of the workplace screens on a seeded in-memory host: My week, booking, approvals,
 *  administration, the planner's availability overlay, and the Teams tab (single sign-on through a
 *  stand-in Teams SDK, no cookies, deep-linked to an approval). Uses the pinned Playwright package.
 *  Usage: npm run test:workplace [-- screenshots-dir]   (CHROMIUM_PATH overrides the browser binary) */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const { createApp } = require('../server/lib/app');
const W = require('../js/workplace-core');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '';
const TENANT = '11111111-2222-3333-4444-555555555555', CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', AUTHORITY = 'https://login.example.test';
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
function ssoToken(oid, upn) {
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const input = enc({ alg: 'RS256', kid: 'k1' }) + '.' + enc({ iss: `${AUTHORITY}/${TENANT}/v2.0`, aud: CLIENT, tid: TENANT, oid, scp: 'access_as_user', azp: '5e3ce6c0-2b1f-4285-8d4b-75ee78787346', preferred_username: upn, iat: now, nbf: now, exp: now + 3600 });
  return input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url');
}

(async () => {
  const fakeFetch = async url => {
    if (url === `${AUTHORITY}/${TENANT}/discovery/v2.0/keys`) return new Response(JSON.stringify({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'k1' }] }));
    throw new Error('Unexpected fetch ' + url);
  };
  const app = createApp({ memory: true, fetch: fakeFetch, env: { AUTH_MODE: 'dev', SESSION_SECRET: 'workplace-e2e' }, teams: { tenantId: TENANT, clientId: CLIENT, authority: AUTHORITY, ssoEnabled: true } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  app.config.publicUrl = base; // browser writes must come from the configured origin
  const jar = {};
  async function login(email) { const r = await fetch(base + '/auth/dev/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role: 'employee' }) }); jar[email] = r.headers.getSetCookie()[0].split(';')[0]; }
  async function call(email, route, body, method = body ? 'POST' : 'GET') {
    const r = await fetch(base + route, { method, headers: { cookie: jar[email], 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json(); if (!r.ok) throw new Error(`${route} ${r.status} ${json.error}`); return json;
  }
  // Seed: the Harbor sample plus two rooms in two offices.
  await login('admin@harbor.example');
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/harbor-and-co/workspace.json'), 'utf8'));
  const desks = ['POS-008', 'POS-009', 'POS-010', 'POS-011', '', '', 'POS-017', 'POS-003'].map((positionId, i) => ({ id: 'dz' + i, label: 'Z' + (i + 1), x: 200 + (i % 4) * 220, y: i < 4 ? 200 : 420, w: 160, h: 80, rotation: i < 4 ? 180 : 0, positionId, hotDesk: i === 5 }));
  doc.planning.seating = { rooms: [
    { id: 'room-zrh', name: 'Engineering floor', floor: 'Zurich · 2nd', outline: [[0, 0], [1100, 0], [1100, 640], [0, 640]], deskSize: { w: 160, h: 80 }, desks },
    { id: 'room-lon', name: 'Product studio', floor: 'London', outline: [[0, 0], [700, 0], [700, 400], [0, 400]], deskSize: { w: 160, h: 80 }, desks: [{ id: 'dl1', label: 'L1', x: 200, y: 200, w: 160, h: 80, rotation: 0, positionId: 'POS-006', hotDesk: false }] }
  ] };
  await call('admin@harbor.example', '/api/workspace', { workspace: doc, version: 1 }, 'PUT');
  await call('admin@harbor.example', '/api/members', { email: 'admin@harbor.example', role: 'admin', employeeId: 'EMP-001', canExport: true }, 'PUT');
  for (const [email, employeeId] of [['priya@harbor.example', 'EMP-008'], ['luca@harbor.example', 'EMP-003'], ['elena@harbor.example', 'EMP-006'], ['ana@harbor.example', 'EMP-010']]) { await call('admin@harbor.example', '/api/members', { email, role: 'employee', employeeId }, 'PUT'); await login(email); }
  for (const [id, name, timezone] of [['zrh', 'Zurich', 'Europe/Zurich'], ['lon', 'London', 'Europe/London']]) await call('admin@harbor.example', '/api/workplace/admin/offices', { id, name, timezone }, 'PUT');
  await call('admin@harbor.example', '/api/workplace/admin/rooms/room-zrh/office', { officeId: 'zrh' }, 'PUT');
  await call('admin@harbor.example', '/api/workplace/admin/rooms/room-lon/office', { officeId: 'lon' }, 'PUT');
  await call('admin@harbor.example', '/api/workplace/admin/sharing', { roomId: 'room-zrh', enabled: true }, 'PUT');
  const next = W.addDays(W.mondayOf(W.todayIn('Europe/Zurich')), 7);
  await call('priya@harbor.example', '/api/workplace/pattern', { weekdays: { 1: 'office:zrh', 2: 'office:zrh', 3: 'remote', 4: 'office:zrh', 5: 'remote' } }, 'PUT');
  const vacation = await call('priya@harbor.example', '/api/workplace/vacations', { start: W.addDays(next, 14), end: W.addDays(next, 18), note: 'Family trip' });
  await call('elena@harbor.example', '/api/workplace/reservations', { deskId: 'dz0', date: W.addDays(next, 2) });
  await call('priya@harbor.example', '/api/workplace/days', { dates: [W.addDays(next, 2)], location: 'office:zrh' }, 'PUT');

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const errors = [];
  async function open(email, hash, { width = 1280, height = 900, shot } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    if (email) { const [name, value] = jar[email].split('='); await ctx.addCookies([{ name, value, url: base }]); }
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${hash}: ${e.message}`));
    await page.goto(base + '/workplace.html' + hash);
    await page.waitForSelector('#tabs:not(.hidden)', { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    if (shot && OUT) await page.screenshot({ path: path.join(OUT, shot), fullPage: true });
    return page;
  }
  try {
    // The owner sees the seating conflict on the day she returns, with a way to another desk.
    const week = await open('priya@harbor.example', '#week/' + next, { shot: 'week.png' });
    assert.match(await week.textContent('.attn'), /confirmed reservation for your desk Z1/);
    assert.equal(await week.textContent('.notice strong'), 'Full days only.');
    // A colleague books a borrowed desk; success shows only after the server confirms.
    const book = await open('ana@harbor.example', `#book/zrh/${next}`);
    await book.click('.desk.available:not(.mine) >> nth=0');
    await book.click('[data-act="reserve"]');
    await book.waitForSelector('#status .ok, #status .err');
    assert.match(await book.textContent('#status'), /Reserved: desk Z\d · Engineering floor · Zurich/);
    if (OUT) await book.screenshot({ path: path.join(OUT, 'book.png'), fullPage: true });
    // Administrators see open conflicts and the approver table; mobile layout stays usable.
    // OrgFlow administrators manage the workplace without a separate tick.
    const admin = await open('admin@harbor.example', '#admin', { shot: 'admin.png' });
    assert.match(await admin.textContent('#view'), /Seating conflicts[\s\S]*Needs action/);
    await admin.click('[data-act="cfl-alt"]');
    await admin.waitForSelector('[data-resolve] select');
    if (OUT) await admin.screenshot({ path: path.join(OUT, 'admin-conflict.png') });
    await admin.goto(base + '/admin.html');
    await admin.waitForSelector('#members tr');
    assert.match(await admin.textContent('#members'), /EMP-008[\s\S]*yes \(admin\)|yes \(admin\)[\s\S]*EMP-008/);
    if (OUT) await admin.screenshot({ path: path.join(OUT, 'admin-members.png'), fullPage: true });
    await open('priya@harbor.example', '#vacation', { shot: 'vacation.png' });
    await open('priya@harbor.example', '#team', { shot: 'team.png' });
    await open('luca@harbor.example', '#approvals/' + vacation.id, { shot: 'approvals.png' });
    const ana = await open('ana@harbor.example', '#week/' + next, { shot: 'week-booked.png' });
    assert.match(await ana.textContent('.res'), /Desk Z\d/);
    const bell = await open('priya@harbor.example', '#week/' + next);
    await bell.click('#bell');
    await bell.waitForSelector('#drawer:not(.hidden) .item');
    if (OUT) await bell.screenshot({ path: path.join(OUT, 'notifications.png') });
    await open('elena@harbor.example', `#book/zrh/${W.addDays(next, 2)}`, { width: 390, height: 844, shot: 'mobile-book.png' });
    await open('elena@harbor.example', '#week/' + next, { width: 390, height: 844, shot: 'mobile.png' });
    // Planner seating view: date-specific availability over the permanent plan.
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const [name, value] = jar['admin@harbor.example'].split('=');
    await ctx.addCookies([{ name, value, url: base }]);
    const planner = await ctx.newPage();
    planner.on('pageerror', e => errors.push('planner: ' + e.message));
    await planner.goto(base + '/app.html');
    await planner.waitForFunction(() => window.OrgFlowEnterprise?.version, null, { timeout: 15000 });
    await planner.click('[data-view="seating"]');
    await planner.fill('#seatingAvailDate', W.addDays(next, 2));
    await planner.dispatchEvent('#seatingAvailDate', 'change');
    await planner.waitForSelector('.seat-desk.avail-reserved');
    if (OUT) await planner.screenshot({ path: path.join(OUT, 'planner-availability.png') });
    // Scheduling-only accounts are sent from the planner to the workplace screens.
    const emp = await browser.newContext();
    const [en, ev] = jar['elena@harbor.example'].split('=');
    await emp.addCookies([{ name: en, value: ev, url: base }]);
    const ep = await emp.newPage();
    await ep.goto(base + '/app.html');
    await ep.waitForURL(/workplace\.html/, { timeout: 10000 });
    // Teams tab: no cookies; a stand-in SDK supplies the context (theme, deep link) and an SSO token.
    const teams = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await teams.addInitScript(({ token, sub }) => {
      window.microsoftTeams = { app: { initialize: async () => {}, getContext: async () => ({ app: { theme: 'dark' }, page: { subPageId: sub } }), registerOnThemeChangeHandler: () => {}, notifySuccess: () => {} }, authentication: { getAuthToken: async () => token } };
    }, { token: ssoToken('oid-luca', 'luca@harbor.example'), sub: 'approvals/' + vacation.id });
    const tab = await teams.newPage();
    tab.on('pageerror', e => errors.push('teams: ' + e.message));
    await tab.goto(base + '/workplace.html?teams=1');
    await tab.waitForSelector('#appr-' + vacation.id + '.focus', { timeout: 10000 });
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal((await teams.cookies()).length, 0, 'the tab works without cookies');
    if (OUT) await tab.screenshot({ path: path.join(OUT, 'teams-approval.png'), fullPage: true });
    await tab.click(`[data-decide="${vacation.id}"] button[value="approve"]`);
    await tab.waitForSelector('text=Nothing to review.');
    assert.equal((await call('priya@harbor.example', '/api/workplace/vacations/' + vacation.id)).status, 'approved');
    assert.deepEqual(errors, []);
    console.log('Workplace browser run passed: week, booking, admin, mobile, planner overlay, employee redirect and Teams SSO approval.');
  } finally {
    await browser.close();
    app.server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
