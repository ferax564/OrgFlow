'use strict';
/** /api/workplace/* — the same routes serve the browser screens and the Teams tab. */

function routes(wp) {
  const table = [
    ['GET', /^\/api\/workplace\/me$/, a => wp.me(a)],
    ['GET', /^\/api\/workplace\/week$/, (a, m, q) => wp.week(a, { start: q.get('start'), days: q.get('days') })],
    ['PUT', /^\/api\/workplace\/days$/, (a, m, q, b) => wp.setDays(a, b)],
    ['PUT', /^\/api\/workplace\/pattern$/, (a, m, q, b) => wp.setPattern(a, b)],
    ['GET', /^\/api\/workplace\/offices$/, () => ({ offices: wp.offices() })],
    ['GET', /^\/api\/workplace\/offices\/([^/]+)\/map$/, (a, m, q) => wp.officeMap(a, m[1], q.get('date'), { plans: q.get('plans') !== '0' })],
    ['GET', /^\/api\/workplace\/availability$/, (a, m, q) => wp.availability(a, q.get('date'))],
    ['GET', /^\/api\/workplace\/reservations$/, (a, m, q) => ({ reservations: q.get('scope') === 'admin' ? wp.listReservations(a, { officeId: q.get('office') || '', from: q.get('from'), to: q.get('to') }) : wp.myReservations(a) })],
    ['POST', /^\/api\/workplace\/reservations$/, (a, m, q, b) => wp.book(a, b), 201],
    ['POST', /^\/api\/workplace\/reservations\/([^/]+)\/cancel$/, (a, m, q, b) => wp.cancelReservation(a, m[1], b)],
    ['GET', /^\/api\/workplace\/conflicts$/, a => ({ conflicts: wp.conflicts(a) })],
    ['GET', /^\/api\/workplace\/conflicts\/([^/]+)\/alternatives$/, (a, m) => wp.alternatives(a, m[1])],
    ['POST', /^\/api\/workplace\/conflicts\/([^/]+)\/resolve$/, (a, m, q, b) => wp.resolveConflict(a, m[1], b)],
    ['GET', /^\/api\/workplace\/vacations$/, a => ({ requests: wp.myVacations(a) })],
    ['POST', /^\/api\/workplace\/vacations$/, (a, m, q, b) => wp.submitVacation(a, b), 201],
    ['GET', /^\/api\/workplace\/vacations\/([^/]+)$/, (a, m) => wp.getVacation(a, m[1])],
    ['PATCH', /^\/api\/workplace\/vacations\/([^/]+)$/, (a, m, q, b) => wp.changeVacation(a, m[1], b)],
    ['POST', /^\/api\/workplace\/vacations\/([^/]+)\/cancel$/, (a, m, q, b) => wp.cancelVacation(a, m[1], b)],
    ['POST', /^\/api\/workplace\/vacations\/([^/]+)\/decision$/, (a, m, q, b) => wp.decideVacation(a, m[1], b)],
    ['GET', /^\/api\/workplace\/approvals$/, a => wp.approvals(a)],
    ['GET', /^\/api\/workplace\/team$/, (a, m, q) => wp.team(a, { from: q.get('from'), to: q.get('to') })],
    ['GET', /^\/api\/workplace\/notifications$/, a => wp.notifications(a)],
    ['POST', /^\/api\/workplace\/notifications\/read$/, (a, m, q, b) => wp.markRead(a, b.ids === 'all' ? 'all' : b.ids)],
    ['GET', /^\/api\/workplace\/directory$/, (a, m, q) => ({ people: wp.directory(a, q.get('q')) })],
    ['GET', /^\/api\/workplace\/admin$/, a => wp.adminOverview(a)],
    ['PUT', /^\/api\/workplace\/admin\/offices$/, (a, m, q, b) => wp.upsertOffice(a, b)],
    ['DELETE', /^\/api\/workplace\/admin\/offices\/([^/]+)$/, (a, m) => wp.deleteOffice(a, m[1])],
    ['PUT', /^\/api\/workplace\/admin\/rooms\/([^/]+)\/office$/, (a, m, q, b) => wp.setRoomOffice(a, m[1], b)],
    ['PUT', /^\/api\/workplace\/admin\/sharing$/, (a, m, q, b) => wp.setSharing(a, b)],
    ['POST', /^\/api\/workplace\/admin\/closures$/, (a, m, q, b) => wp.createClosure(a, b), 201],
    ['DELETE', /^\/api\/workplace\/admin\/closures\/([^/]+)$/, (a, m) => wp.deleteClosure(a, m[1])],
    ['PUT', /^\/api\/workplace\/admin\/approvers$/, (a, m, q, b) => wp.setApprover(a, b)]
  ];
  return async function handle(req, res, { ident, url, send, readJson }) {
    const method = req.method || 'GET', p = url.pathname;
    for (const [verb, pattern, fn, status = 200] of table) {
      if (verb !== method) continue;
      const match = p.match(pattern);
      if (!match) continue;
      const decoded = match.map((x, i) => (i ? decodeURIComponent(x) : x));
      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(method)) { body = await readJson(req, res, 64 * 1024); if (!body) return true; }
      try {
        send(res, status, fn(wp.actor(ident), decoded, url.searchParams, body));
      } catch (error) {
        if (!error.status) throw error;
        send(res, error.status, { error: error.message, ...(error.extra || {}) });
      }
      return true;
    }
    send(res, 404, { error: 'Unknown workplace route.' });
    return true;
  };
}

module.exports = { routes };
