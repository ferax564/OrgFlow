'use strict';
/** Work-location planning, vacation approval and desk sharing on the shared enterprise host.
 *  Every rule is enforced here, whichever screen (browser, Teams tab) sent the request. */
const crypto = require('node:crypto');
const W = require('../../js/workplace-core');
const { createOrgView } = require('./workplace-org');

function fail(status, message, extra = {}) { return Object.assign(new Error(message), { status, extra }); }
function newId(prefix) { return prefix + '-' + crypto.randomUUID(); }
function text(value, label, max) {
  if (value == null) return '';
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw fail(400, `${label} must be text.`);
  const out = value.trim();
  if (out.length > max) throw fail(400, `${label} is longer than ${max} characters.`);
  return out;
}
function validDate(value, label) { try { return W.date(value, label); } catch (error) { throw fail(400, error.message); } }
const ID = /^[A-Za-z0-9._:-]{1,150}$/;

function settings(env = process.env) {
  const days = (name, fallback, min, max) => { const n = Number(env[name]); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; };
  return {
    defaultTimezone: W.validTimezone(env.WORKPLACE_TIMEZONE) ? env.WORKPLACE_TIMEZONE : 'UTC',
    bookingDays: days('WORKPLACE_BOOKING_DAYS', 90, 1, 365),
    planDays: days('WORKPLACE_PLAN_DAYS', 365, 7, 730),
    scheduleRetentionDays: days('WORKPLACE_SCHEDULE_RETENTION_DAYS', 400, 30, 3650),
    vacationRetentionDays: days('WORKPLACE_VACATION_RETENTION_DAYS', 1095, 90, 3650),
    notificationRetentionDays: days('WORKPLACE_NOTIFICATION_RETENTION_DAYS', 180, 7, 3650),
    linkByEmail: env.WORKPLACE_LINK_BY_EMAIL === 'true'
  };
}

