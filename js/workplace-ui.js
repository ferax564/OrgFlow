/** Workplace screens: My week, Vacation, Book a desk, Team, Approvals and Workplace admin.
 *  The same page runs in a browser and as the Microsoft Teams personal tab. The server decides every
 *  permission; this file only shows what the API returns. */
(function () {
  'use strict';
  const W = window.OrgFlowWorkplace, S = window.OrgFlowSeating;
  const TOKEN_KEY = 'orgflow.teams.session';
  const st = { session: null, me: null, tab: 'week', focus: '', weekStart: '', bookDate: '', bookOffice: '', bookFor: '', selectedDesk: '', map: null, teamFrom: '', teams: null, token: '', confirm: null };
  const $ = s => document.querySelector(s);
  const view = () => $('#view');
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function readToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return st.token; } }
  function saveToken(value) { st.token = value || ''; try { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* the in-memory copy is enough */ } }
  let toastTimer = null;
  function toast(message) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = message; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }
  function setStatus(html) { $('#status').innerHTML = html; }

  // ---- Server access ----------------------------------------------------------------------------
  async function api(path, { method = 'GET', body, retried = false } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = st.token || readToken();
    if (token) headers['x-orgflow-session'] = token;
    const res = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !retried) {
      if (st.teams) { saveToken(''); await teamsSignIn(); return api(path, { method, body, retried: true }); }
      location.href = '/auth/login?return=' + encodeURIComponent('/workplace.html' + location.hash);
      throw new Error('Signing in…');
    }
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText || 'Request failed.'), { status: res.status, data });
    return data;
  }

  // ---- Microsoft Teams --------------------------------------------------------------------------
  const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })() || /[?&]teams=1\b/.test(location.search);
  function loadScript(src) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.append(s); }); }
  async function initTeams() {
    if (!embedded) return null;
    try {
      if (!window.microsoftTeams) await loadScript('js/vendor/MicrosoftTeams.min.js');
      const sdk = window.microsoftTeams;
      await Promise.race([sdk.app.initialize(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))]);
      const context = await sdk.app.getContext();
      applyTheme(context.app?.theme);
      sdk.app.registerOnThemeChangeHandler(applyTheme);
      const sub = context.page?.subPageId;
      if (sub && !location.hash) history.replaceState(null, '', '#' + sub);
      return sdk;
    } catch { return null; }
  }
  function applyTheme(theme) { document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : theme === 'contrast' ? 'contrast' : 'light'; }
  /** Silent single sign-on first; a sign-in pop-up when the embedded session cannot be established. */
  async function teamsSignIn() {
    if (readToken()) return;
    try {
      const token = await st.teams.authentication.getAuthToken();
      const res = await fetch('/auth/teams/sso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { saveToken(data.sessionToken); return; }
      if (res.status === 403) throw Object.assign(new Error(data.error), { final: true });
    } catch (error) { if (error.final) throw error; }
    await new Promise((resolve, reject) => {
      view().innerHTML = `<div class="card signin"><h2>Sign in to OrgFlow</h2><p class="muted">Teams could not sign you in automatically. Continue with your company account in a pop-up window.</p><button class="btn primary" id="popupSignIn">Sign in</button><p class="err hidden" id="popupError"></p></div>`;
      $('#popupSignIn').onclick = async () => {
        try {
          const result = await st.teams.authentication.authenticate({ url: location.origin + '/teams/auth-start.html', width: 600, height: 560 });
          saveToken(result); resolve();
        } catch (error) { const el = $('#popupError'); el.classList.remove('hidden'); el.textContent = 'Sign-in did not complete (' + (error.message || error) + '). Try again or open OrgFlow in your browser.'; if (/denied|not a member/i.test(String(error.message))) reject(error); }
      };
    });
  }

  // ---- Labels -----------------------------------------------------------------------------------
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const REASONS = {
    'owner-away': 'The owner is away; you can borrow it.', 'shared-desk': 'Shared desk.', protected: 'Kept for its owner on this day.',
    'owner-remote': 'Owner works remotely.', 'owner-other-office': 'Owner works in another office.', 'owner-vacation': 'Owner is on approved vacation.',
    'owner-in-office': 'Owner works here this day.', 'owner-no-plan': 'Owner has no plan entered, so the desk stays protected.', 'owner-pending-vacation': 'Owner’s vacation is not approved yet, so the desk stays protected.',
    vacant: 'Assigned to a vacant position; not shared.', 'not-shared': 'Not enabled for sharing.', closed: 'Closed on this day.', 'no-office': 'Not in a bookable office.', reserved: 'Reserved by a visitor.'
  };
  function fmtDate(d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) { return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' }); }
  function fmtRange(a, b) { return a === b ? fmtDate(a) : fmtDate(a) + ' – ' + fmtDate(b); }
  function officeName(id) { return st.me.offices.find(o => o.id === id)?.name || 'Unknown office'; }
  function locationLabel(loc) { return loc === 'remote' ? 'Remote' : loc === 'none' ? 'No plan' : loc === 'vacation' ? 'On vacation' : loc?.startsWith('office:') ? officeName(loc.slice(7)) : 'No plan'; }
  function locationOptions(selected, { none = false, blank = '' } = {}) {
    return (blank ? `<option value="">${esc(blank)}</option>` : '') + st.me.offices.map(o => `<option value="office:${esc(o.id)}" ${selected === 'office:' + o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')
      + `<option value="remote" ${selected === 'remote' ? 'selected' : ''}>Remote</option>` + (none ? `<option value="none" ${selected === 'none' ? 'selected' : ''}>No plan entered</option>` : '');
  }
  const STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', confirmed: 'Confirmed', displaced: 'Displaced', open: 'Needs action', resolved: 'Resolved' };
  const chip = s => `<span class="chip ${esc(s)}">${esc(STATUS[s] || W.STATE_LABELS[s] || s)}</span>`;

  // ---- Navigation -------------------------------------------------------------------------------
  function parseHash() {
    const [tab, a, b] = decodeURIComponent(location.hash.slice(1)).split('/');
    if (tab === 'week' && W.isDate(a)) st.weekStart = W.mondayOf(a);
    if (tab === 'book') { if (a) st.bookOffice = a; if (W.isDate(b)) st.bookDate = b; }
    if (tab === 'conflict') return { tab: 'conflict', id: a };
    if (tab === 'admin' && a === 'reservations' && W.isDate(b)) { st.adminDate = b; }
    return { tab: ['week', 'vacation', 'book', 'team', 'approvals', 'admin'].includes(tab) ? tab : 'week', id: tab === 'vacation' || tab === 'approvals' ? a || '' : '' };
  }
  async function route() {
    const r = parseHash();
    if (r.tab === 'conflict') {
      const list = await api('/api/workplace/conflicts').catch(() => ({ conflicts: [] }));
      const c = list.conflicts.find(x => x.id === r.id);
      if (c && st.me.workplaceAdmin && !c.mineAsOwner) { st.focus = c.id; return show('admin', false); }
      if (c) st.weekStart = W.mondayOf(c.date);
      return show('week', false);
    }
    st.focus = r.id;
    return show(r.tab, false);
  }
  async function show(tab, updateHash = true) {
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (!btn || btn.hidden) tab = 'week';
    st.tab = tab;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (updateHash) history.replaceState(null, '', '#' + tab);
    setStatus('');
    view().innerHTML = '<p class="muted">Loading…</p>';
    try { await ({ week: renderWeek, vacation: renderVacation, book: renderBook, team: renderTeam, approvals: renderApprovals, admin: renderAdmin })[tab](); }
    catch (error) { view().innerHTML = `<div class="card"><p class="err">${esc(error.message)}</p>${error.data?.code === 'not_linked' ? '<p class="muted">An OrgFlow administrator links your account to your employee record on the Admin page.</p>' : ''}</div>`; }
  }

  // ---- My week ----------------------------------------------------------------------------------
  async function renderWeek() {
    if (!st.me.linked) throw Object.assign(new Error('Your account is not linked to an employee record yet. Ask an OrgFlow administrator to link it.'), { data: { code: 'not_linked' } });
    st.weekStart ||= W.mondayOf(st.me.today);
    const data = await api('/api/workplace/week?start=' + st.weekStart);
    const pattern = data.pattern || {};
    view().innerHTML = `<div class="card">
      <div class="week-head"><h2>Week of ${esc(fmtDate(st.weekStart, { day: 'numeric', month: 'long', year: 'numeric' }))}</h2>
        <button class="btn small" data-act="week-prev" aria-label="Previous week">‹</button><button class="btn small" data-act="week-today">This week</button><button class="btn small" data-act="week-next" aria-label="Next week">›</button></div>
      <p class="muted small">${st.me.desk ? `Your desk: <b>${esc(st.me.desk.label || 'desk')}</b> · ${esc(st.me.desk.roomName)}${st.me.homeOfficeId ? ' · ' + esc(officeName(st.me.homeOfficeId)) : ''}. When you are confirmed away, colleagues may borrow it if sharing is enabled. Missing plans keep it protected.` : 'You have no assigned desk. Book one under “Book a desk”.'} Dates follow ${esc(st.me.timezone)}.</p>
      <div class="days">${data.days.map(dayCard).join('')}</div></div>
      <div class="card"><h2>Weekly pattern</h2><p class="muted small">Repeats every week. A choice on a specific day wins over the pattern; approved vacation wins over both.</p>
        <form id="patternForm"><div class="pattern">${WD.map((name, i) => `<label>${name}<select name="${i + 1}">${locationOptions(pattern[i + 1] || '', { blank: 'No plan' })}</select></label>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn primary" type="submit">Save pattern</button></div></form></div>`;
    $('#patternForm').onsubmit = async e => {
      e.preventDefault();
      const weekdays = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, v]));
      try { const r = await api('/api/workplace/pattern', { method: 'PUT', body: { weekdays } }); toast(r.conflicts.length ? 'Pattern saved. A visitor has your desk on some days; see the highlighted days.' : 'Weekly pattern saved.'); renderWeek(); } catch (error) { toast(error.message); }
    };
  }
  function dayCard(d) {
    const pat = st.me.pattern?.[d.weekday];
    const value = d.source === 'day' ? d.location : 'clear';
    const select = d.location === 'vacation' ? '<p class="vac">On approved vacation</p>' : `<label class="sr-only" for="loc-${d.date}">Location on ${esc(fmtDate(d.date))}</label><select id="loc-${d.date}" data-day="${d.date}" ${d.past ? 'disabled' : ''}>
        <option value="clear" ${value === 'clear' ? 'selected' : ''}>${pat ? '↻ ' + esc(locationLabel(pat)) : 'No plan entered'}</option>
        ${st.me.offices.map(o => `<option value="office:${esc(o.id)}" ${value === 'office:' + o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
        <option value="remote" ${value === 'remote' ? 'selected' : ''}>Remote</option>${pat ? `<option value="none" ${value === 'none' ? 'selected' : ''}>No plan (skip pattern)</option>` : ''}</select>`;
    const res = d.reservation ? `<div class="res"><b>Desk ${esc(d.reservation.deskLabel)}</b><br>${esc(d.reservation.officeName)} · ${esc(d.reservation.roomName)}${d.reservation.onBehalf ? '<br><span class="small muted">Booked by a workplace administrator</span>' : ''}<br><button class="btn small" data-act="cancel-res" data-id="${esc(d.reservation.id)}" data-date="${d.date}">Cancel reservation</button></div>` : '';
    const vac = d.vacation && d.location !== 'vacation' ? `<p class="vac ${d.vacation.status}">Vacation ${d.vacation.status === 'pending' ? 'pending approval' : ''}</p>` : '';
    const attn = d.attention.map(a => `<div class="attn" role="alert">${esc(a.message)}${a.kind === 'seat-conflict' || a.kind === 'reservation-displaced' ? `<br><button class="btn small" data-act="find-desk" data-date="${d.date}">Find another desk</button>` : ''}${a.kind === 'confirm-location' || a.kind === 'reservation-displaced' ? `<br><button class="btn small" data-act="focus-day" data-date="${d.date}">Confirm location</button>` : ''}</div>`).join('');
    return `<article class="day${d.isToday ? ' today' : ''}${d.past ? ' past' : ''}" aria-label="${esc(fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <header><b>${WD[d.weekday - 1]}</b><span>${esc(fmtDate(d.date, { day: 'numeric', month: 'short' }))}${d.isToday ? ' · today' : ''}</span></header>
      ${select}<span class="src">${d.source === 'pattern' ? 'From weekly pattern' : d.source === 'day' ? 'Set for this day' : d.source === 'vacation' ? '' : 'Desk stays protected'}</span>
      ${vac}${res}${d.deskLent ? '<p class="lent">A visitor has booked your desk this day.</p>' : ''}${attn}</article>`;
  }

  // ---- Vacation ---------------------------------------------------------------------------------
  async function renderVacation() {
    if (!st.me.linked) throw Object.assign(new Error('Your account is not linked to an employee record yet.'), { data: { code: 'not_linked' } });
    const { requests } = await api('/api/workplace/vacations');
    const today = st.me.today;
    view().innerHTML = `<div class="card"><h2>Request vacation</h2>
      <p class="muted small">${st.me.approver ? 'Your approver: <b>' + esc(st.me.approver.name) + '</b>.' : 'No approver is set for you yet; an OrgFlow administrator must assign one before you can submit.'} Requests cover whole days. Your note is visible only to you, your approver and OrgFlow administrators. Vacation balances are not tracked here.</p>
      <form id="vacForm" class="row"><label>First day<input type="date" name="start" min="${today}" required /></label><label>Last day<input type="date" name="end" min="${today}" required /></label>
      <label style="flex:1;min-width:200px">Private note (optional)<input name="note" maxlength="1000" /></label><button class="btn primary" type="submit">Submit request</button></form></div>
      <div class="card"><h2>Your requests</h2><div class="list">${requests.map(vacationItem).join('') || '<p class="empty">No vacation requests yet.</p>'}</div></div>`;
    $('#vacForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await api('/api/workplace/vacations', { method: 'POST', body: { start: fd.get('start'), end: fd.get('end'), note: fd.get('note') } }); toast('Request sent to your approver.'); renderVacation(); } catch (error) { toast(error.message); }
    };
    if (st.focus) document.getElementById('vac-' + st.focus)?.scrollIntoView({ block: 'center' });
  }
  function vacationItem(r) {
    const what = r.kind === 'cancel' ? `Cancel vacation ${fmtRange(r.start, r.end)}` : r.kind === 'change' ? `Change ${r.target ? fmtRange(r.target.start, r.target.end) : ''} → ${fmtRange(r.start, r.end)}` : `${fmtRange(r.start, r.end)} · ${r.days} day${r.days === 1 ? '' : 's'}`;
    const editable = r.kind !== 'cancel' && (r.status === 'pending' || (r.status === 'approved' && !r.pendingChange));
    const actions = [
      editable ? `<button class="btn small" data-act="vac-edit" data-id="${esc(r.id)}">Change dates</button>` : '',
      r.status === 'pending' ? `<button class="btn small danger" data-act="vac-cancel" data-id="${esc(r.id)}">Withdraw</button>` : '',
      r.status === 'approved' && r.kind !== 'cancel' && !r.pendingChange ? `<button class="btn small danger" data-act="vac-cancel" data-id="${esc(r.id)}">Request cancellation</button>` : ''
    ].join('');
    return `<div class="item${st.focus === r.id ? ' focus' : ''}" id="vac-${esc(r.id)}"><div class="what"><b>${esc(what)}</b>
      <span class="small muted">${r.approverName ? 'Approver ' + esc(r.approverName) + ' · ' : ''}submitted ${esc(r.submittedAt.slice(0, 10))}${r.decidedAt ? ' · decided ' + esc(r.decidedAt.slice(0, 10)) + (r.decidedBy ? ' by ' + esc(r.decidedBy) : '') : ''}</span>
      ${r.note ? `<span class="small">Note: ${esc(r.note)}</span>` : ''}${r.decisionNote ? `<span class="small">Approver note: ${esc(r.decisionNote)}</span>` : ''}
      ${r.pendingChange ? `<span class="small muted">A ${r.pendingChange.kind === 'cancel' ? 'cancellation' : 'date change'} is awaiting approval; these dates stay in force until then.</span>` : ''}</div>
      ${chip(r.status)}<div class="actions">${actions}</div><form class="row hidden" data-edit="${esc(r.id)}"><label>First day<input type="date" name="start" value="${r.start}" required></label><label>Last day<input type="date" name="end" value="${r.end}" required></label><button class="btn primary small" type="submit">${r.status === 'approved' ? 'Ask for approval' : 'Save new dates'}</button></form></div>`;
  }

  // ---- Book a desk ------------------------------------------------------------------------------
  async function renderBook() {
    const offices = st.me.offices;
    if (!offices.length) { view().innerHTML = '<div class="card"><p class="empty">No offices are set up for desk booking yet. A workplace administrator adds offices and assigns rooms to them.</p></div>'; return; }
    if (!offices.some(o => o.id === st.bookOffice)) st.bookOffice = offices.find(o => o.id !== st.me.homeOfficeId)?.id || offices[0].id;
    st.bookDate ||= st.me.today;
    const [map, mine] = await Promise.all([api(`/api/workplace/offices/${encodeURIComponent(st.bookOffice)}/map?date=${st.bookDate}`), st.me.linked ? api('/api/workplace/reservations') : { reservations: [] }]);
    st.map = map;
    const max = W.addDays(map.today, map.bookingDays);
    if (st.bookDate < map.today) { st.bookDate = map.today; return renderBook(); }
    const available = map.rooms.flatMap(r => r.desks.filter(d => d.state === 'available' && !d.mine).map(d => ({ ...d, room: r.name })));
    view().innerHTML = `<div class="card"><div class="row">
        <label>Office<select id="bookOffice">${offices.map(o => `<option value="${esc(o.id)}" ${o.id === st.bookOffice ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
        <label>Date<input type="date" id="bookDate" value="${st.bookDate}" min="${map.today}" max="${max}" /></label>
        ${st.me.workplaceAdmin ? `<label>Book for (administrators)<input id="bookFor" list="bookForList" placeholder="Myself" value="${esc(st.bookFor)}" autocomplete="off" /><datalist id="bookForList"></datalist></label>` : ''}
        <span class="spacer"></span><span class="muted small">Local date in ${esc(map.office.name)}: ${esc(map.office.timezone)} · today ${esc(fmtDate(map.today))}</span></div>
      <div class="legend" aria-label="Legend">${W.DESK_STATES.map(s => `<span><i class="${s}"></i>${esc(W.STATE_LABELS[s])}</span>`).join('')}<span>Thick outline: your own desk</span></div></div>
      <div class="book-layout"><div>${map.rooms.map(roomMap).join('') || '<div class="card"><p class="empty">This office has no rooms yet.</p></div>'}</div>
      <aside class="card desk-panel" id="deskPanel" aria-live="polite"></aside></div>
      <div class="card"><h2>Your upcoming reservations</h2><div class="list">${mine.reservations.map(r => `<div class="item"><div class="what"><b>${esc(fmtDate(r.date))} · Desk ${esc(r.deskLabel)}</b><span class="small muted">${esc(r.officeName)} · ${esc(r.roomName)}${r.equipment ? ' · ' + esc(r.equipment) : ''}${r.cancelReason ? ' · ' + esc(r.cancelReason) : ''}</span></div>${chip(r.status)}${r.status === 'confirmed' ? `<div class="actions"><button class="btn small danger" data-act="cancel-res" data-id="${esc(r.id)}" data-date="${r.date}">Cancel</button></div>` : ''}</div>`).join('') || '<p class="empty">None.</p>'}</div></div>`;
    renderDeskPanel(available);
    $('#bookOffice').onchange = e => { st.bookOffice = e.target.value; st.selectedDesk = ''; history.replaceState(null, '', `#book/${st.bookOffice}/${st.bookDate}`); renderBook(); };
    $('#bookDate').onchange = e => { if (W.isDate(e.target.value)) { st.bookDate = e.target.value; st.selectedDesk = ''; history.replaceState(null, '', `#book/${st.bookOffice}/${st.bookDate}`); renderBook(); } };
    const bookFor = $('#bookFor');
    if (bookFor) bookFor.oninput = async () => { st.bookFor = bookFor.value; const q = bookFor.value.trim(); if (q.length < 2) return; const r = await api('/api/workplace/directory?q=' + encodeURIComponent(q)).catch(() => ({ people: [] })); $('#bookForList').innerHTML = r.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''); };
  }
  function roomMap(room) {
    const pts = [...room.outline, ...room.desks.flatMap(d => S.deskCorners(d))], b = S.bounds(pts), pad = 60;
    const vb = [b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2].join(' ');
    const bg = room.background ? `<image href="${esc(room.background.image)}" x="${room.background.x}" y="${room.background.y}" width="${room.background.w}" height="${room.background.h}" opacity="${room.background.opacity}" preserveAspectRatio="none"/>` : '';
    const desks = room.desks.map(d => {
      const fs = Math.max(14, Math.min(30, Math.min(d.w, d.h) / 2.6)), label = `Desk ${d.label || ''}: ${W.STATE_LABELS[d.state]}${d.mine ? ' (your desk)' : ''}${d.reservedByMe ? ' (your reservation)' : ''}`;
      return `<g class="desk ${d.state}${d.mine ? ' mine' : ''}${st.selectedDesk === d.id ? ' selected' : ''}" data-desk="${esc(d.id)}" tabindex="0" role="button" aria-label="${esc(label)}" transform="translate(${d.x} ${d.y})"><title>${esc(label)}</title><g transform="rotate(${d.rotation})"><rect class="top" x="${-d.w / 2}" y="${-d.h / 2}" width="${d.w}" height="${d.h}" rx="8"/></g><text text-anchor="middle" dominant-baseline="central" font-size="${fs}">${esc(d.label || '')}</text></g>`;
    }).join('');
    const free = room.desks.filter(d => d.state === 'available').length;
    return `<section class="room-map"><h3><span>${esc(room.name)}${room.floor ? ' · ' + esc(room.floor) : ''}</span><span class="muted">${free} available</span></h3><svg viewBox="${vb}" role="group" aria-label="${esc(room.name)} floor plan">${bg}<polygon class="room-floor" points="${room.outline.map(p => p.join(',')).join(' ')}"/>${desks}</svg></section>`;
  }
  function selected() { for (const r of st.map?.rooms || []) { const d = r.desks.find(x => x.id === st.selectedDesk); if (d) return { room: r, desk: d }; } return null; }
  function renderDeskPanel(available = st.map.rooms.flatMap(r => r.desks.filter(d => d.state === 'available' && !d.mine).map(d => ({ ...d, room: r.name })))) {
    const panel = $('#deskPanel'), sel = selected();
    if (!panel) return;
    if (!sel) {
      panel.innerHTML = `<h2>Choose a desk</h2><p class="muted small">Select a green desk on the plan to review it. ${available.length ? available.length + ' desk' + (available.length === 1 ? ' is' : 's are') + ' available on ' + esc(fmtDate(st.bookDate)) + ':' : 'No desks are available on this day.'}</p><div class="desk-list">${available.slice(0, 60).map(d => `<button class="btn small" data-desk="${esc(d.id)}">${esc(d.label || 'Desk')} · ${esc(d.room)}</button>`).join('')}</div>`;
      return;
    }
    const { room, desk } = sel, reason = desk.reason;
    panel.innerHTML = `<h2>Desk ${esc(desk.label || '')}</h2>${chip(desk.state)}
      <dl><dt>Office</dt><dd>${esc(st.map.office.name)}</dd><dt>Room</dt><dd>${esc(room.name)}${room.floor ? ' · ' + esc(room.floor) : ''}</dd><dt>Date</dt><dd>${esc(fmtDate(st.bookDate, { weekday: 'long', day: 'numeric', month: 'long' }))} (whole day)</dd>
      <dt>Equipment</dt><dd>${esc(desk.equipment || 'Not described')}</dd>${desk.note ? `<dt>Note</dt><dd>${esc(desk.note)}</dd>` : ''}
      ${st.me.workplaceAdmin && desk.ownerName ? `<dt>Owner</dt><dd>${esc(desk.ownerName)}</dd>` : ''}${st.me.workplaceAdmin && desk.visitorName ? `<dt>Reserved by</dt><dd>${esc(desk.visitorName)}</dd>` : ''}</dl>
      <p class="muted small">${desk.mine ? 'This is your assigned desk. ' + (desk.state === 'available' ? 'Colleagues may borrow it on this day because you are confirmed away.' : desk.state === 'reserved' ? 'A visitor has a confirmed reservation for it on this day.' : 'It is kept for you on this day.') : esc(REASONS[reason] || '')}</p>
      ${desk.state === 'available' && !desk.mine ? `<button class="btn primary" data-act="reserve">Reserve desk ${esc(desk.label || '')}</button><p class="muted small">The reservation is confirmed only after the server accepts it, and it then stays yours even if the owner changes plans.</p>` : ''}
      ${desk.reservedByMe ? `<button class="btn danger" data-act="cancel-res" data-id="${esc(desk.reservedByMe)}" data-date="${st.bookDate}">Cancel my reservation</button>` : ''}
      ${st.me.workplaceAdmin && desk.reservationId && !desk.reservedByMe ? `<button class="btn danger" data-act="cancel-res" data-id="${esc(desk.reservationId)}" data-date="${st.bookDate}">Cancel this reservation (administrator)</button>` : ''}`;
  }
  async function reserve(button) {
    const sel = selected();
    if (!sel) return;
    button.disabled = true; button.textContent = 'Confirming with the server…';
    try {
      const forId = st.me.workplaceAdmin ? ($('#bookFor')?.value.trim() || '') : '';
      const r = await api('/api/workplace/reservations', { method: 'POST', body: { deskId: sel.desk.id, date: st.bookDate, ...(forId ? { employeeId: forId } : {}) } });
      setStatus(`<p class="ok">Reserved: desk ${esc(r.deskLabel)} · ${esc(r.roomName)} · ${esc(r.officeName)} on ${esc(fmtDate(r.date))}${r.onBehalf ? ' for ' + esc(r.employeeName) : ''}. It appears in My week.</p>`);
      st.selectedDesk = '';
      await refreshMe(); renderBook();
    } catch (error) {
      setStatus(`<p class="err">${esc(error.message)}</p>`);
      st.selectedDesk = ''; renderBook();
    }
  }
  async function cancelReservation(id) {
    if (!confirm('Cancel this desk reservation?')) return;
    try {
      const r = await api(`/api/workplace/reservations/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
      if (r.reservation.employeeId && r.reservation.employeeId === st.me.employee?.id) promptLocation(r.confirmLocation);
      else toast('Reservation cancelled.');
      await refreshMe();
      if (st.tab === 'book') renderBook(); else if (st.tab === 'admin') renderAdmin(); else renderWeek();
    } catch (error) { toast(error.message); }
  }
  function promptLocation(c) {
    setStatus(`<div class="card" role="alertdialog" aria-labelledby="confirmLocTitle"><h2 id="confirmLocTitle">Where will you work on ${esc(fmtDate(c.date, { weekday: 'long', day: 'numeric', month: 'long' }))}?</h2><p class="muted small">${esc(c.prompt)} It is currently set to <b>${esc(locationLabel(c.current))}</b>.</p>
      <form class="row" id="confirmLoc"><label>Location<select name="location">${locationOptions(c.current.startsWith('office:') || c.current === 'remote' ? c.current : '', { none: true })}</select></label><button class="btn primary" type="submit">Confirm</button></form></div>`);
    $('#confirmLoc').onsubmit = async e => {
      e.preventDefault();
      try { await api('/api/workplace/days', { method: 'PUT', body: { dates: [c.date], location: new FormData(e.target).get('location') } }); setStatus(''); toast('Location confirmed.'); if (st.tab === 'week') renderWeek(); } catch (error) { toast(error.message); }
    };
    $('#confirmLoc select').focus();
  }

  // ---- Team calendar ------------------------------------------------------------------------------
  async function renderTeam() {
    if (!st.me.linked) throw Object.assign(new Error('Your account is not linked to an employee record yet.'), { data: { code: 'not_linked' } });
    st.teamFrom ||= W.mondayOf(st.me.today);
    const to = W.addDays(st.teamFrom, 27), data = await api(`/api/workplace/team?from=${st.teamFrom}&to=${to}`), days = W.dateRange(st.teamFrom, to);
    const cell = (m, d) => { const a = data.absences.find(x => x.employeeId === m.id && x.start <= d && x.end >= d); return `<td class="${a ? a.status : ''}${W.weekday(d) > 5 ? ' weekend' : ''}${d === st.me.today ? ' today' : ''}" title="${esc(m.name + ' · ' + fmtDate(d) + (a ? ' · vacation ' + a.status : ''))}">${a ? (a.status === 'approved' ? '✓' : '?') : ''}</td>`; };
    view().innerHTML = `<div class="card"><div class="week-head"><h2>Team absences</h2><button class="btn small" data-act="team-prev" aria-label="Previous four weeks">‹</button><button class="btn small" data-act="team-today">Today</button><button class="btn small" data-act="team-next" aria-label="Next four weeks">›</button></div>
      <p class="muted small">Confirmed vacation of your manager, colleagues and reports. ${data.isManager ? 'Pending requests from your reports are shown as tentative (striped).' : 'Your own pending requests are shown as tentative.'} Notes are never shown here.</p>
      <div class="legend"><span><i class="available" style="background:var(--good);border-color:var(--good)"></i>Approved vacation</span><span><i class="unavailable" style="background:var(--warn-bg);border-color:var(--warn)"></i>Pending (tentative)</span></div>
      <div class="cal"><table><thead><tr><th class="name" scope="col">Person</th>${days.map(d => `<th scope="col">${WD[W.weekday(d) - 1][0]}<br>${Number(d.slice(8))}</th>`).join('')}</tr></thead>
      <tbody>${data.members.map(m => `<tr><th class="name" scope="row">${esc(m.name)} <span class="muted small">${esc(m.relation)}</span></th>${days.map(d => cell(m, d)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  // ---- Approvals ----------------------------------------------------------------------------------
  async function renderApprovals() {
    const data = await api('/api/workplace/approvals');
    const item = (r, decide) => `<div class="item${decide && st.focus === r.id ? ' focus' : ''}"${decide ? ` id="appr-${esc(r.id)}"` : ''}><div class="what"><b>${esc(r.employeeName)} · ${esc(r.kind === 'cancel' ? 'Cancel ' + fmtRange(r.start, r.end) : r.kind === 'change' ? 'Change ' + (r.target ? fmtRange(r.target.start, r.target.end) : '') + ' → ' + fmtRange(r.start, r.end) : fmtRange(r.start, r.end))}</b>
      <span class="small muted">${r.days} day${r.days === 1 ? '' : 's'} · submitted ${esc(r.submittedAt.slice(0, 10))}${r.decidedAt ? ' · decided ' + esc(r.decidedAt.slice(0, 10)) : ''}</span>${r.note ? `<span class="small">Note: ${esc(r.note)}</span>` : ''}${r.decisionNote ? `<span class="small">Your note: ${esc(r.decisionNote)}</span>` : ''}</div>${chip(r.status)}
      ${decide ? `<form class="row" data-decide="${esc(r.id)}"><label style="flex:1;min-width:180px">Note to ${esc(r.employeeName)} (optional)<input name="note" maxlength="1000" /></label><button class="btn primary small" name="decision" value="approve">Approve</button><button class="btn small danger" name="decision" value="reject">Reject</button></form>` : ''}</div>`;
    view().innerHTML = `<div class="card"><h2>Awaiting your decision</h2><div class="list">${data.pending.map(r => item(r, true)).join('') || '<p class="empty">Nothing to review.</p>'}</div></div>
      <div class="card"><h2>Your team’s absences</h2><p class="muted small">Approved and pending vacation of your direct reports in the next six months.</p><div class="list">${data.absences.map(r => item(r, false)).join('') || '<p class="empty">No upcoming absences.</p>'}</div></div>
      <div class="card"><h2>Recently decided</h2><div class="list">${data.decided.map(r => item(r, false)).join('') || '<p class="empty">No recent decisions.</p>'}</div></div>`;
    if (st.focus) document.getElementById('appr-' + st.focus)?.scrollIntoView({ block: 'center' });
  }

  // ---- Workplace administration ----------------------------------------------------------------------
  async function renderAdmin() {
    const data = await api('/api/workplace/admin');
    const officeOpts = (sel, blank) => (blank ? `<option value="">${esc(blank)}</option>` : '') + data.offices.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    let html = '';
    if (data.workplaceAdmin) {
      st.adminDate ||= st.me.today;
      const res = await api(`/api/workplace/reservations?scope=admin&from=${st.adminDate}&to=${W.addDays(st.adminDate, 13)}`);
      html += `<div class="card"><h2>Seating conflicts</h2><p class="muted small">A confirmed visitor keeps the desk. Offer the owner another desk, move the visitor, or record what was arranged.</p><div class="list">${data.conflicts.map(c => `<div class="item${st.focus === c.id ? ' focus' : ''}" id="cfl-${esc(c.id)}"><div class="what"><b>${esc(fmtDate(c.date))} · ${esc(c.officeName)} · ${esc(c.roomName)} · desk ${esc(c.deskLabel)}</b><span class="small muted">Owner ${esc(c.ownerName)} · visitor ${esc(c.visitorName)}</span></div>${chip(c.status)}<div class="actions"><button class="btn small" data-act="cfl-alt" data-id="${esc(c.id)}">Arrange an alternative…</button></div><div data-alt="${esc(c.id)}"></div></div>`).join('') || '<p class="empty">No open conflicts.</p>'}</div></div>
      <div class="card"><h2>Offices</h2><p class="muted small">Each office has its own time zone; booking dates follow it.</p>
        <table class="grid"><thead><tr><th>Office</th><th>Time zone</th><th></th></tr></thead><tbody>${data.offices.map(o => `<tr><td>${esc(o.name)} <span class="muted small">${esc(o.id)}</span></td><td>${esc(o.timezone)}</td><td><button class="btn small danger" data-act="office-del" data-id="${esc(o.id)}">Remove</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No offices yet.</td></tr>'}</tbody></table>
        <form class="row" id="officeForm" style="margin-top:10px"><label>Name<input name="name" required maxlength="80" placeholder="Zurich HQ" /></label><label>Time zone<input name="timezone" required list="tzList" placeholder="Europe/Zurich" /></label><datalist id="tzList">${data.timezones.map(z => `<option value="${esc(z)}">`).join('')}</datalist><button class="btn primary" type="submit">Add office</button></form></div>
      <div class="card"><h2>Rooms and desk sharing</h2><p class="muted small">Rooms come from the seating plan. Assign each to an office, then enable sharing for desks. An assigned desk can be borrowed only on days its owner is confirmed away; an unassigned desk is bookable only when shared here. Turning sharing off keeps confirmed reservations.</p>
        ${data.rooms.map(r => `<details><summary>${esc(r.name)}${r.floor ? ' · ' + esc(r.floor) : ''} — ${r.desks.filter(d => d.shared).length}/${r.desks.length} shared</summary>
          <div class="row" style="margin:8px 0"><label>Office<select data-room-office="${esc(r.id)}">${officeOpts(r.officeId, 'Not bookable')}</select></label><button class="btn small" data-act="share-room" data-id="${esc(r.id)}" data-on="1">Share all desks</button><button class="btn small" data-act="share-room" data-id="${esc(r.id)}" data-on="0">Stop sharing all</button></div>
          <table class="grid"><thead><tr><th>Desk</th><th>Owner today</th><th>Shared</th><th>Equipment</th></tr></thead><tbody>${r.desks.map(d => `<tr><td>${esc(d.label || d.id)}</td><td>${d.assigned ? esc(d.ownerName || 'Vacant position') : '<span class="muted">Unassigned</span>'}</td><td><input type="checkbox" data-share-desk="${esc(d.id)}" ${d.shared ? 'checked' : ''} aria-label="Share desk ${esc(d.label)}"></td><td><input data-equip="${esc(d.id)}" value="${esc(d.equipment)}" maxlength="200" placeholder="${d.shared ? 'e.g. two monitors, dock' : 'Share the desk first'}" ${d.shared ? '' : 'disabled'} aria-label="Equipment at desk ${esc(d.label)}"></td></tr>`).join('')}</tbody></table></details>`).join('') || '<p class="empty">The seating plan has no rooms yet. Draw rooms in the planner’s Seating view.</p>'}</div>
      <div class="card"><h2>Closures</h2><p class="muted small">Closed offices, rooms or desks are unavailable. Affected confirmed reservations are listed for confirmation and their holders are notified.</p>
        <div class="list">${data.closures.map(c => `<div class="item"><div class="what"><b>${esc(fmtRange(c.start, c.end))} · ${esc(data.offices.find(o => o.id === c.officeId)?.name || c.officeId)}${c.roomId ? ' · room ' + esc(data.rooms.find(r => r.id === c.roomId)?.name || c.roomId) : ''}${c.deskId ? ' · desk ' + esc(c.deskId) : ''}</b><span class="small muted">${esc(c.reason)}</span></div><button class="btn small" data-act="closure-del" data-id="${esc(c.id)}">Remove</button></div>`).join('') || '<p class="empty">No current or planned closures.</p>'}</div>
        <form class="row" id="closureForm" style="margin-top:10px"><label>Office<select name="officeId" required>${officeOpts('', '')}</select></label><label>Room (optional)<select name="roomId"><option value="">Whole office</option>${data.rooms.filter(r => r.officeId).map(r => `<option value="${esc(r.id)}" data-office="${esc(r.officeId)}">${esc(r.name)}</option>`).join('')}</select></label><label>From<input type="date" name="start" required></label><label>To<input type="date" name="end" required></label><label>Reason<input name="reason" maxlength="200"></label><button class="btn" type="submit">Add closure</button></form></div>
      <div class="card"><div class="week-head"><h2>Reservations</h2><label class="small">From <input type="date" id="adminDate" value="${st.adminDate}"></label></div><p class="muted small">Two weeks from the chosen date. Book on behalf of an employee from “Book a desk”.</p>
        <div class="list">${res.reservations.map(r => `<div class="item"><div class="what"><b>${esc(fmtDate(r.date))} · ${esc(r.officeName)} · ${esc(r.roomName)} · desk ${esc(r.deskLabel)}</b><span class="small muted">${esc(r.employeeName)}${r.onBehalf ? ' · booked by an administrator' : ''}${r.cancelReason ? ' · ' + esc(r.cancelReason) : ''}</span></div>${chip(r.status)}${r.status === 'confirmed' ? `<button class="btn small danger" data-act="cancel-res" data-id="${esc(r.id)}" data-date="${r.date}">Cancel</button>` : ''}</div>`).join('') || '<p class="empty">No reservations in this period.</p>'}</div></div>`;
    }
    if (data.orgAdmin) {
      html += `<div class="card"><h2>Approvers</h2><p class="muted small">Approvers come from Current: the nearest filled position above each person. Set a correction where that is wrong (for example the top of the organization). People cannot approve their own vacation. Link accounts to employees on the <a href="admin.html">Admin page</a>.</p>
        <table class="grid"><thead><tr><th>Employee</th><th>From Current</th><th>Correction (employee ID)</th></tr></thead><tbody>${data.approvers.map(a => `<tr><td>${esc(a.name)} <span class="muted small">${esc(a.employeeId)}</span></td><td>${esc(a.derivedName || '—')}</td><td><form class="row" data-approver="${esc(a.employeeId)}"><input name="approverId" value="${esc(a.overrideId)}" placeholder="Use Current" list="approverList" aria-label="Approver for ${esc(a.name)}"><button class="btn small" type="submit">Save</button></form>${a.overrideName ? `<span class="small muted">${esc(a.overrideName)}</span>` : ''}</td></tr>`).join('')}</tbody></table>
        <datalist id="approverList">${data.approvers.map(a => `<option value="${esc(a.employeeId)}">${esc(a.name)}</option>`).join('')}</datalist></div>`;
    }
    view().innerHTML = html || '<div class="card"><p class="empty">Nothing to administer.</p></div>';
    $('#officeForm')?.addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.target); try { await api('/api/workplace/admin/offices', { method: 'PUT', body: { name: fd.get('name'), timezone: fd.get('timezone') } }); await refreshMe(); renderAdmin(); } catch (error) { toast(error.message); } });
    const closureRooms = () => { const f = $('#closureForm'); if (!f) return; for (const o of f.roomId.options) o.hidden = Boolean(o.value) && o.dataset.office !== f.officeId.value; if (f.roomId.selectedOptions[0]?.hidden) f.roomId.value = ''; };
    $('#closureForm')?.officeId.addEventListener('change', closureRooms); closureRooms();
    $('#closureForm')?.addEventListener('submit', async e => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); await withConfirmation('/api/workplace/admin/closures', 'POST', body, 'Closure saved.'); });
    $('#adminDate')?.addEventListener('change', e => { if (W.isDate(e.target.value)) { st.adminDate = e.target.value; renderAdmin(); } });
    if (st.focus) document.getElementById('cfl-' + st.focus)?.scrollIntoView({ block: 'center' });
  }
  /** Changes that would displace confirmed reservations come back with the list; the administrator confirms. */
  async function withConfirmation(path, method, body, done) {
    try { await api(path, { method, body }); toast(done); renderAdmin(); }
    catch (error) {
      if (error.data?.code !== 'reservations_affected') { toast(error.message); return; }
      const list = error.data.reservations.map(r => `• ${fmtDate(r.date)} · ${r.officeName} ${r.roomName ? '· ' + r.roomName : ''} · desk ${r.deskLabel || r.deskId}${r.employeeName ? ' · ' + r.employeeName : ''}`).join('\n');
      if (!confirm(`${error.message}\n\n${list}\n\nThe holders will be notified and asked to choose another desk. Continue?`)) return;
      try { await api(path, { method, body: { ...body, confirm: true } }); toast(done); renderAdmin(); } catch (e2) { toast(e2.message); }
    }
  }

  // ---- Notifications ----------------------------------------------------------------------------
  async function openDrawer() {
    const d = $('#drawer');
    if (!d.classList.contains('hidden')) { d.classList.add('hidden'); return; }
    const data = await api('/api/workplace/notifications');
    d.innerHTML = `<div class="week-head"><h2>Notifications</h2>${data.unread ? '<button class="btn small" data-act="read-all">Mark all read</button>' : ''}<button class="btn small" data-act="close-drawer" aria-label="Close">×</button></div><div class="list">${data.items.map(n => `<a class="item" href="#${esc(n.route)}" data-note="${esc(n.id)}"><div class="what"><b>${n.read ? '' : '● '}${esc(n.title)}</b><span class="small muted">${esc(new Date(n.createdAt).toLocaleString())}</span></div></a>`).join('') || '<p class="empty">You are all caught up.</p>'}</div>`;
    d.classList.remove('hidden');
    d.querySelector('button, a')?.focus();
  }
  async function refreshMe() { st.me = await api('/api/workplace/me'); chrome(); }
  function chrome() {
    const me = st.me, s = st.session;
    $('#who').innerHTML = `<span class="email">${esc(me.employee?.name || s.user?.name || s.user?.email || '')}</span><button class="bell" id="bell" aria-label="Notifications${me.unread ? ', ' + me.unread + ' unread' : ''}">🔔${me.unread ? `<b>${me.unread}</b>` : ''}</button>${me.orgAccess ? '<a href="app.html">Planner</a>' : ''}${s.isAdmin ? '<a href="admin.html">Admin</a>' : ''}${st.teams ? '' : '<a href="/auth/logout">Sign out</a>'}`;
    $('#bell').onclick = () => openDrawer().catch(e => toast(e.message));
    $('#tabs').classList.remove('hidden');
    document.querySelector('[data-tab="approvals"]').hidden = !me.isManager;
    document.querySelector('[data-tab="admin"]').hidden = !(me.workplaceAdmin || me.orgAdmin);
    $('#notice').classList.remove('hidden');
    $('#noticeText').textContent = ' ' + me.notice;
  }

  // ---- Events -----------------------------------------------------------------------------------
  document.addEventListener('click', async e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { st.focus = ''; return show(tab.dataset.tab); }
    const deskEl = e.target.closest('[data-desk]');
    if (deskEl && st.tab === 'book') { st.selectedDesk = deskEl.dataset.desk; document.querySelectorAll('.desk.selected').forEach(x => x.classList.remove('selected')); document.querySelector(`.desk[data-desk="${CSS.escape(st.selectedDesk)}"]`)?.classList.add('selected'); renderDeskPanel(); $('#deskPanel').focus?.(); return; }
    const note = e.target.closest('[data-note]');
    if (note) { await api('/api/workplace/notifications/read', { method: 'POST', body: { ids: [note.dataset.note] } }).catch(() => {}); $('#drawer').classList.add('hidden'); refreshMe().catch(() => {}); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const { act, id, date } = btn.dataset;
    try {
      if (act === 'week-prev' || act === 'week-next') { st.weekStart = W.addDays(st.weekStart, act === 'week-prev' ? -7 : 7); history.replaceState(null, '', '#week/' + st.weekStart); return renderWeek(); }
      if (act === 'week-today') { st.weekStart = W.mondayOf(st.me.today); return renderWeek(); }
      if (act === 'team-prev' || act === 'team-next') { st.teamFrom = W.addDays(st.teamFrom, act === 'team-prev' ? -28 : 28); return renderTeam(); }
      if (act === 'team-today') { st.teamFrom = W.mondayOf(st.me.today); return renderTeam(); }
      if (act === 'cancel-res') return cancelReservation(id);
      if (act === 'find-desk') { st.bookDate = date; st.bookOffice = st.me.homeOfficeId || st.bookOffice; return show('book'); }
      if (act === 'focus-day') { document.getElementById('loc-' + date)?.focus(); return; }
      if (act === 'reserve') return reserve(btn);
      if (act === 'vac-edit') { document.querySelector(`[data-edit="${CSS.escape(id)}"]`).classList.toggle('hidden'); return; }
      if (act === 'vac-cancel') {
        if (!confirm('Withdraw or cancel this vacation? Approved vacation stays in force until your approver accepts the cancellation.')) return;
        const r = await api(`/api/workplace/vacations/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} });
        toast(r.kind === 'cancel' ? 'Cancellation sent for approval.' : 'Request withdrawn.'); return renderVacation();
      }
      if (act === 'cfl-alt') {
        const alt = await api(`/api/workplace/conflicts/${encodeURIComponent(id)}/alternatives`), box = document.querySelector(`[data-alt="${CSS.escape(id)}"]`);
        box.style.width = '100%';
        box.innerHTML = `<form class="row" data-resolve="${esc(id)}"><label>Alternative desk<select name="deskId">${alt.desks.map(d => `<option value="${esc(d.deskId)}">${esc(d.deskLabel)} · ${esc(d.roomName)}</option>`).join('') || '<option value="">No desk available</option>'}</select></label>
          <button class="btn small" name="action" value="book-owner" ${alt.desks.length ? '' : 'disabled'}>Book it for the owner</button><button class="btn small" name="action" value="move-visitor" ${alt.desks.length ? '' : 'disabled'}>Move the visitor there</button>
          <label>Or record an arrangement<input name="note" maxlength="300" placeholder="e.g. owner works remotely"></label><button class="btn small" name="action" value="dismiss">Mark arranged</button></form>`;
        return;
      }
      if (act === 'office-del') { await api('/api/workplace/admin/offices/' + encodeURIComponent(id), { method: 'DELETE' }); await refreshMe(); return renderAdmin(); }
      if (act === 'closure-del') { await api('/api/workplace/admin/closures/' + encodeURIComponent(id), { method: 'DELETE' }); return renderAdmin(); }
      if (act === 'share-room') { const r = await api('/api/workplace/admin/sharing', { method: 'PUT', body: { roomId: id, enabled: btn.dataset.on === '1' } }); toast(r.keptReservations ? `Sharing off; ${r.keptReservations} confirmed reservation(s) are kept.` : 'Sharing updated.'); return renderAdmin(); }
      if (act === 'read-all') { await api('/api/workplace/notifications/read', { method: 'POST', body: { ids: 'all' } }); $('#drawer').classList.add('hidden'); return refreshMe(); }
      if (act === 'close-drawer') { $('#drawer').classList.add('hidden'); $('#bell').focus(); }
    } catch (error) { toast(error.message); }
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('g.desk')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    if (e.key === 'Escape' && !$('#drawer').classList.contains('hidden')) { $('#drawer').classList.add('hidden'); $('#bell')?.focus(); }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.dataset.day) {
        const r = await api('/api/workplace/days', { method: 'PUT', body: { dates: [t.dataset.day], location: t.value } });
        toast(r.conflicts.length ? 'Saved. A visitor has a confirmed reservation for your desk that day; see the highlighted day.' : 'Saved.');
        return renderWeek();
      }
      if (t.dataset.roomOffice !== undefined) return withConfirmation(`/api/workplace/admin/rooms/${encodeURIComponent(t.dataset.roomOffice)}/office`, 'PUT', { officeId: t.value }, 'Room updated.');
      if (t.dataset.shareDesk) { await api('/api/workplace/admin/sharing', { method: 'PUT', body: { deskIds: [t.dataset.shareDesk], enabled: t.checked } }); toast('Sharing updated.'); const kit = document.querySelector(`[data-equip="${CSS.escape(t.dataset.shareDesk)}"]`); if (kit) { kit.disabled = !t.checked; kit.placeholder = t.checked ? 'e.g. two monitors, dock' : 'Share the desk first'; } return; }
      if (t.dataset.equip) { await api('/api/workplace/admin/sharing', { method: 'PUT', body: { deskIds: [t.dataset.equip], equipment: t.value } }); toast('Equipment saved.'); }
    } catch (error) { toast(error.message); if (st.tab === 'week') renderWeek(); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.dataset.edit) {
      e.preventDefault();
      const fd = new FormData(f);
      try { const r = await api('/api/workplace/vacations/' + encodeURIComponent(f.dataset.edit), { method: 'PATCH', body: { start: fd.get('start'), end: fd.get('end') } }); toast(r.kind === 'change' ? 'Date change sent for approval. Your approved dates stay in force until then.' : 'New dates sent to your approver.'); renderVacation(); } catch (error) { toast(error.message); }
    }
    if (f.dataset.decide) {
      e.preventDefault();
      const decision = e.submitter?.value, note = new FormData(f).get('note');
      try { await api(`/api/workplace/vacations/${encodeURIComponent(f.dataset.decide)}/decision`, { method: 'POST', body: { decision, note } }); toast(decision === 'approve' ? 'Approved. The employee is notified.' : 'Rejected. The employee is notified.'); renderApprovals(); } catch (error) { toast(error.message); renderApprovals(); }
    }
    if (f.dataset.resolve) {
      e.preventDefault();
      const fd = new FormData(f);
      try { await api(`/api/workplace/conflicts/${encodeURIComponent(f.dataset.resolve)}/resolve`, { method: 'POST', body: { action: e.submitter?.value, deskId: fd.get('deskId'), note: fd.get('note') } }); toast('Conflict resolved. Affected employees are notified.'); renderAdmin(); } catch (error) { toast(error.message); }
    }
    if (f.dataset.approver) {
      e.preventDefault();
      try { await api('/api/workplace/admin/approvers', { method: 'PUT', body: { employeeId: f.dataset.approver, approverId: new FormData(f).get('approverId').trim() } }); toast('Approver saved. Pending requests are re-routed.'); renderAdmin(); } catch (error) { toast(error.message); }
    }
  });
  window.addEventListener('hashchange', () => { route().catch(e => toast(e.message)); });

  // ---- Start ------------------------------------------------------------------------------------
  (async function start() {
    try {
      st.teams = await initTeams();
      if (st.teams) await teamsSignIn();
      const session = await api('/api/session');
      st.session = session;
      st.me = await api('/api/workplace/me');
      chrome();
      if (st.teams) st.teams.app.notifySuccess?.();
      await route();
    } catch (error) {
      view().innerHTML = `<div class="card signin"><h2>OrgFlow workplace</h2><p class="err">${esc(error.message || 'Could not start.')}</p><p class="muted small">Desk booking, work locations and vacation need the shared OrgFlow host. <a href="/workplace.html">Open in the browser</a></p></div>`;
      if (st.teams) st.teams.app.notifyFailure?.({ reason: 'Other', message: String(error.message) });
    }
  })();
})();