function createWorkplace(store, options = {}) {
  const db = store.db, T = store.tenantId;
  const cfg = { ...settings(options.env || {}), ...options.settings };
  const now = () => (options.now ? options.now() : new Date());
  const nowIso = () => now().toISOString();
  const hooks = { channel: options.channel || null, afterNotify: () => {} };

  // ---- Transactions and the live organization -------------------------------------
  function tx(fn) {
    if (db.isTransaction) {
      db.exec('SAVEPOINT workplace');
      try { const out = fn(); db.exec('RELEASE workplace'); return out; }
      catch (error) { db.exec('ROLLBACK TO workplace'); db.exec('RELEASE workplace'); throw error; }
    }
    db.exec('BEGIN IMMEDIATE');
    try { const out = fn(); db.exec('COMMIT'); hooks.afterNotify(); return out; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  let orgCache = null;
  /** Current as stored now (inside a transaction this includes the pending save). */
  function org() {
    const head = db.prepare('SELECT version, updated_at FROM workspaces WHERE tenant_id = ?').get(T);
    const key = head.version + '|' + head.updated_at;
    if (!orgCache || orgCache.key !== key) orgCache = { key, view: createOrgView(JSON.parse(store.getWorkspaceRow().document)) };
    return orgCache.view;
  }
  function utcToday() { return W.todayIn('UTC', now()); }

  // ---- Offices and time zones -----------------------------------------------------------
  function offices() { return db.prepare('SELECT id, name, timezone FROM offices WHERE tenant_id = ? ORDER BY name').all(T); }
  function office(id) { return db.prepare('SELECT id, name, timezone FROM offices WHERE tenant_id = ? AND id = ?').get(T, id) || null; }
  function roomOffices() { return new Map(db.prepare('SELECT room_id, office_id FROM office_rooms WHERE tenant_id = ?').all(T).map(r => [r.room_id, r.office_id])); }
  function tzOf(officeId) { return office(officeId)?.timezone || cfg.defaultTimezone; }
  function officeToday(officeId) { return W.todayIn(tzOf(officeId), now()); }
  function homeOfficeId(employeeId, d = utcToday()) {
    const seat = org().deskOf(employeeId, d);
    return seat ? roomOffices().get(seat.room.id) || '' : '';
  }
  /** "Today" for a person follows their home office (their assigned desk), else the company default. */
  function employeeToday(employeeId) { const home = homeOfficeId(employeeId); return home ? officeToday(home) : W.todayIn(cfg.defaultTimezone, now()); }

  // ---- People, roles and links ------------------------------------------------------------
  function actor(ident) {
    let m = ident.membership;
    if (!m.employee_id && cfg.linkByEmail) {
      const matches = org().findByEmail(ident.user.email);
      const linked = matches.length === 1 && db.prepare('SELECT 1 FROM memberships WHERE tenant_id = ? AND employee_id = ?').get(T, matches[0].id);
      if (matches.length === 1 && !linked) { m = store.linkEmployee(ident.user.id, matches[0].id); store.audit({ userId: ident.user.id, action: 'workplace.employee.link', detail: { employeeId: matches[0].id, via: 'verified-email' } }); }
    }
    return {
      userId: ident.user.id, email: ident.user.email, role: m.role, employeeId: m.employee_id || '',
      orgAdmin: m.role === 'admin', workplaceAdmin: Boolean(m.workplace_admin), orgAccess: m.role !== 'employee' && !m.scope_position_id
    };
  }
  function requireEmployee(a) {
    if (!a.employeeId) throw fail(403, 'Your account is not linked to an employee record yet. Ask an OrgFlow administrator to link it.', { code: 'not_linked' });
    if (!org().person(a.employeeId)) throw fail(403, 'Your linked employee record is not in the current organization. Ask an OrgFlow administrator to correct it.', { code: 'not_linked' });
    return a.employeeId;
  }
  function requireWorkplaceAdmin(a) { if (!a.workplaceAdmin) throw fail(403, 'Only workplace administrators can do this.'); }
  function requireOrgAdmin(a) { if (!a.orgAdmin) throw fail(403, 'Only OrgFlow administrators can do this.'); }
  function userForEmployee(employeeId) { return db.prepare('SELECT user_id FROM memberships WHERE tenant_id = ? AND employee_id = ?').get(T, employeeId)?.user_id || ''; }
  function userName(userId) { if (!userId || userId === 'system') return userId === 'system' ? 'OrgFlow' : ''; const u = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId); return u ? u.name || u.email : ''; }
  function workplaceAdminUsers() {
    const flagged = db.prepare('SELECT user_id FROM memberships WHERE tenant_id = ? AND workplace_admin = 1').all(T).map(r => r.user_id);
    return flagged.length ? flagged : db.prepare("SELECT user_id FROM memberships WHERE tenant_id = ? AND role = 'admin'").all(T).map(r => r.user_id);
  }
  function overrides() { return new Map(db.prepare('SELECT employee_id, approver_id FROM approver_overrides WHERE tenant_id = ?').all(T).map(r => [r.employee_id, r.approver_id])); }
  function approverFor(employeeId, over = overrides()) {
    if (over.has(employeeId)) return over.get(employeeId);
    return org().derivedManager(employeeId, employeeToday(employeeId));
  }
  function directReports(managerId) {
    const over = overrides(), d = utcToday();
    return org().positionsOn(d).filter(p => p.personId && p.personId !== managerId).map(p => p.personId).filter(id => approverFor(id, over) === managerId);
  }

  // ---- Notifications (outbox: the in-app list is authoritative; Teams delivery is best effort) ----
  function notifyUser(userId, { kind, title, route, key }) {
    if (!userId) return;
    const id = newId('ntf'), created = nowIso();
    const inserted = db.prepare('INSERT OR IGNORE INTO notifications (id, tenant_id, user_id, kind, title, route, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, T, userId, kind, title, route, key + '|' + userId, created);
    if (inserted.changes && hooks.channel) db.prepare("INSERT INTO notification_deliveries (notification_id, channel, status, next_attempt_at) VALUES (?, ?, 'pending', ?)").run(id, hooks.channel, created);
  }
  function notifyEmployee(employeeId, n) { notifyUser(userForEmployee(employeeId), n); }
  function notifyAdmins(n) { for (const userId of workplaceAdminUsers()) notifyUser(userId, n); }
  function notifications(a) {
    const rows = db.prepare('SELECT id, kind, title, route, created_at, read_at FROM notifications WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 100').all(T, a.userId);
    return { items: rows.map(r => ({ id: r.id, kind: r.kind, title: r.title, route: r.route, createdAt: r.created_at, read: Boolean(r.read_at) })), unread: rows.filter(r => !r.read_at).length };
  }
  function markRead(a, ids) {
    const at = nowIso();
    if (ids === 'all') db.prepare("UPDATE notifications SET read_at = ? WHERE tenant_id = ? AND user_id = ? AND read_at = ''").run(at, T, a.userId);
    else for (const id of (Array.isArray(ids) ? ids : []).slice(0, 200)) db.prepare("UPDATE notifications SET read_at = ? WHERE tenant_id = ? AND user_id = ? AND id = ? AND read_at = ''").run(at, T, a.userId, String(id));
    return notifications(a);
  }

  // ---- Plans -------------------------------------------------------------------------------
  function pattern(employeeId) {
    const out = {};
    for (const r of db.prepare('SELECT weekday, location FROM work_patterns WHERE tenant_id = ? AND employee_id = ?').all(T, employeeId)) out[r.weekday] = r.location;
    return out;
  }
  /** Effective plans of everyone on one date: one query per record type. */
  function plansOn(d) {
    const wd = W.weekday(d);
    const days = new Map(db.prepare('SELECT employee_id, location FROM work_days WHERE tenant_id = ? AND date = ?').all(T, d).map(r => [r.employee_id, r.location]));
    const patterns = new Map(db.prepare('SELECT employee_id, location FROM work_patterns WHERE tenant_id = ? AND weekday = ?').all(T, wd).map(r => [r.employee_id, r.location]));
    const vac = db.prepare("SELECT id, employee_id, status FROM vacation_requests WHERE tenant_id = ? AND kind IN ('new','change') AND status IN ('approved','pending') AND start_date <= ? AND end_date >= ?").all(T, d, d);
    const approved = new Map(vac.filter(v => v.status === 'approved').map(v => [v.employee_id, v]));
    const pending = new Map(vac.filter(v => v.status === 'pending').map(v => [v.employee_id, v]));
    const cache = new Map();
    return id => {
      if (!cache.has(id)) cache.set(id, W.resolveDay({ date: d, override: days.get(id) || null, pattern: patterns.has(id) ? { [wd]: patterns.get(id) } : null, approvedVacation: approved.get(id) || null, pendingVacation: pending.get(id) || null }));
      return cache.get(id);
    };
  }
  function checkLocation(value, allowNone) {
    let loc;
    try { loc = W.parseLocation(value, { allowNone }); } catch (error) { throw fail(400, error.message); }
    if (loc.kind === 'office' && !office(loc.officeId)) throw fail(400, 'Unknown office.');
    return loc.value;
  }
  function checkPlanDate(employeeId, d) {
    validDate(d);
    const today = employeeToday(employeeId);
    if (d < today) throw fail(400, `${d} is in the past. Plans can be changed from ${today}.`);
    if (W.daysBetween(today, d) > cfg.planDays) throw fail(400, `Plans can be entered at most ${cfg.planDays} days ahead.`);
  }
  function setDays(a, { dates, location }) {
    const me = requireEmployee(a);
    if (!Array.isArray(dates) || !dates.length || dates.length > 62) throw fail(400, 'Choose between 1 and 62 dates.');
    const unique = [...new Set(dates)];
    for (const d of unique) checkPlanDate(me, d);
    const value = location === 'clear' ? 'clear' : checkLocation(location, true);
    return tx(() => {
      for (const d of unique) {
        if (value === 'clear') db.prepare('DELETE FROM work_days WHERE tenant_id = ? AND employee_id = ? AND date = ?').run(T, me, d);
        else db.prepare('INSERT INTO work_days (tenant_id, employee_id, date, location, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, employee_id, date) DO UPDATE SET location = excluded.location, updated_by = excluded.updated_by, updated_at = excluded.updated_at').run(T, me, d, value, a.userId, nowIso());
        db.prepare("UPDATE reservations SET location_confirmed = 1 WHERE tenant_id = ? AND employee_id = ? AND date = ? AND status <> 'confirmed'").run(T, me, d);
      }
      store.audit({ userId: a.userId, action: 'workplace.plan.days', detail: { employeeId: me, dates: unique, location: value } });
      reconcile();
      return { ok: true, dates: unique, location: value, conflicts: ownConflicts(me, unique) };
    });
  }
  function setPattern(a, { weekdays }) {
    const me = requireEmployee(a);
    if (!weekdays || typeof weekdays !== 'object' || Array.isArray(weekdays)) throw fail(400, 'Provide a location for each weekday.');
    const next = {};
    for (const [key, value] of Object.entries(weekdays)) {
      const wd = Number(key);
      if (!Number.isInteger(wd) || wd < 1 || wd > 7) throw fail(400, 'Weekdays are numbered 1 (Monday) to 7 (Sunday).');
      if (value) next[wd] = checkLocation(value, false);
    }
    return tx(() => {
      db.prepare('DELETE FROM work_patterns WHERE tenant_id = ? AND employee_id = ?').run(T, me);
      for (const [wd, loc] of Object.entries(next)) db.prepare('INSERT INTO work_patterns (tenant_id, employee_id, weekday, location, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(T, me, Number(wd), loc, a.userId, nowIso());
      store.audit({ userId: a.userId, action: 'workplace.plan.pattern', detail: { employeeId: me, pattern: next } });
      reconcile();
      return { ok: true, pattern: next, conflicts: ownConflicts(me) };
    });
  }

  // ---- Desk availability ------------------------------------------------------------------------
  function context(d) {
    return {
      d, plan: plansOn(d), roomOffice: roomOffices(),
      closures: db.prepare('SELECT office_id, room_id, desk_id FROM closures WHERE tenant_id = ? AND start_date <= ? AND end_date >= ?').all(T, d, d),
      reservations: new Map(db.prepare("SELECT * FROM reservations WHERE tenant_id = ? AND date = ? AND status = 'confirmed'").all(T, d).map(r => [r.desk_id, r])),
      sharing: new Map(db.prepare('SELECT desk_id, equipment FROM desk_sharing WHERE tenant_id = ?').all(T).map(r => [r.desk_id, r.equipment]))
    };
  }
  function ownerOf(view, desk, d) { return desk.positionId && !desk.hotDesk ? view.ownerOfPosition(desk.positionId, d) : ''; }
  function stateOf(ctx, room, desk) {
    const officeId = ctx.roomOffice.get(room.id) || '', ownerId = ownerOf(org(), desk, ctx.d);
    if (!officeId) return { officeId, ownerId, state: 'unavailable', reason: 'no-office' };
    const closed = ctx.closures.some(c => c.office_id === officeId && (!c.room_id || c.room_id === room.id) && (!c.desk_id || c.desk_id === desk.id));
    return { officeId, ownerId, ...W.deskState({ officeId, closed, reservation: ctx.reservations.get(desk.id), sharing: ctx.sharing.has(desk.id), assigned: Boolean(desk.positionId && !desk.hotDesk), ownerId, ownerDay: ownerId ? ctx.plan(ownerId) : null }) };
  }
  function officeMap(a, officeId, d, { plans = true } = {}) {
    validDate(d);
    const o = office(officeId);
    if (!o) throw fail(404, 'Office not found.');
    const ctx = context(d), view = org(), me = a.employeeId;
    const rooms = view.seating.rooms.filter(r => ctx.roomOffice.get(r.id) === officeId).map(room => ({
      id: room.id, name: room.name, floor: room.floor, outline: room.outline,
      ...(plans && room.background && !room.background.hidden ? { background: room.background } : {}),
      desks: room.desks.map(desk => {
        const s = stateOf(ctx, room, desk), res = ctx.reservations.get(desk.id);
        const out = { id: desk.id, label: desk.label, x: desk.x, y: desk.y, w: desk.w, h: desk.h, rotation: desk.rotation, state: s.state, reason: s.reason, equipment: ctx.sharing.get(desk.id) || '', note: desk.note || '' };
        if (me && s.ownerId === me) out.mine = true;
        if (res && me && res.employee_id === me) out.reservedByMe = res.id;
        if (a.workplaceAdmin) { out.ownerName = s.ownerId ? view.name(s.ownerId) : ''; if (res) { out.visitorName = view.name(res.employee_id); out.reservationId = res.id; } }
        return out;
      })
    }));
    return { office: o, date: d, today: officeToday(officeId), bookingDays: cfg.bookingDays, rooms, notice: W.FULL_DAY_NOTICE };
  }
  /** Desk states across every room, for the planner's seating view. Contains no names. */
  function availability(a, d) {
    if (!a.orgAccess && !a.workplaceAdmin) throw fail(403, 'Availability across all rooms is limited to planners and workplace administrators.');
    validDate(d);
    const ctx = context(d), out = {};
    for (const room of org().seating.rooms) for (const desk of room.desks) { const s = stateOf(ctx, room, desk); out[desk.id] = { state: s.state, reason: s.reason }; }
    return { date: d, desks: out, labels: W.STATE_LABELS };
  }

  // ---- Reservations -------------------------------------------------------------------------------
  function reservationView(r, a) {
    const view = org(), found = view.findDesk(r.desk_id), o = office(r.office_id);
    const out = { id: r.id, date: r.date, status: r.status, officeId: r.office_id, officeName: o?.name || '', roomId: r.room_id, roomName: found?.room.name || '', deskId: r.desk_id, deskLabel: found?.desk.label || '', equipment: db.prepare('SELECT equipment FROM desk_sharing WHERE tenant_id = ? AND desk_id = ?').get(T, r.desk_id)?.equipment || '', onBehalf: Boolean(r.on_behalf), cancelReason: r.cancel_reason, locationConfirmed: Boolean(r.location_confirmed) };
    if (!a || a.workplaceAdmin || a.employeeId === r.employee_id) { out.employeeId = r.employee_id; out.employeeName = view.name(r.employee_id); }
    return out;
  }
  function insertReservation({ desk, room, officeId, d, employeeId, a, onBehalf }) {
    const id = newId('res');
    try {
      db.prepare("INSERT INTO reservations (id, tenant_id, desk_id, room_id, office_id, date, employee_id, status, on_behalf, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)")
        .run(id, T, desk.id, room.id, officeId, d, employeeId, onBehalf ? 1 : 0, a.userId, nowIso());
    } catch (error) {
      if (!/UNIQUE/.test(error.message)) throw error;
      const deskTaken = db.prepare("SELECT 1 FROM reservations WHERE tenant_id = ? AND desk_id = ? AND date = ? AND status = 'confirmed'").get(T, desk.id, d);
      throw deskTaken ? fail(409, 'Someone else has just reserved this desk. Choose another one.', { code: 'desk_taken' }) : fail(409, 'You already have a desk reserved on this day. Cancel it before booking another.', { code: 'already_booked' });
    }
    return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  }
  function checkBookable({ deskId, d, employeeId }) {
    const view = org(), found = view.findDesk(deskId);
    if (!found) throw fail(404, 'Desk not found.');
    const ctx = context(d), s = stateOf(ctx, found.room, found.desk);
    if (!s.officeId) throw fail(409, 'This desk is not in an office that takes reservations.', { code: 'desk_unavailable' });
    const today = officeToday(s.officeId);
    if (d < today) throw fail(400, `${d} has already passed in ${office(s.officeId).name}.`);
    if (W.daysBetween(today, d) > cfg.bookingDays) throw fail(400, `Desks can be reserved at most ${cfg.bookingDays} days ahead.`);
    if (s.ownerId && s.ownerId === employeeId) throw fail(409, 'This is your own assigned desk; it stays yours without a reservation.', { code: 'own_desk' });
    if (s.state === 'reserved') throw fail(409, 'Someone else has just reserved this desk. Choose another one.', { code: 'desk_taken' });
    if (s.state !== 'available') throw fail(409, `This desk is not available on ${d} (${W.STATE_LABELS[s.state].toLowerCase()}).`, { code: 'desk_unavailable', reason: s.reason });
    if (ctx.plan(employeeId).location === 'vacation') throw fail(409, 'You are on approved vacation that day.', { code: 'on_vacation' });
    return { ...found, officeId: s.officeId };
  }
  function book(a, { deskId, date: d, employeeId }) {
    const target = employeeId && employeeId !== a.employeeId ? employeeId : requireEmployee(a), onBehalf = target !== a.employeeId;
    if (onBehalf) requireWorkplaceAdmin(a);
    if (!org().person(target)) throw fail(404, 'Employee not found in the current organization.');
    if (typeof deskId !== 'string' || !ID.test(deskId)) throw fail(400, 'Choose a desk.');
    validDate(d);
    return tx(() => {
      const found = checkBookable({ deskId, d, employeeId: target });
      const r = insertReservation({ desk: found.desk, room: found.room, officeId: found.officeId, d, employeeId: target, a, onBehalf });
      db.prepare('INSERT INTO work_days (tenant_id, employee_id, date, location, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, employee_id, date) DO UPDATE SET location = excluded.location, updated_by = excluded.updated_by, updated_at = excluded.updated_at')
        .run(T, target, d, W.officeLocation(found.officeId), a.userId, nowIso());
      store.audit({ userId: a.userId, action: 'workplace.reservation.create', detail: { reservationId: r.id, deskId, date: d, employeeId: target, onBehalf } });
      notifyEmployee(target, { kind: onBehalf ? 'reservation.admin' : 'reservation.confirmed', title: onBehalf ? 'A workplace administrator reserved a desk for you.' : 'Your desk reservation is confirmed.', route: 'week/' + d, key: 'reservation.created:' + r.id });
      reconcile();
      return reservationView(r, a);
    });
  }
  function cancelReservation(a, id, { reason } = {}) {
    const r = db.prepare('SELECT * FROM reservations WHERE tenant_id = ? AND id = ?').get(T, String(id));
    if (!r) throw fail(404, 'Reservation not found.');
    const own = a.employeeId && r.employee_id === a.employeeId;
    if (!own) requireWorkplaceAdmin(a);
    if (r.status !== 'confirmed') throw fail(409, 'This reservation is no longer active.');
    const note = text(reason, 'Reason', 300);
    return tx(() => {
      db.prepare("UPDATE reservations SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ?, location_confirmed = 0 WHERE id = ?").run(a.userId, nowIso(), note || (own ? 'cancelled by employee' : 'cancelled by administrator'), r.id);
      store.audit({ userId: a.userId, action: 'workplace.reservation.cancel', detail: { reservationId: r.id, onBehalf: !own } });
      if (!own) notifyEmployee(r.employee_id, { kind: 'reservation.admin', title: 'A workplace administrator cancelled one of your desk reservations.', route: 'week/' + r.date, key: 'reservation.cancelled:' + r.id });
      reconcile();
      const plan = plansOn(r.date)(r.employee_id);
      return { ok: true, reservation: reservationView(db.prepare('SELECT * FROM reservations WHERE id = ?').get(r.id), a), confirmLocation: { date: r.date, current: plan.location, prompt: 'Your desk reservation is cancelled. Where will you work on this day?' } };
    });
  }
  function myReservations(a) {
    const me = requireEmployee(a);
    return db.prepare("SELECT * FROM reservations WHERE tenant_id = ? AND employee_id = ? AND date >= ? ORDER BY date").all(T, me, W.addDays(utcToday(), -1)).map(r => reservationView(r, a));
  }
  function listReservations(a, { officeId, from, to }) {
    requireWorkplaceAdmin(a);
    validDate(from); validDate(to);
    if (W.daysBetween(from, to) > 92 || to < from) throw fail(400, 'Choose a range of up to three months.');
    const rows = db.prepare(`SELECT * FROM reservations WHERE tenant_id = ? AND date BETWEEN ? AND ? ${officeId ? 'AND office_id = ?' : ''} ORDER BY date, office_id`).all(...[T, from, to, ...(officeId ? [officeId] : [])]);
    return rows.map(r => reservationView(r, a));
  }
  function displace(r, reason, userId) {
    db.prepare("UPDATE reservations SET status = 'displaced', cancelled_by = ?, cancelled_at = ?, cancel_reason = ?, location_confirmed = 0 WHERE id = ?").run(userId, nowIso(), reason, r.id);
    store.audit({ userId, action: 'workplace.reservation.displace', detail: { reservationId: r.id, reason } });
    notifyEmployee(r.employee_id, { kind: 'reservation.displaced', title: 'One of your desk reservations can no longer be honoured. Choose another desk.', route: 'week/' + r.date, key: 'reservation.displaced:' + r.id });
    notifyAdmins({ kind: 'reservation.displaced', title: 'A confirmed desk reservation was displaced and needs an alternative.', route: 'admin/reservations/' + r.date, key: 'reservation.displaced.admin:' + r.id });
  }

  // ---- Seating conflicts: a confirmed visitor keeps the desk; the returning owner is flagged ----------
  function reconcile() {
    const from = W.addDays(utcToday(), -1), view = org(), byDate = new Map();
    for (const r of db.prepare("SELECT * FROM reservations WHERE tenant_id = ? AND status = 'confirmed' AND date >= ?").all(T, from)) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    const stillOpen = new Set();
    for (const [d, rows] of byDate) {
      const plan = plansOn(d), booked = new Set(rows.map(r => r.employee_id));
      for (const r of rows) {
        const found = view.findDesk(r.desk_id), ownerId = found ? ownerOf(view, found.desk, d) : '';
        const clash = Boolean(ownerId && ownerId !== r.employee_id && !booked.has(ownerId) && !W.confirmedAway(plan(ownerId), r.office_id));
        const open = db.prepare("SELECT * FROM seat_conflicts WHERE tenant_id = ? AND reservation_id = ? AND status = 'open'").get(T, r.id);
        if (clash && open && open.owner_id === ownerId) { stillOpen.add(open.id); continue; }
        if (open) db.prepare("UPDATE seat_conflicts SET status = 'resolved', resolved_at = ?, resolved_by = 'system', resolution = ? WHERE id = ?").run(nowIso(), booked.has(open.owner_id) ? 'owner-booked-another-desk' : 'owner-away-again', open.id);
        if (clash) {
          const id = newId('cfl');
          db.prepare("INSERT INTO seat_conflicts (id, tenant_id, reservation_id, desk_id, date, owner_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)").run(id, T, r.id, r.desk_id, d, ownerId, nowIso());
          stillOpen.add(id);
          store.audit({ userId: 'system', action: 'workplace.conflict.open', detail: { conflictId: id, reservationId: r.id, date: d } });
          notifyEmployee(ownerId, { kind: 'conflict.opened', title: 'A visitor has a confirmed reservation for your desk on a day you now plan to use it.', route: 'conflict/' + id, key: 'conflict.opened:' + id });
          notifyAdmins({ kind: 'conflict.opened', title: 'A seating conflict needs an alternative desk.', route: 'conflict/' + id, key: 'conflict.opened.admin:' + id });
        }
      }
    }
    for (const c of db.prepare("SELECT id FROM seat_conflicts WHERE tenant_id = ? AND status = 'open'").all(T)) {
      if (!stillOpen.has(c.id)) db.prepare("UPDATE seat_conflicts SET status = 'resolved', resolved_at = ?, resolved_by = 'system', resolution = 'reservation-ended' WHERE id = ? AND status = 'open'").run(nowIso(), c.id);
    }
    reroute();
  }
  /** Pending requests follow manager changes in Current and administrator corrections. */
  function reroute() {
    const over = overrides();
    for (const r of db.prepare("SELECT * FROM vacation_requests WHERE tenant_id = ? AND status = 'pending'").all(T)) {
      const next = approverFor(r.employee_id, over);
      if (!next || next === r.approver_id || next === r.employee_id) continue;
      db.prepare('UPDATE vacation_requests SET approver_id = ?, updated_at = ? WHERE id = ?').run(next, nowIso(), r.id);
      store.audit({ userId: 'system', action: 'workplace.vacation.reroute', detail: { requestId: r.id, from: r.approver_id, to: next } });
      notifyEmployee(next, { kind: 'vacation.submitted', title: 'A vacation request is awaiting your review.', route: 'approvals/' + r.id, key: 'vacation.routed:' + r.id + ':' + next });
    }
  }
  function conflictView(c, a) {
    const view = org(), r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(c.reservation_id), found = view.findDesk(c.desk_id);
    const out = { id: c.id, date: c.date, status: c.status, deskId: c.desk_id, deskLabel: found?.desk.label || '', roomName: found?.room.name || '', officeId: r?.office_id || '', officeName: office(r?.office_id)?.name || '', reservationId: c.reservation_id, resolution: c.resolution, createdAt: c.created_at, mineAsOwner: a.employeeId === c.owner_id };
    if (a.workplaceAdmin || a.employeeId === c.owner_id) out.ownerName = view.name(c.owner_id);
    if (a.workplaceAdmin) out.visitorName = r ? view.name(r.employee_id) : '';
    return out;
  }
  function ownConflicts(employeeId, dates) {
    const rows = db.prepare("SELECT * FROM seat_conflicts WHERE tenant_id = ? AND owner_id = ? AND status = 'open' ORDER BY date").all(T, employeeId);
    return rows.filter(c => !dates || dates.includes(c.date)).map(c => conflictView(c, { employeeId }));
  }
  function conflicts(a) {
    if (a.workplaceAdmin) return db.prepare("SELECT * FROM seat_conflicts WHERE tenant_id = ? AND (status = 'open' OR date >= ?) ORDER BY status DESC, date LIMIT 300").all(T, utcToday()).map(c => conflictView(c, a));
    return ownConflicts(requireEmployee(a));
  }
  function conflictFor(a, id) {
    const c = db.prepare('SELECT * FROM seat_conflicts WHERE tenant_id = ? AND id = ?').get(T, String(id));
    if (!c || !(a.workplaceAdmin || c.owner_id === a.employeeId)) throw fail(404, 'Seating conflict not found.');
    return c;
  }
  function alternatives(a, id) {
    const c = conflictFor(a, id), r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(c.reservation_id);
    const ctx = context(c.date), out = [];
    for (const room of org().seating.rooms) {
      if (ctx.roomOffice.get(room.id) !== r.office_id) continue;
      for (const desk of room.desks) { const s = stateOf(ctx, room, desk); if (s.state === 'available' && s.ownerId !== c.owner_id) out.push({ deskId: desk.id, deskLabel: desk.label, roomName: room.name, equipment: ctx.sharing.get(desk.id) || '' }); }
    }
    return { conflict: conflictView(c, a), desks: out.slice(0, 200) };
  }
  function resolveConflict(a, id, { action, deskId, note }) {
    const c = conflictFor(a, id);
    if (c.status !== 'open') throw fail(409, 'This conflict is already resolved.');
    const comment = text(note, 'Note', 300);
    return tx(() => {
      if (action === 'book-owner') {
        if (!a.workplaceAdmin && c.owner_id !== a.employeeId) throw fail(403, 'Not allowed.');
        book(a, { deskId, date: c.date, employeeId: c.owner_id === a.employeeId ? undefined : c.owner_id });
      } else if (action === 'move-visitor') {
        requireWorkplaceAdmin(a);
        const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(c.reservation_id);
        const found = checkBookable({ deskId, d: c.date, employeeId: r.employee_id });
        if (found.officeId !== r.office_id) throw fail(400, 'Choose a desk in the same office.');
        db.prepare("UPDATE reservations SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = 'moved by administrator' WHERE id = ?").run(a.userId, nowIso(), r.id);
        const moved = insertReservation({ desk: found.desk, room: found.room, officeId: found.officeId, d: c.date, employeeId: r.employee_id, a, onBehalf: true });
        store.audit({ userId: a.userId, action: 'workplace.reservation.move', detail: { from: r.id, to: moved.id, conflictId: c.id } });
        notifyEmployee(r.employee_id, { kind: 'reservation.admin', title: 'A workplace administrator moved your desk reservation to another desk.', route: 'week/' + c.date, key: 'reservation.moved:' + moved.id });
        notifyEmployee(c.owner_id, { kind: 'conflict.resolved', title: 'Your desk is free for you again.', route: 'week/' + c.date, key: 'conflict.resolved:' + c.id });
      } else if (action === 'dismiss') {
        requireWorkplaceAdmin(a);
        db.prepare("UPDATE seat_conflicts SET status = 'resolved', resolved_at = ?, resolved_by = ?, resolution = ? WHERE id = ?").run(nowIso(), a.userId, 'arranged: ' + (comment || 'alternative agreed'), c.id);
        notifyEmployee(c.owner_id, { kind: 'conflict.resolved', title: 'A workplace administrator has arranged your seating for that day.', route: 'week/' + c.date, key: 'conflict.dismissed:' + c.id });
      } else throw fail(400, 'Unknown resolution.');
      store.audit({ userId: a.userId, action: 'workplace.conflict.resolve', detail: { conflictId: c.id, action, deskId: deskId || '' } });
      reconcile();
      return conflictView(db.prepare('SELECT * FROM seat_conflicts WHERE id = ?').get(c.id), a);
    });
  }

  // ---- Vacation ---------------------------------------------------------------------------------
  function requestRow(id) { return db.prepare('SELECT * FROM vacation_requests WHERE tenant_id = ? AND id = ?').get(T, String(id)) || null; }
  function vacationView(r, a) {
    const view = org(), privateOk = a.employeeId === r.employee_id || a.employeeId === r.approver_id || a.orgAdmin;
    const out = { id: r.id, kind: r.kind, targetId: r.target_id, employeeId: r.employee_id, employeeName: view.name(r.employee_id), approverId: r.approver_id, approverName: view.name(r.approver_id), start: r.start_date, end: r.end_date, days: W.daysBetween(r.start_date, r.end_date) + 1, status: r.status, submittedAt: r.submitted_at, decidedAt: r.decided_at, decidedBy: userName(r.decided_by), supersededBy: r.superseded_by };
    if (privateOk) { out.note = r.note; out.decisionNote = r.decision_note; }
    if (r.kind !== 'cancel' && r.status === 'approved') {
      const pending = db.prepare("SELECT id, kind, start_date, end_date FROM vacation_requests WHERE tenant_id = ? AND target_id = ? AND status = 'pending'").get(T, r.id);
      if (pending) out.pendingChange = { id: pending.id, kind: pending.kind, start: pending.start_date, end: pending.end_date };
    }
    if (r.target_id) { const t = requestRow(r.target_id); if (t) out.target = { start: t.start_date, end: t.end_date, status: t.status }; }
    return out;
  }
  function checkOverlap(employeeId, start, end, ignore) {
    const clash = db.prepare("SELECT id, start_date, end_date FROM vacation_requests WHERE tenant_id = ? AND employee_id = ? AND kind IN ('new','change') AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ?").all(T, employeeId, end, start).filter(r => !ignore.includes(r.id));
    if (clash.length) throw fail(409, `This overlaps your ${clash[0].start_date === clash[0].end_date ? clash[0].start_date : clash[0].start_date + ' – ' + clash[0].end_date} vacation request.`, { code: 'overlap' });
  }
  function range(me, start, end) {
    try { return W.validateVacationRange(start, end, employeeToday(me)); } catch (error) { throw fail(400, error.message); }
  }
  function approverOrFail(me) {
    const approver = approverFor(me);
    if (!approver || !org().person(approver)) throw fail(409, 'No approver is configured for you. Ask an OrgFlow administrator to set your manager.', { code: 'no_approver' });
    if (approver === me) throw fail(409, 'You cannot approve your own vacation. Ask an OrgFlow administrator to assign an approver.', { code: 'no_approver' });
    return approver;
  }
  function insertRequest(a, me, fields) {
    const id = newId('vac'), at = nowIso();
    db.prepare("INSERT INTO vacation_requests (id, tenant_id, employee_id, approver_id, kind, target_id, start_date, end_date, status, note, submitted_at, submitted_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
      .run(id, T, me, fields.approver, fields.kind, fields.targetId || '', fields.start, fields.end, fields.note || '', at, a.userId, at);
    store.audit({ userId: a.userId, action: 'workplace.vacation.' + (fields.kind === 'new' ? 'submit' : fields.kind + '-request'), detail: { requestId: id, start: fields.start, end: fields.end, targetId: fields.targetId || '' } });
    const title = fields.kind === 'new' ? 'A vacation request is awaiting your review.' : fields.kind === 'cancel' ? 'A request to cancel approved vacation is awaiting your review.' : 'A request to change approved vacation is awaiting your review.';
    notifyEmployee(fields.approver, { kind: 'vacation.' + (fields.kind === 'new' ? 'submitted' : fields.kind + '_requested'), title, route: 'approvals/' + id, key: 'vacation.submitted:' + id });
    return requestRow(id);
  }
  function submitVacation(a, { start, end, note }) {
    const me = requireEmployee(a), r = range(me, start, end), memo = text(note, 'Note', 1000);
    return tx(() => {
      checkOverlap(me, r.start, r.end, []);
      return vacationView(insertRequest(a, me, { kind: 'new', approver: approverOrFail(me), start: r.start, end: r.end, note: memo }), a);
    });
  }
  function ownRequest(a, id) {
    const me = requireEmployee(a), r = requestRow(id);
    if (!r || r.employee_id !== me) throw fail(404, 'Vacation request not found.');
    return { me, r };
  }
  /** Date changes always need a fresh decision. Approved vacation stays in force until then. */
  function changeVacation(a, id, { start, end, note }) {
    const { me, r } = ownRequest(a, id), next = range(me, start, end), memo = note === undefined ? r.note : text(note, 'Note', 1000);
    return tx(() => {
      if (r.kind === 'cancel' || !['pending', 'approved'].includes(r.status)) throw fail(409, 'Only pending or approved vacation can be changed.');
      if (r.status === 'pending') {
        checkOverlap(me, next.start, next.end, [r.id, r.target_id].filter(Boolean));
        const approver = approverOrFail(me);
        db.prepare('UPDATE vacation_requests SET start_date = ?, end_date = ?, note = ?, approver_id = ?, submitted_at = ?, updated_at = ? WHERE id = ?').run(next.start, next.end, memo, approver, nowIso(), nowIso(), r.id);
        store.audit({ userId: a.userId, action: 'workplace.vacation.edit', detail: { requestId: r.id, start: next.start, end: next.end } });
        notifyEmployee(approver, { kind: 'vacation.submitted', title: 'A vacation request you are reviewing has new dates.', route: 'approvals/' + r.id, key: 'vacation.edited:' + r.id + ':' + next.start + ':' + next.end });
        return vacationView(requestRow(r.id), a);
      }
      if (db.prepare("SELECT 1 FROM vacation_requests WHERE tenant_id = ? AND target_id = ? AND status = 'pending'").get(T, r.id)) throw fail(409, 'A change to this vacation is already awaiting a decision.', { code: 'pending_change' });
      if (next.start === r.start_date && next.end === r.end_date) throw fail(400, 'Choose different dates.');
      checkOverlap(me, next.start, next.end, [r.id]);
      return vacationView(insertRequest(a, me, { kind: 'change', targetId: r.id, approver: approverOrFail(me), start: next.start, end: next.end, note: memo }), a);
    });
  }
  function cancelVacation(a, id, { note } = {}) {
    const { me, r } = ownRequest(a, id), memo = text(note, 'Note', 1000);
    return tx(() => {
      if (r.status === 'pending') {
        db.prepare("UPDATE vacation_requests SET status = 'cancelled', decided_at = ?, decided_by = ?, updated_at = ? WHERE id = ?").run(nowIso(), a.userId, nowIso(), r.id);
        store.audit({ userId: a.userId, action: 'workplace.vacation.withdraw', detail: { requestId: r.id } });
        reconcile();
        return vacationView(requestRow(r.id), a);
      }
      if (r.status !== 'approved' || r.kind === 'cancel') throw fail(409, 'This request can no longer be cancelled.');
      if (db.prepare("SELECT 1 FROM vacation_requests WHERE tenant_id = ? AND target_id = ? AND status = 'pending'").get(T, r.id)) throw fail(409, 'A change to this vacation is already awaiting a decision.', { code: 'pending_change' });
      return vacationView(insertRequest(a, me, { kind: 'cancel', targetId: r.id, approver: approverOrFail(me), start: r.start_date, end: r.end_date, note: memo }), a);
    });
  }
  function decideVacation(a, id, { decision, note }) {
    if (!['approve', 'reject'].includes(decision)) throw fail(400, 'Decision must be approve or reject.');
    const r = requestRow(id), memo = text(note, 'Decision note', 1000);
    if (!r) throw fail(404, 'Vacation request not found.');
    if (r.employee_id === a.employeeId) throw fail(403, 'You cannot decide on your own vacation.');
    if (!a.employeeId || r.approver_id !== a.employeeId) throw fail(403, 'Only the assigned approver can decide on this request.');
    return tx(() => {
      const fresh = requestRow(r.id);
      if (fresh.status !== 'pending') throw fail(409, 'This request has already been decided or withdrawn.', { code: 'decided' });
      const at = nowIso(), status = decision === 'approve' ? 'approved' : 'rejected';
      db.prepare('UPDATE vacation_requests SET status = ?, decided_at = ?, decided_by = ?, decision_note = ?, updated_at = ? WHERE id = ?').run(status, at, a.userId, memo, at, r.id);
      if (status === 'approved' && r.target_id) db.prepare("UPDATE vacation_requests SET status = 'cancelled', superseded_by = ?, updated_at = ? WHERE id = ? AND status = 'approved'").run(r.id, at, r.target_id);
      store.audit({ userId: a.userId, action: 'workplace.vacation.' + decision, detail: { requestId: r.id, kind: r.kind, targetId: r.target_id } });
      const what = r.kind === 'new' ? 'vacation request' : r.kind === 'cancel' ? 'request to cancel vacation' : 'request to change vacation';
      notifyEmployee(r.employee_id, { kind: 'vacation.' + status, title: `Your ${what} was ${status}.`, route: 'vacation/' + r.id, key: 'vacation.decided:' + r.id });
      reconcile();
      return vacationView(requestRow(r.id), a);
    });
  }
  function getVacation(a, id) {
    const r = requestRow(id);
    if (!r || !(r.employee_id === a.employeeId || r.approver_id === a.employeeId || a.orgAdmin)) throw fail(404, 'Vacation request not found.');
    return vacationView(r, a);
  }
  function myVacations(a) {
    const me = requireEmployee(a);
    return db.prepare('SELECT * FROM vacation_requests WHERE tenant_id = ? AND employee_id = ? ORDER BY start_date DESC, submitted_at DESC LIMIT 200').all(T, me).map(r => vacationView(r, a));
  }
  function approvals(a) {
    const me = requireEmployee(a), reports = directReports(me), from = W.addDays(utcToday(), -30), to = W.addDays(utcToday(), 180);
    const pending = db.prepare("SELECT * FROM vacation_requests WHERE tenant_id = ? AND approver_id = ? AND status = 'pending' ORDER BY start_date").all(T, me).map(r => vacationView(r, a));
    const decided = db.prepare("SELECT * FROM vacation_requests WHERE tenant_id = ? AND approver_id = ? AND status <> 'pending' AND decided_at >= ? ORDER BY decided_at DESC LIMIT 50").all(T, me, W.addDays(utcToday(), -90) + 'T').map(r => vacationView(r, a));
    const absences = reports.length ? db.prepare(`SELECT * FROM vacation_requests WHERE tenant_id = ? AND kind IN ('new','change') AND status IN ('approved','pending') AND end_date >= ? AND start_date <= ? AND employee_id IN (${reports.map(() => '?').join(',')}) ORDER BY start_date`).all(T, from, to, ...reports).map(r => vacationView(r, a)) : [];
    return { pending, decided, absences, reports: reports.map(id => ({ id, name: org().name(id) })) };
  }
  /** The team calendar: managers see their reports' pending and approved time off; everyone sees
   *  confirmed absence dates of their manager, peers and reports, without notes. */
  function team(a, { from, to }) {
    const me = requireEmployee(a);
    validDate(from); validDate(to);
    if (to < from || W.daysBetween(from, to) > 62) throw fail(400, 'Choose a range of up to two months.');
    const view = org(), manager = approverFor(me), reports = directReports(me);
    const peers = manager ? directReports(manager).filter(id => id !== me) : [];
    const members = [{ id: me, relation: 'you' }, ...(manager ? [{ id: manager, relation: 'manager' }] : []), ...peers.map(id => ({ id, relation: 'colleague' })), ...reports.map(id => ({ id, relation: 'report' }))]
      .filter((m, i, all) => all.findIndex(x => x.id === m.id) === i).map(m => ({ ...m, name: view.name(m.id) }));
    const tentative = new Set([me, ...reports]);
    const rows = db.prepare(`SELECT * FROM vacation_requests WHERE tenant_id = ? AND kind IN ('new','change') AND status IN ('approved','pending') AND end_date >= ? AND start_date <= ? AND employee_id IN (${members.map(() => '?').join(',')})`).all(T, from, to, ...members.map(m => m.id));
    const absences = rows.filter(r => r.status === 'approved' || tentative.has(r.employee_id)).map(r => ({ employeeId: r.employee_id, start: r.start_date, end: r.end_date, status: r.status, ...(r.employee_id === me || reports.includes(r.employee_id) ? { id: r.id } : {}) }));
    return { from, to, members, absences, isManager: reports.length > 0 };
  }

  // ---- My week ----------------------------------------------------------------------------------
  function me(a) {
    const out = { notice: W.FULL_DAY_NOTICE, offices: offices(), workplaceAdmin: a.workplaceAdmin, orgAdmin: a.orgAdmin, orgAccess: a.orgAccess, linked: false, unread: notifications(a).unread, bookingDays: cfg.bookingDays };
    if (!a.employeeId || !org().person(a.employeeId)) return { ...out, today: W.todayIn(cfg.defaultTimezone, now()), timezone: cfg.defaultTimezone };
    const home = homeOfficeId(a.employeeId), seat = org().deskOf(a.employeeId, utcToday());
    return { ...out, linked: true, employee: { id: a.employeeId, name: org().name(a.employeeId) }, homeOfficeId: home, timezone: home ? tzOf(home) : cfg.defaultTimezone, today: employeeToday(a.employeeId), pattern: pattern(a.employeeId), desk: seat ? { id: seat.desk.id, label: seat.desk.label, roomName: seat.room.name } : null, approver: (id => id ? { id, name: org().name(id) } : null)(approverFor(a.employeeId)), isManager: directReports(a.employeeId).length > 0 };
  }
  function week(a, { start, days = 7 }) {
    const id = requireEmployee(a);
    validDate(start);
    const n = Math.max(1, Math.min(31, Number(days) || 7)), today = employeeToday(id), view = org(), names = new Map(offices().map(o => [o.id, o.name]));
    const out = [];
    for (const d of W.dateRange(start, W.addDays(start, n - 1))) {
      const plan = plansOn(d)(id), res = db.prepare("SELECT * FROM reservations WHERE tenant_id = ? AND employee_id = ? AND date = ? ORDER BY status = 'confirmed' DESC, cancelled_at DESC").all(T, id, d);
      const active = res.find(r => r.status === 'confirmed'), attention = [];
      for (const c of ownConflicts(id, [d])) attention.push({ kind: 'seat-conflict', conflictId: c.id, message: `A visitor has a confirmed reservation for your desk ${c.deskLabel}. Choose another desk or ask a workplace administrator.` });
      const lost = res.find(r => r.status !== 'confirmed' && !r.location_confirmed);
      if (lost && !active && d >= today) attention.push({ kind: lost.status === 'displaced' ? 'reservation-displaced' : 'confirm-location', reservationId: lost.id, message: lost.status === 'displaced' ? 'Your desk reservation was displaced (' + lost.cancel_reason + '). Choose another desk and confirm where you will work.' : 'Your desk reservation was cancelled. Confirm where you will work.' });
      if (active && plan.location !== W.officeLocation(active.office_id) && plan.location !== 'vacation') attention.push({ kind: 'reservation-mismatch', reservationId: active.id, message: 'You still hold a desk reservation on this day. Cancel it if you no longer need it.' });
      const seat = view.deskOf(id, d), lent = seat ? db.prepare("SELECT id FROM reservations WHERE tenant_id = ? AND desk_id = ? AND date = ? AND status = 'confirmed'").get(T, seat.desk.id, d) : null;
      out.push({
        date: d, weekday: W.weekday(d), isToday: d === today, past: d < today, location: plan.location, source: plan.source,
        officeName: plan.location.startsWith('office:') ? names.get(plan.location.slice(7)) || 'Unknown office' : '',
        vacation: plan.location === 'vacation' ? { id: plan.vacationId, status: 'approved' } : plan.pendingVacation ? { id: plan.pendingVacation, status: 'pending' } : null,
        reservation: active ? reservationView(active, a) : null, deskLent: Boolean(lent), attention
      });
    }
    return { start, today, days: out, pattern: pattern(id) };
  }

  // ---- Administration -------------------------------------------------------------------------------
  function upsertOffice(a, { id, name, timezone }) {
    requireWorkplaceAdmin(a);
    const label = text(name, 'Office name', 80);
    if (!label) throw fail(400, 'Office name is required.');
    if (!W.validTimezone(timezone)) throw fail(400, 'Choose a valid IANA time zone such as Europe/Zurich.');
    const officeId = id ? String(id) : 'office-' + crypto.randomUUID().slice(0, 8);
    if (!ID.test(officeId)) throw fail(400, 'Invalid office ID.');
    return tx(() => {
      db.prepare('INSERT INTO offices (tenant_id, id, name, timezone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, id) DO UPDATE SET name = excluded.name, timezone = excluded.timezone, updated_at = excluded.updated_at').run(T, officeId, label, timezone, nowIso(), nowIso());
      store.audit({ userId: a.userId, action: 'workplace.office.save', detail: { officeId, name: label, timezone } });
      return office(officeId);
    });
  }
  function deleteOffice(a, id) {
    requireWorkplaceAdmin(a);
    return tx(() => {
      if (db.prepare('SELECT 1 FROM office_rooms WHERE tenant_id = ? AND office_id = ?').get(T, id)) throw fail(409, 'Move or unassign this office’s rooms first.');
      db.prepare('DELETE FROM offices WHERE tenant_id = ? AND id = ?').run(T, id);
      store.audit({ userId: a.userId, action: 'workplace.office.delete', detail: { officeId: id } });
      return { ok: true };
    });
  }
  function futureReservations(where, params) {
    return db.prepare(`SELECT * FROM reservations WHERE tenant_id = ? AND status = 'confirmed' AND date >= ? AND ${where} ORDER BY date`).all(T, W.addDays(utcToday(), -1), ...params);
  }
  function affected(rows, a, reason) { return rows.map(r => ({ ...reservationView(r, a), reason })); }
  function setRoomOffice(a, roomId, { officeId, confirm }) {
    requireWorkplaceAdmin(a);
    if (!org().seating.rooms.some(r => r.id === roomId)) throw fail(404, 'Room not found.');
    if (officeId && !office(officeId)) throw fail(400, 'Unknown office.');
    return tx(() => {
      const before = roomOffices().get(roomId) || '';
      if (before === (officeId || '')) return { ok: true };
      const hit = futureReservations('room_id = ?', [roomId]);
      if (hit.length && !confirm) throw fail(409, `${hit.length} confirmed reservation(s) in this room would be displaced.`, { code: 'reservations_affected', reservations: affected(hit, a, 'room-moved') });
      if (officeId) db.prepare('INSERT INTO office_rooms (tenant_id, room_id, office_id) VALUES (?, ?, ?) ON CONFLICT(tenant_id, room_id) DO UPDATE SET office_id = excluded.office_id').run(T, roomId, officeId);
      else db.prepare('DELETE FROM office_rooms WHERE tenant_id = ? AND room_id = ?').run(T, roomId);
      for (const r of hit) displace(r, 'room moved to another office', a.userId);
      store.audit({ userId: a.userId, action: 'workplace.room.office', detail: { roomId, officeId: officeId || '', displaced: hit.length } });
      reconcile();
      return { ok: true, displaced: hit.length };
    });
  }
  /** Sharing applies to chosen desks or a whole room. Turning it off keeps confirmed reservations. */
  function setSharing(a, { deskIds, roomId, enabled, equipment }) {
    requireWorkplaceAdmin(a);
    const view = org();
    let ids = Array.isArray(deskIds) ? deskIds.map(String) : [];
    if (roomId) { const room = view.seating.rooms.find(r => r.id === roomId); if (!room) throw fail(404, 'Room not found.'); ids = room.desks.map(d => d.id); }
    if (!ids.length || ids.length > 5000) throw fail(400, 'Choose desks or a room.');
    for (const id of ids) if (!view.findDesk(id)) throw fail(404, `Desk ${id} not found.`);
    const kit = equipment === undefined ? null : text(equipment, 'Equipment', 200);
    return tx(() => {
      for (const id of ids) {
        if (enabled === false) db.prepare('DELETE FROM desk_sharing WHERE tenant_id = ? AND desk_id = ?').run(T, id);
        else if (enabled === true || kit !== null) db.prepare(`INSERT INTO desk_sharing (tenant_id, desk_id, equipment, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, desk_id) DO UPDATE SET ${kit === null ? '' : 'equipment = excluded.equipment, '}updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(T, id, kit || '', a.userId, nowIso());
      }
      const kept = enabled === false ? futureReservations(`desk_id IN (${ids.map(() => '?').join(',')})`, ids).length : 0;
      store.audit({ userId: a.userId, action: 'workplace.sharing', detail: { desks: ids.length, roomId: roomId || '', enabled, equipment: kit } });
      return { ok: true, desks: ids.length, keptReservations: kept };
    });
  }
  function createClosure(a, { officeId, roomId = '', deskId = '', start, end, reason, confirm }) {
    requireWorkplaceAdmin(a);
    if (!office(officeId)) throw fail(400, 'Unknown office.');
    validDate(start, 'Start date'); validDate(end, 'End date');
    if (end < start || W.daysBetween(start, end) > 366) throw fail(400, 'Choose a closure of at most a year.');
    const note = text(reason, 'Reason', 200);
    return tx(() => {
      const params = [start, end, officeId], where = ['date BETWEEN ? AND ?', 'office_id = ?'];
      if (roomId) { where.push('room_id = ?'); params.push(roomId); }
      if (deskId) { where.push('desk_id = ?'); params.push(deskId); }
      const hit = futureReservations(where.join(' AND '), params);
      if (hit.length && !confirm) throw fail(409, `${hit.length} confirmed reservation(s) fall inside this closure.`, { code: 'reservations_affected', reservations: affected(hit, a, 'closure') });
      const id = newId('cls');
      db.prepare('INSERT INTO closures (id, tenant_id, office_id, room_id, desk_id, start_date, end_date, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, T, officeId, roomId, deskId, start, end, note, a.userId, nowIso());
      for (const r of hit) displace(r, 'closure' + (note ? ': ' + note : ''), a.userId);
      store.audit({ userId: a.userId, action: 'workplace.closure.create', detail: { closureId: id, officeId, roomId, deskId, start, end, displaced: hit.length } });
      reconcile();
      return { id, displaced: hit.length };
    });
  }
  function deleteClosure(a, id) {
    requireWorkplaceAdmin(a);
    return tx(() => {
      db.prepare('DELETE FROM closures WHERE tenant_id = ? AND id = ?').run(T, id);
      store.audit({ userId: a.userId, action: 'workplace.closure.delete', detail: { closureId: id } });
      return { ok: true };
    });
  }
  function setApprover(a, { employeeId, approverId }) {
    requireOrgAdmin(a);
    const view = org();
    if (!view.person(employeeId)) throw fail(404, 'Employee not found.');
    if (approverId && !view.person(approverId)) throw fail(404, 'Approver not found.');
    if (approverId === employeeId) throw fail(400, 'Employees cannot approve their own vacation.');
    return tx(() => {
      if (approverId) db.prepare('INSERT INTO approver_overrides (tenant_id, employee_id, approver_id, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tenant_id, employee_id) DO UPDATE SET approver_id = excluded.approver_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at').run(T, employeeId, approverId, a.userId, nowIso());
      else db.prepare('DELETE FROM approver_overrides WHERE tenant_id = ? AND employee_id = ?').run(T, employeeId);
      store.audit({ userId: a.userId, action: 'workplace.approver.override', detail: { employeeId, approverId: approverId || '' } });
      reroute();
      return { employeeId, approverId: approverFor(employeeId), derived: view.derivedManager(employeeId, employeeToday(employeeId)), overridden: Boolean(approverId) };
    });
  }
  function directory(a, q) {
    if (!a.workplaceAdmin && !a.orgAdmin) throw fail(403, 'The directory search is for administrators.');
    const needle = String(q || '').trim().toLowerCase();
    return [...org().employees.values()].filter(e => !needle || e.name.toLowerCase().includes(needle) || String(e.employeeNumber || '').toLowerCase().includes(needle) || e.id.toLowerCase() === needle).slice(0, 50).map(e => ({ id: e.id, name: e.name, employeeNumber: e.employeeNumber || '' }));
  }
  function adminOverview(a) {
    if (!a.workplaceAdmin && !a.orgAdmin) throw fail(403, 'Administrators only.');
    const view = org(), map = roomOffices(), sharing = new Map(db.prepare('SELECT desk_id, equipment FROM desk_sharing WHERE tenant_id = ?').all(T).map(r => [r.desk_id, r.equipment])), d = utcToday();
    const out = { offices: offices(), timezones: typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [], workplaceAdmin: a.workplaceAdmin, orgAdmin: a.orgAdmin };
    if (a.workplaceAdmin) {
      out.rooms = view.seating.rooms.map(r => ({ id: r.id, name: r.name, floor: r.floor, officeId: map.get(r.id) || '', desks: r.desks.map(desk => ({ id: desk.id, label: desk.label, assigned: Boolean(desk.positionId && !desk.hotDesk), ownerName: view.name(ownerOf(view, desk, d)), shared: sharing.has(desk.id), equipment: sharing.get(desk.id) || '' })) }));
      out.closures = db.prepare('SELECT * FROM closures WHERE tenant_id = ? AND end_date >= ? ORDER BY start_date').all(T, d).map(c => ({ id: c.id, officeId: c.office_id, roomId: c.room_id, deskId: c.desk_id, start: c.start_date, end: c.end_date, reason: c.reason }));
      out.conflicts = conflicts(a).filter(c => c.status === 'open');
    }
    if (a.orgAdmin) {
      const over = overrides();
      out.approvers = [...view.employees.values()].filter(e => view.positionOf(e.id, d)).map(e => ({ employeeId: e.id, name: e.name, derivedId: view.derivedManager(e.id, d), derivedName: view.name(view.derivedManager(e.id, d)), overrideId: over.get(e.id) || '', overrideName: view.name(over.get(e.id) || '') })).sort((x, y) => x.name.localeCompare(y.name));
    }
    return out;
  }

  // ---- Workspace saves: identify affected reservations before Current or seating changes complete ----
  function workspaceImpact(prevDoc, nextDoc) {
    const before = createOrgView(prevDoc), after = createOrgView(nextDoc), map = roomOffices(), out = [];
    for (const r of futureReservations('1 = 1', [])) {
      const b = before.findDesk(r.desk_id), n = after.findDesk(r.desk_id);
      if (!n) { out.push({ r, reason: 'desk-removed' }); continue; }
      if ((map.get(n.room.id) || '') !== r.office_id) { out.push({ r, reason: 'desk-moved' }); continue; }
      if ((b ? ownerOf(before, b.desk, r.date) : '') !== ownerOf(after, n.desk, r.date)) out.push({ r, reason: 'owner-changed' });
    }
    return out;
  }
  function checkWorkspaceChange(prevDoc, nextDoc, acknowledged) {
    const impact = workspaceImpact(prevDoc, nextDoc);
    if (impact.length && !acknowledged) {
      throw fail(409, `This change affects ${impact.length} confirmed desk reservation(s). Review them and confirm to continue.`, { code: 'reservations_affected', reservations: impact.map(x => ({ date: x.r.date, deskId: x.r.desk_id, officeName: office(x.r.office_id)?.name || '', reason: x.reason })) });
    }
    return impact;
  }
  function applyWorkspaceChange(impact, userId) {
    orgCache = null;
    tx(() => {
      for (const x of impact) if (x.reason !== 'owner-changed') displace(x.r, x.reason === 'desk-removed' ? 'desk removed from the seating plan' : 'desk moved to another office', userId);
      if (impact.length) store.audit({ userId, action: 'workplace.reservations.reviewed', detail: { affected: impact.length } });
      reconcile();
    });
    hooks.afterNotify();
  }

  function prune() {
    const today = utcToday(), schedule = W.addDays(today, -cfg.scheduleRetentionDays), vacation = W.addDays(today, -cfg.vacationRetentionDays);
    const notices = new Date(now().getTime() - cfg.notificationRetentionDays * 86400000).toISOString();
    db.prepare('DELETE FROM work_days WHERE tenant_id = ? AND date < ?').run(T, schedule);
    db.prepare('DELETE FROM reservations WHERE tenant_id = ? AND date < ?').run(T, schedule);
    db.prepare('DELETE FROM seat_conflicts WHERE tenant_id = ? AND date < ?').run(T, schedule);
    db.prepare('DELETE FROM closures WHERE tenant_id = ? AND end_date < ?').run(T, schedule);
    db.prepare('DELETE FROM vacation_requests WHERE tenant_id = ? AND end_date < ?').run(T, vacation);
    db.prepare('DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE tenant_id = ? AND created_at < ?)').run(T, notices);
    db.prepare('DELETE FROM notifications WHERE tenant_id = ? AND created_at < ?').run(T, notices);
  }

  return {
    hooks, cfg, actor, me, week, setDays, setPattern, officeMap, availability, book, cancelReservation, myReservations, listReservations,
    conflicts, alternatives, resolveConflict, submitVacation, changeVacation, cancelVacation, decideVacation, getVacation, myVacations, approvals, team,
    notifications, markRead, upsertOffice, deleteOffice, setRoomOffice, setSharing, createClosure, deleteClosure, setApprover, directory, adminOverview,
    checkWorkspaceChange, applyWorkspaceChange, reconcile: () => tx(reconcile), prune, offices, approverFor, org, userForEmployee
  };
}

module.exports = { createWorkplace, settings, fail };
