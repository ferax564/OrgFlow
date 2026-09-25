/** Seating view: draw rooms, lay out desks and seat positions. Data rules live in seating-core.js. */
(function () {
  'use strict';
  const S = OrgFlowSeating, NS = 'http://www.w3.org/2000/svg', PREFS_KEY = 'orgflow.seating.v1', BASE = 0.5; // px per cm at 100%
  const GROUP_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0d9488', '#65a30d', '#ea580c', '#2563eb', '#a21caf'];
  const TOOLS = { v: 'select', q: 'rect', w: 'walls', d: 'desk', b: 'block' };
  const HINTS = {
    select: 'Click a desk to edit or assign it and drag to move it. Drag empty space to select several desks. Drag a corner to reshape the walls, ＋ on a wall adds a corner, double-click a corner removes it.',
    rect: 'Drag to draw the room as a rectangle. It replaces the current walls; desks stay where they are.',
    walls: 'Click each corner of the room. Walls snap to right angles; hold Shift for any angle. Click the first corner, double-click or press Enter to finish. Backspace removes the last corner, Esc cancels.',
    desk: 'Click to place a desk. Hold Alt to place it turned 90°. Desk size comes from the room settings.',
    block: 'Drag across an empty area to fill it with desks. Choose benches of two or single rows in the room settings. Desks that would sit outside the walls or on another desk are skipped.'
  };
  const st = { roomId: '', tool: 'select', zoom: 1, grid: 50, selected: new Set(), drag: null, draft: null, ghost: null, search: '', filter: 'unseated', block: { ...S.BLOCK_DEFAULTS }, fitted: '', space: false, dropDesk: '' };
  try { const saved = JSON.parse(appStorage.getItem(PREFS_KEY) || '{}') || {}; if ([10, 25, 50, 100].includes(saved.grid)) st.grid = saved.grid; if (typeof saved.roomId === 'string') st.roomId = saved.roomId; if (saved.block && typeof saved.block === 'object') st.block = { layout: saved.block.layout === 'rows' ? 'rows' : 'pairs', spacing: clampInt(saved.block.spacing, 0, 300, 0), aisle: clampInt(saved.block.aisle, 0, 600, 120) }; if (['unseated', 'all', 'room', 'vacant'].includes(saved.filter)) st.filter = saved.filter; } catch { /* preferences are optional */ }
  function clampInt(v, min, max, fallback) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
  function savePrefs() { safePreference(PREFS_KEY, JSON.stringify({ grid: st.grid, roomId: st.roomId, block: st.block, filter: st.filter })); }

  const svgEl = () => $('#seatingSvg'), canvas = () => $('#seatingCanvas');
  const seating = () => workspace?.seating || { rooms: [] };
  const rooms = () => seating().rooms;
  function room() { const list = rooms(); let r = list.find(x => x.id === st.roomId); if (!r && list.length) { r = list[0]; st.roomId = r.id; } return r || null; }
  const scale = () => st.zoom * BASE;
  const scoped = () => Boolean(window.OrgFlowEnterprise?.enabled && window.OrgFlowEnterprise.session?.scopePositionId);
  const editable = () => !scoped() && !enterpriseBlocksWrite() && !modelLoadError;
  function readOnlyReason() { return scoped() ? 'Seating plans are managed by organization-wide editors.' : 'You can view this seating plan but cannot change it right now.'; }
  function positionsById() { return new Map(people.map(p => [p.id, p])); }
  let colorSource = null, colorMap = new Map();
  function groupColor(group) {
    if (colorSource !== people) { colorSource = people; colorMap = new Map([...new Set(people.map(p => p.group || ''))].sort().map((g, i) => [g, GROUP_COLORS[i % GROUP_COLORS.length]])); }
    return colorMap.get(group || '') || GROUP_COLORS[0];
  }
  function occupantName(p) { return p ? (p.personName || (p.hiringState === 'Recruiting' ? 'Recruiting' : 'Vacant')) : ''; }
  function shortName(name, max) { if (name.length <= max) return name; const parts = name.split(/\s+/); if (parts.length > 1) { const s = parts[0] + ' ' + parts.at(-1)[0] + '.'; if (s.length <= max) return s; } return name.slice(0, Math.max(1, max - 1)) + '…'; }
  function metres(cm) { return (cm / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

  // ---- Commit -----------------------------------------------------------------
  function mutate(fn, message, quiet = false) {
    if (!editable()) { toast(readOnlyReason()); return false; }
    const next = structuredClone(workspace);
    next.seating = next.seating || { rooms: [] };
    try {
      if (fn(next.seating, next) === false) return false;
      commitPlanning(next, quiet ? '' : message, { historyNote: message });
      return true;
    } catch (error) { toast(error.message); render(); return false; }
  }
  function withRoom(fn) { return seatingDoc => { const r = seatingDoc.rooms.find(x => x.id === st.roomId); if (!r) throw new Error('Choose a room first.'); return fn(r, seatingDoc); }; }

  // ---- Geometry helpers --------------------------------------------------------
  function toWorld(e) {
    const s = svgEl(), m = s.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function snapPoint(p) { return { x: Math.max(0, Math.min(S.MAX_COORD, S.snap(p.x, st.grid))), y: Math.max(0, Math.min(S.MAX_COORD, S.snap(p.y, st.grid))) }; }
  function world(r) {
    const c = canvas(), pts = [...(r?.outline || []), ...(r?.desks || []).flatMap(d => S.deskCorners(d)), ...(st.draft || []).map(p => [p.x, p.y])];
    const b = S.bounds(pts.length ? pts : [[0, 0]]), sc = scale();
    return { x: 0, y: 0, w: Math.ceil(Math.max(b.maxX + 600, (c?.clientWidth || 800) / sc)), h: Math.ceil(Math.max(b.maxY + 600, (c?.clientHeight || 500) / sc)) };
  }
  function fit() {
    const r = room(), c = canvas();
    if (!r || !c || !c.clientWidth) return;
    const b = S.bounds([...r.outline, ...r.desks.flatMap(d => S.deskCorners(d))]);
    st.zoom = Math.max(0.1, Math.min(4, Math.min((c.clientWidth - 40) / ((b.w + 160) * BASE), (c.clientHeight - 40) / ((b.h + 160) * BASE))));
    st.fitted = r.id;
    paint();
    c.scrollLeft = Math.max(0, (b.x - 80) * scale() - Math.max(0, (c.clientWidth - (b.w + 160) * scale()) / 2));
    c.scrollTop = Math.max(0, (b.y - 80) * scale() - Math.max(0, (c.clientHeight - (b.h + 160) * scale()) / 2));
  }
  function setZoom(next) {
    const c = canvas(), sc = scale(), cx = (c.scrollLeft + c.clientWidth / 2) / sc, cy = (c.scrollTop + c.clientHeight / 2) / sc;
    st.zoom = Math.max(0.1, Math.min(4, next));
    paint();
    c.scrollLeft = cx * scale() - c.clientWidth / 2; c.scrollTop = cy * scale() - c.clientHeight / 2;
  }

  // ---- Scene markup ---------------------------------------------------------------
  function roomMarkup(r, outline = r.outline, { handles = false, labels = true } = {}) {
    const sc = scale(), pts = outline.map(p => p.join(',')).join(' ');
    let signed = 0;
    for (let i = 0; i < outline.length; i++) { const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % outline.length]; signed += x1 * y2 - x2 * y1; }
    const dir = signed > 0 ? 1 : -1, fs = 12 / sc;
    let out = `<polygon class="seat-floor" points="${pts}"/><polygon class="seat-wall" points="${pts}"/>`;
    if (labels) outline.forEach((a, i) => {
      const b = outline[(i + 1) % outline.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len * sc < 34) return;
      const nx = (b[1] - a[1]) / len * dir, ny = -(b[0] - a[0]) / len * dir, off = 16 / sc;
      out += `<text class="seat-dim" x="${(a[0] + b[0]) / 2 + nx * off}" y="${(a[1] + b[1]) / 2 + ny * off}" font-size="${fs}" dominant-baseline="middle" text-anchor="middle">${metres(len)} m</text>`;
    });
    if (handles) {
      outline.forEach((a, i) => {
        const b = outline[(i + 1) % outline.length];
        out += `<g class="seat-edge-add" data-edge="${i}"><circle cx="${(a[0] + b[0]) / 2}" cy="${(a[1] + b[1]) / 2}" r="${7 / sc}"/><path d="M${(a[0] + b[0]) / 2 - 3.5 / sc} ${(a[1] + b[1]) / 2}h${7 / sc}M${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2 - 3.5 / sc}v${7 / sc}"/></g>`;
      });
      outline.forEach((p, i) => { out += `<circle class="seat-vertex" data-vertex="${i}" cx="${p[0]}" cy="${p[1]}" r="${7 / sc}"/>`; });
    }
    return out;
  }
  function deskMarkup(d, { byId, issues, selected = false, exportMode = false } = {}) {
    const p = d.positionId ? byId.get(d.positionId) : null, missing = Boolean(d.positionId && !p);
    const cls = ['seat-desk', d.hotDesk ? 'hot' : p ? 'assigned' : missing ? 'missing' : 'free'];
    if (selected) cls.push('selected');
    if (issues?.has(d.id)) cls.push('issue');
    if (st.dropDesk === d.id && !exportMode) cls.push('drop-target');
    const hw = d.w / 2, hh = d.h / 2, chair = Math.min(40, d.w * 0.3), color = p ? groupColor(p.group) : '';
    const avail = (d.rotation % 180 === 90 ? d.h : d.w) - 10, fs = Math.max(9, Math.min(22, avail / 5.5)), max = Math.max(3, Math.floor(avail / (fs * 0.56)));
    const name = d.hotDesk ? 'Hot desk' : p ? occupantName(p) : missing ? 'Not in scenario' : '';
    const tip = `${d.label || 'Desk'}${d.hotDesk ? ' · shared hot desk' : p ? ` · ${occupantName(p)} · ${p.title}${p.group ? ' · ' + p.group : ''}` : missing ? ' · assigned position is not in this scenario' : ' · free'}`;
    return `<g class="${cls.join(' ')}" data-desk-id="${esc(d.id)}" transform="translate(${d.x} ${d.y})"><title>${esc(tip)}</title><g transform="rotate(${d.rotation})">`
      + `<rect class="seat-chair" x="${-chair / 2}" y="${hh + 6}" width="${chair}" height="${Math.min(28, chair * 0.75)}" rx="${Math.min(10, chair / 4)}"/>`
      + `<rect class="seat-top" x="${-hw}" y="${-hh}" width="${d.w}" height="${d.h}" rx="6"/>`
      + (color ? `<rect x="${-hw}" y="${-hh}" width="${d.w}" height="${Math.min(12, d.h / 5)}" rx="4" fill="${color}"/>` : '')
      + `</g><text class="seat-label" y="${name ? -fs * 0.35 : fs * 0.35}" font-size="${fs}" text-anchor="middle">${esc(shortName(d.label || '', max))}</text>`
      + (name ? `<text class="seat-name" y="${fs * 0.95}" font-size="${fs * 0.9}" text-anchor="middle">${esc(shortName(name, max))}</text>` : '')
      + '</g>';
  }
  function gridDefs(sc) {
    const minor = st.grid * sc >= 7 ? st.grid : st.grid * 4 * sc >= 7 ? st.grid * 4 : 100 * sc >= 7 ? 100 : 500, major = minor >= 100 ? minor * 5 : 100, w = 1 / sc;
    return `<defs><pattern id="seatGridMinor" width="${minor}" height="${minor}" patternUnits="userSpaceOnUse"><path d="M${minor} 0H0V${minor}" fill="none" class="seat-grid-minor" stroke-width="${w}"/></pattern><pattern id="seatGridMajor" width="${major}" height="${major}" patternUnits="userSpaceOnUse"><rect width="${major}" height="${major}" fill="url(#seatGridMinor)"/><path d="M${major} 0H0V${major}" fill="none" class="seat-grid-major" stroke-width="${w}"/></pattern></defs>`;
  }
  function paint() {
    const s = svgEl(), r = room();
    if (!s) return;
    $('#seatingZoomLabel').textContent = Math.round(st.zoom * 100) + '%';
    if (!r) { s.innerHTML = ''; s.removeAttribute('viewBox'); s.setAttribute('width', 0); s.setAttribute('height', 0); return; }
    const wv = world(r), sc = scale(), byId = positionsById(), issues = S.roomIssues(r), flagged = new Set([...issues.outside, ...issues.overlapping]);
    s.setAttribute('viewBox', `${wv.x} ${wv.y} ${wv.w} ${wv.h}`);
    s.setAttribute('width', Math.ceil(wv.w * sc)); s.setAttribute('height', Math.ceil(wv.h * sc));
    s.dataset.tool = st.tool;
    s.innerHTML = gridDefs(sc) + `<rect class="seat-grid-bg" x="${wv.x}" y="${wv.y}" width="${wv.w}" height="${wv.h}" fill="url(#seatGridMajor)"/>`
      + `<g id="seatRoomLayer">${roomMarkup(r, st.drag?.kind === 'vertex' ? st.drag.outline : r.outline, { handles: st.tool === 'select' && editable() })}</g>`
      + `<g id="seatDeskLayer">${r.desks.map(d => deskMarkup(d, { byId, issues: flagged, selected: st.selected.has(d.id) })).join('')}</g><g id="seatOverlay"></g>`;
    paintOverlay();
  }
  function paintOverlay() {
    const layer = $('#seatOverlay'), r = room();
    if (!layer || !r) return;
    const sc = scale(), d = st.drag;
    let out = '';
    if (d?.kind === 'rect' && d.current) {
      const x = Math.min(d.start.x, d.current.x), y = Math.min(d.start.y, d.current.y), w = Math.abs(d.current.x - d.start.x), h = Math.abs(d.current.y - d.start.y);
      out += `<rect class="seat-preview-room" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      hint(`${metres(w)} × ${metres(h)} m · ${S.polygonArea(S.rectOutline(0, 0, w || 0, h || 0)).toFixed(1)} m²`);
    }
    if (d?.kind === 'block' && d.current) {
      const x = Math.min(d.start.x, d.current.x), y = Math.min(d.start.y, d.current.y), w = Math.abs(d.current.x - d.start.x), h = Math.abs(d.current.y - d.start.y);
      const { fit: specs, skipped } = blockSpecs(r, d.start, d.current);
      out += `<rect class="seat-preview-area" x="${x}" y="${y}" width="${w}" height="${h}"/>` + specs.map(sp => `<g class="seat-ghost" transform="translate(${sp.x} ${sp.y}) rotate(${sp.rotation})"><rect x="${-sp.w / 2}" y="${-sp.h / 2}" width="${sp.w}" height="${sp.h}" rx="6"/></g>`).join('');
      hint(`${metres(w)} × ${metres(h)} m · ${specs.length} desk${specs.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped (outside the walls or on another desk)` : ''}`);
    }
    if (d?.kind === 'marquee' && d.current) out += `<rect class="seat-marquee" x="${Math.min(d.start.x, d.current.x)}" y="${Math.min(d.start.y, d.current.y)}" width="${Math.abs(d.current.x - d.start.x)}" height="${Math.abs(d.current.y - d.start.y)}" stroke-width="${1 / sc}"/>`;
    if (st.draft?.length) {
      const pts = [...st.draft, ...(st.ghost ? [st.ghost] : [])];
      out += `<polyline class="seat-draft" points="${pts.map(p => `${p.x},${p.y}`).join(' ')}"/>` + st.draft.map((p, i) => `<circle class="seat-draft-point${i === 0 && st.draft.length >= 3 ? ' closable' : ''}" cx="${p.x}" cy="${p.y}" r="${(i === 0 ? 8 : 5) / sc}"/>`).join('');
      if (st.ghost) { const last = st.draft.at(-1), len = Math.hypot(st.ghost.x - last.x, st.ghost.y - last.y); if (len) out += `<text class="seat-dim live" x="${(st.ghost.x + last.x) / 2}" y="${(st.ghost.y + last.y) / 2 - 10 / sc}" font-size="${13 / sc}" text-anchor="middle">${metres(len)} m</text>`; }
    }
    if (st.tool === 'desk' && st.ghost && !d) {
      const w = r.deskSize.w, h = r.deskSize.h;
      out += `<g class="seat-ghost" transform="translate(${st.ghost.x} ${st.ghost.y}) rotate(${st.ghost.rotation || 0})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6"/></g>`;
    }
    layer.innerHTML = out;
  }
  function blockSpecs(r, a, b) {
    const specs = S.planDeskBlock({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, { w: r.deskSize.w, h: r.deskSize.h, layout: st.block.layout, spacing: st.block.spacing, aisle: st.block.aisle });
    const fit = specs.filter(sp => S.deskInsideRoom(sp, r.outline) && !r.desks.some(x => S.desksOverlap(x, sp)));
    return { fit, skipped: specs.length - fit.length };
  }
  function hint(text) { const el = $('#seatingHint'); if (el) el.textContent = text; }
  function toolHint() { hint(!room() ? '' : editable() ? HINTS[st.tool] : readOnlyReason() + ' Select a desk to see who sits there.'); }

  // ---- Panels ------------------------------------------------------------------------
  function render() {
    if (!$('#seatingPanel') || !workspace) return;
    const r = room(), list = rooms(), byId = positionsById(), sum = S.summarize(seating(), people);
    for (const id of [...st.selected]) if (!r?.desks.some(d => d.id === id)) st.selected.delete(id);
    $('#seatingTitle').textContent = r ? r.name : 'Rooms & desks';
    $('#seatingSummary').textContent = list.length
      ? `${list.length} room${list.length === 1 ? '' : 's'} · ${sum.desks} desks · ${sum.assigned} assigned · ${sum.free} free${sum.hot ? ` · ${sum.hot} hot` : ''} · ${sum.unseatedPeople} ${sum.unseatedPeople === 1 ? 'person' : 'people'} in ${activeScenario().name} without a desk`
      : 'Draw rooms, lay out desks and assign them to positions. The plan is shared by every scenario; occupants come from the scenario you are viewing.';
    $('#seatingRoomList').innerHTML = list.map(x => { const s = sum.rooms.find(y => y.id === x.id); return `<button type="button" class="seat-room${x.id === r?.id ? ' active' : ''}" data-seat-room="${esc(x.id)}" aria-pressed="${x.id === r?.id}"><b>${esc(x.name)}</b><small>${x.floor ? esc(x.floor) + ' · ' : ''}${s.desks} desks · ${s.free} free</small></button>`; }).join('') || '<p class="hint">No rooms yet.</p>';
    $('#seatingAddRoom').disabled = !editable();
    $$('#seatingPanel [data-seat-tool]').forEach(b => { const on = b.dataset.seatTool === st.tool; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); b.disabled = !r || (!editable() && b.dataset.seatTool !== 'select'); });
    $('#seatingGrid').value = String(st.grid);
    $('#seatingEmpty').classList.toggle('hidden', Boolean(r));
    $('#seatingCreateFirst').disabled = !editable();
    $('#seatingCsvBtn').disabled = $('#seatingPngBtn').disabled = !list.length;
    if (!editable() && st.tool !== 'select') setTool('select', false);
    if (r && st.fitted !== r.id && canvas().clientWidth) fit(); else paint();
    toolHint();
    renderLegend(r, byId);
    renderInspector(r, byId, sum);
  }
  function renderLegend(r, byId) {
    const el = $('#seatingLegend');
    if (!r) { el.innerHTML = ''; return; }
    const groups = [...new Set(r.desks.map(d => byId.get(d.positionId)).filter(Boolean).map(p => p.group || ''))].sort();
    el.innerHTML = groups.map(g => `<span><i style="background:${groupColor(g)}"></i>${esc(g || 'No group')}</span>`).join('') + '<span><i class="free"></i>Free</span><span><i class="hot"></i>Hot desk</span><span><i class="issue"></i>Outside walls or overlapping</span>';
  }
  function positionOptions(selectedId) {
    const groups = new Map();
    for (const p of [...people].sort((a, b) => (a.group || '').localeCompare(b.group || '') || occupantName(a).localeCompare(occupantName(b)))) {
      const g = p.group || 'No group';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(p);
    }
    const seatOf = new Map(rooms().flatMap(r => r.desks.filter(d => d.positionId).map(d => [d.positionId, d.label || 'desk'])));
    let html = '<option value="">— Free desk —</option>';
    if (selectedId && !people.some(p => p.id === selectedId)) html += `<option value="${esc(selectedId)}" selected>${esc(selectedId)} (not in this scenario)</option>`;
    for (const [g, list] of groups) html += `<optgroup label="${esc(g)}">${list.map(p => `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${esc(occupantName(p))} — ${esc(p.title)}${seatOf.has(p.id) && p.id !== selectedId ? ` (at ${esc(seatOf.get(p.id))})` : ''}</option>`).join('')}</optgroup>`;
    return html;
  }
  function renderInspector(r, byId, sum) {
    const el = $('#seatingInspector'), dis = editable() ? '' : 'disabled';
    if (!r) { el.innerHTML = `<section class="seat-card"><h3>How seating works</h3><p class="hint">A room is a wall outline you draw on a grid. Desks sit inside it and are assigned to <b>positions</b>, so vacancies can be reserved and a scenario that moves people shows its own seating.</p></section>`; return; }
    const selected = r.desks.filter(d => st.selected.has(d.id));
    let top = '';
    if (selected.length === 1) {
      const d = selected[0], p = byId.get(d.positionId), issues = S.roomIssues(r);
      const problems = [issues.outside.includes(d.id) ? 'This desk sits outside the walls.' : '', issues.overlapping.includes(d.id) ? 'This desk overlaps another desk.' : ''].filter(Boolean);
      top = `<section class="seat-card"><div class="seat-card-head"><h3>Desk ${esc(d.label || '')}</h3>${statusPill(d.hotDesk ? 'Hot desk' : p ? 'Assigned' : d.positionId ? 'Not in scenario' : 'Free', d.hotDesk ? 'recruiting' : p ? 'filled' : d.positionId ? 'bad' : 'vacant')}</div>
        ${problems.map(t => `<p class="issue warn">${t}</p>`).join('')}
        <div class="field"><label for="seatAssign">Assigned position</label><select id="seatAssign" data-seat-field="positionId" ${dis || (d.hotDesk ? 'disabled' : '')}>${positionOptions(d.positionId)}</select></div>
        ${p ? `<div class="seat-occupant"><span class="seat-dot" style="background:${groupColor(p.group)}"></span><div><b>${esc(occupantName(p))}</b><small>${esc(p.title)}${p.group ? ' · ' + esc(p.group) : ''}${p.location ? ' · ' + esc(p.location) : ''}</small></div><button class="small-link" type="button" data-seat-open="${esc(p.id)}">Open position</button></div>` : ''}
        <div class="seat-fields"><div class="field"><label for="seatLabel">Label</label><input id="seatLabel" data-seat-field="label" maxlength="40" value="${esc(d.label)}" ${dis}></div><div class="field"><label for="seatRotation">Rotation °</label><input id="seatRotation" type="number" step="15" data-seat-field="rotation" value="${d.rotation}" ${dis}></div>
        <div class="field"><label for="seatW">Width cm</label><input id="seatW" type="number" min="${S.MIN_DESK}" max="${S.MAX_DESK}" step="5" data-seat-field="w" value="${d.w}" ${dis}></div><div class="field"><label for="seatH">Depth cm</label><input id="seatH" type="number" min="${S.MIN_DESK}" max="${S.MAX_DESK}" step="5" data-seat-field="h" value="${d.h}" ${dis}></div></div>
        <label class="check"><input type="checkbox" data-seat-field="hotDesk" ${d.hotDesk ? 'checked' : ''} ${dis}> Shared hot desk (not assigned to anyone)</label>
        <div class="field"><label for="seatNote">Note</label><input id="seatNote" data-seat-field="note" maxlength="300" value="${esc(d.note || '')}" placeholder="e.g. standing desk, near window" ${dis}></div>
        <div class="seat-actions"><button class="btn" type="button" data-seat-action="rotate" ${dis}>⟳ Rotate 90°</button><button class="btn" type="button" data-seat-action="duplicate" ${dis}>Duplicate</button><button class="btn danger" type="button" data-seat-action="delete" ${dis}>Delete</button></div></section>`;
    } else if (selected.length > 1) {
      const hot = selected.filter(d => d.hotDesk).length;
      top = `<section class="seat-card"><div class="seat-card-head"><h3>${selected.length} desks selected</h3></div><p class="hint">${selected.filter(d => d.positionId).length} assigned · ${hot} hot. Drag any of them to move the group; arrow keys nudge by the snap grid.</p>
        <div class="seat-actions"><button class="btn" type="button" data-seat-action="rotate" ${dis}>⟳ Rotate 90°</button><button class="btn" type="button" data-seat-action="duplicate" ${dis}>Duplicate</button><button class="btn" type="button" data-seat-action="${hot === selected.length ? 'unhot' : 'hot'}" ${dis}>${hot === selected.length ? 'Make assignable' : 'Make hot desks'}</button><button class="btn" type="button" data-seat-action="clear" ${dis}>Clear assignments</button><button class="btn danger" type="button" data-seat-action="delete" ${dis}>Delete</button></div></section>`;
    } else {
      const b = S.bounds(r.outline), rs = sum.rooms.find(x => x.id === r.id), everywhere = new Set(workspace.scenarios.flatMap(s => s.positions.map(p => p.id))), orphaned = r.desks.filter(d => d.positionId && !everywhere.has(d.positionId)).length;
      const waiting = people.filter(p => p.personId && !S.deskForPosition(seating(), p.id)).length, free = r.desks.filter(d => !d.positionId && !d.hotDesk).length;
      top = `<section class="seat-card"><div class="seat-card-head"><h3>Room</h3><span class="hint">${rs.area} m² · ${r.outline.length} corners</span></div>
        <div class="seat-fields"><div class="field"><label for="seatRoomName">Name</label><input id="seatRoomName" data-room-field="name" maxlength="80" value="${esc(r.name)}" ${dis}></div><div class="field"><label for="seatRoomFloor">Floor / building</label><input id="seatRoomFloor" data-room-field="floor" maxlength="80" value="${esc(r.floor)}" placeholder="e.g. Level 2 · HQ" ${dis}></div></div>
        <div class="form-divider">Size</div>
        <div class="seat-fields"><div class="field"><label for="seatRoomW">Width m</label><input id="seatRoomW" type="number" min="0.5" max="150" step="0.1" value="${b.w / 100}" ${dis}></div><div class="field"><label for="seatRoomD">Depth m</label><input id="seatRoomD" type="number" min="0.5" max="150" step="0.1" value="${b.h / 100}" ${dis}></div></div>
        <button class="btn" type="button" data-seat-action="resize" ${dis}>${r.outline.length === 4 && S.polygonArea(r.outline) * 10000 === b.w * b.h ? 'Resize room' : 'Replace walls with this rectangle'}</button>
        <div class="form-divider">New desks</div>
        <div class="seat-fields"><div class="field"><label for="seatDeskW">Desk width cm</label><input id="seatDeskW" type="number" min="${S.MIN_DESK}" max="${S.MAX_DESK}" step="5" data-room-field="deskW" value="${r.deskSize.w}" ${dis}></div><div class="field"><label for="seatDeskH">Desk depth cm</label><input id="seatDeskH" type="number" min="${S.MIN_DESK}" max="${S.MAX_DESK}" step="5" data-room-field="deskH" value="${r.deskSize.h}" ${dis}></div>
        <div class="field"><label for="seatBlockLayout">Desk-block layout</label><select id="seatBlockLayout" data-block-field="layout"><option value="pairs" ${st.block.layout === 'pairs' ? 'selected' : ''}>Benches of two, back to back</option><option value="rows" ${st.block.layout === 'rows' ? 'selected' : ''}>Single rows, same direction</option></select></div><div class="field"><label for="seatBlockSpacing">Gap between desks cm</label><input id="seatBlockSpacing" type="number" min="0" max="300" step="5" data-block-field="spacing" value="${st.block.spacing}"></div>
        <div class="field"><label for="seatBlockAisle">Aisle between rows cm</label><input id="seatBlockAisle" type="number" min="0" max="600" step="10" data-block-field="aisle" value="${st.block.aisle}"></div></div>
        <div class="form-divider">Seat people</div>
        <p class="hint">${waiting} ${waiting === 1 ? 'person' : 'people'} in ${esc(activeScenario().name)} without a desk · ${free} free desk${free === 1 ? '' : 's'} here.</p>
        <button class="btn primary" type="button" data-seat-action="autoseat" ${dis || (!waiting || !free ? 'disabled' : '')}>Auto-seat by team</button>
        ${orphaned ? `<p class="issue warn">${orphaned} desk${orphaned === 1 ? '' : 's'} point at positions that no longer exist in any scenario. <button class="small-link" type="button" data-seat-action="orphans" ${dis}>Free them</button></p>` : ''}
        <div class="seat-actions"><button class="btn" type="button" data-seat-action="duplicate-room" ${dis}>Duplicate room</button><button class="btn danger" type="button" data-seat-action="delete-room" ${dis}>Delete room</button></div></section>`;
    }
    el.innerHTML = top + `<section class="seat-card seat-people"><div class="seat-card-head"><h3>People &amp; positions</h3></div>
      <div class="seat-people-controls"><input type="search" id="seatPeopleSearch" placeholder="Find a person or position…" aria-label="Find a person or position to seat" value="${esc(st.search)}"><select id="seatPeopleFilter" aria-label="Which people to list"><option value="unseated">Without a desk</option><option value="all">Everyone</option><option value="room">Seated in this room</option><option value="vacant">Vacant positions</option></select></div>
      <div id="seatPeopleList" class="seat-people-list"></div><p class="hint">${editable() ? 'Drag a name onto a desk, or select a desk and click a name.' : 'Click a seated name to find their desk.'}</p></section>`;
    $('#seatPeopleFilter').value = st.filter;
    renderPeopleList();
  }
  function renderPeopleList() {
    const el = $('#seatPeopleList');
    if (!el) return;
    const q = st.search.trim().toLowerCase(), r = room(), where = new Map();
    for (const x of rooms()) for (const d of x.desks) if (d.positionId) where.set(d.positionId, { room: x, desk: d });
    let list = people.filter(p => {
      const seat = where.get(p.id);
      if (st.filter === 'unseated' && (seat || !p.personId)) return false;
      if (st.filter === 'room' && seat?.room.id !== r?.id) return false;
      if (st.filter === 'vacant' && p.personId) return false;
      return !q || `${occupantName(p)} ${p.title} ${p.group} ${p.id}`.toLowerCase().includes(q);
    }).sort((a, b) => (a.group || '').localeCompare(b.group || '') || occupantName(a).localeCompare(occupantName(b)));
    const more = list.length > 200 ? list.length - 200 : 0;
    list = list.slice(0, 200);
    el.innerHTML = list.map(p => { const seat = where.get(p.id); return `<button type="button" class="seat-person" draggable="${editable()}" data-seat-position="${esc(p.id)}"><span class="seat-dot" style="background:${groupColor(p.group)}"></span><span class="seat-person-text"><b>${esc(occupantName(p))}</b><small>${esc(p.title)}${p.group ? ' · ' + esc(p.group) : ''}</small></span>${seat ? `<em>${esc(seat.desk.label || 'Desk')}${seat.room.id !== r?.id ? ' · ' + esc(seat.room.name) : ''}</em>` : ''}</button>`; }).join('')
      + (more ? `<p class="hint">${more} more — refine the search.</p>` : '')
      || `<p class="hint">${st.filter === 'unseated' ? 'Everyone in this scenario has a desk.' : 'Nobody matches.'}</p>`;
  }
  function describeSeat(el, positionId) {
    if (!el) return;
    const seat = positionId ? S.deskForPosition(seating(), positionId) : null;
    el.classList.toggle('hidden', !seat);
    el.textContent = seat ? `Desk ${seat.desk.label || ''} · ${seat.room.name}${seat.room.floor ? ' · ' + seat.room.floor : ''} (Seating tab)` : '';
  }

  // ---- Actions ----------------------------------------------------------------
  function setTool(tool, announce = true) {
    if (!Object.values(TOOLS).includes(tool)) return;
    st.tool = tool; st.draft = null; st.ghost = null; st.drag = null;
    if (tool !== 'select') st.selected.clear();
    if (announce) render();
  }
  function createRoom(widthM = 12, depthM = 8) {
    const n = rooms().length + 1, id = S.makeId('room');
    const ok = mutate(seatingDoc => {
      if (seatingDoc.rooms.length >= S.MAX_ROOMS) throw new Error(`At most ${S.MAX_ROOMS} rooms are supported.`);
      const r = S.createRoom({ id, name: `Room ${n}`, width: Math.round(Number(widthM) * 100) || 1200, depth: Math.round(Number(depthM) * 100) || 800 });
      seatingDoc.rooms.push(r);
    }, `Room ${n} created`);
    if (ok) { st.roomId = id; st.fitted = ''; st.selected.clear(); savePrefs(); setTool('block', false); render(); }
  }
  function selectRoom(id) { st.roomId = id; st.selected.clear(); st.draft = null; st.fitted = ''; savePrefs(); render(); }
  function assign(deskId, positionId) {
    let note = '';
    const ok = mutate(seatingDoc => { const moved = S.assignDesk(seatingDoc, deskId, positionId); if (moved.movedFrom) note = ` (moved from ${moved.movedFrom.desk.label || 'another desk'})`; }, 'Desk assigned', true);
    if (ok) { const p = people.find(x => x.id === positionId); toast(positionId ? `${occupantName(p)} seated at ${S.findDesk(seating(), deskId)?.desk.label || 'desk'}${note}` : 'Desk is free'); }
    return ok;
  }
  function selectedDesks(r = room()) { return r ? r.desks.filter(d => st.selected.has(d.id)) : []; }
  function action(kind) {
    const r = room();
    if (!r) return;
    const ids = new Set(st.selected);
    if (kind === 'delete') {
      if (!ids.size) return;
      if (mutate(withRoom(rm => { rm.desks = rm.desks.filter(d => !ids.has(d.id)); }), ids.size === 1 ? 'Desk removed' : `${ids.size} desks removed`)) st.selected.clear();
    } else if (kind === 'rotate') mutate(withRoom(rm => { for (const d of rm.desks) if (ids.has(d.id)) d.rotation = S.normRotation(d.rotation + 90); }), 'Desks rotated', true);
    else if (kind === 'duplicate') {
      const sel = selectedDesks(r); if (!sel.length) return;
      const b = S.bounds(sel.flatMap(d => S.deskCorners(d)));
      mutate(withRoom(rm => { const added = S.addDesks(rm, sel.map(d => ({ x: d.x + Math.round(b.w), y: d.y, w: d.w, h: d.h, rotation: d.rotation }))); added.forEach((a, i) => { a.hotDesk = sel[i].hotDesk; }); st.selected = new Set(added.map(a => a.id)); }), sel.length === 1 ? 'Desk duplicated' : `${sel.length} desks duplicated`);
    } else if (kind === 'hot' || kind === 'unhot') mutate(withRoom(rm => { for (const d of rm.desks) if (ids.has(d.id)) { d.hotDesk = kind === 'hot'; if (d.hotDesk) d.positionId = ''; } }), kind === 'hot' ? 'Hot desks updated' : 'Desks can be assigned again');
    else if (kind === 'clear') mutate(withRoom(rm => { for (const d of rm.desks) if (ids.has(d.id)) d.positionId = ''; }), 'Assignments cleared');
    else if (kind === 'resize') {
      const w = Math.round(Number($('#seatRoomW').value) * 100), h = Math.round(Number($('#seatRoomD').value) * 100), b = S.bounds(r.outline);
      if (!(w >= 50 && h >= 50)) { toast('Enter a width and depth of at least 0.5 m.'); return; }
      mutate(withRoom(rm => { rm.outline = S.rectOutline(b.x, b.y, w, h); }), `Room is now ${metres(w)} × ${metres(h)} m`);
    } else if (kind === 'autoseat') {
      let n = 0;
      if (mutate(withRoom((rm, doc) => { n = S.autoSeat(doc, rm.id, people); if (!n) throw new Error('No free desks or unseated people.'); }), 'Auto-seated', true)) toast(`${n} ${n === 1 ? 'person' : 'people'} seated by team. Drag names to fine-tune.`);
    } else if (kind === 'orphans') {
      const everywhere = new Set(workspace.scenarios.flatMap(s => s.positions.map(p => p.id)));
      mutate(doc => { if (!S.clearMissing(doc, everywhere)) return false; }, 'Desks freed');
    } else if (kind === 'duplicate-room') {
      let id = '';
      if (mutate(doc => { if (doc.rooms.length >= S.MAX_ROOMS) throw new Error(`At most ${S.MAX_ROOMS} rooms are supported.`); const copy = S.duplicateRoom(doc.rooms.find(x => x.id === r.id)); id = copy.id; doc.rooms.push(copy); }, 'Room duplicated without assignments')) selectRoom(id);
    } else if (kind === 'delete-room') {
      if (!confirm(`Delete “${r.name}” and its ${r.desks.length} desk${r.desks.length === 1 ? '' : 's'}? People keep their positions; only their desk is removed. You can undo this.`)) return;
      if (mutate(doc => { doc.rooms = doc.rooms.filter(x => x.id !== r.id); }, 'Room deleted')) { st.roomId = ''; st.selected.clear(); st.fitted = ''; savePrefs(); render(); }
    }
  }
  function updateDeskField(field, target) {
    const [id] = st.selected;
    if (!id) return;
    if (field === 'positionId') { assign(id, target.value); return; }
    mutate(withRoom(rm => {
      const d = rm.desks.find(x => x.id === id);
      if (field === 'hotDesk') { d.hotDesk = target.checked; if (d.hotDesk) d.positionId = ''; }
      else if (field === 'label') d.label = target.value;
      else if (field === 'note') d.note = target.value;
      else if (field === 'rotation') d.rotation = S.normRotation(target.value);
      else d[field] = Math.max(S.MIN_DESK, Math.min(S.MAX_DESK, Math.round(Number(target.value) || d[field])));
    }), 'Desk updated', true);
  }
  function updateRoomField(field, target) {
    mutate(withRoom(rm => {
      if (field === 'name') { if (!target.value.trim()) throw new Error('A room needs a name.'); rm.name = target.value; }
      else if (field === 'floor') rm.floor = target.value;
      else if (field === 'deskW') rm.deskSize.w = Math.max(S.MIN_DESK, Math.min(S.MAX_DESK, Math.round(Number(target.value) || rm.deskSize.w)));
      else if (field === 'deskH') rm.deskSize.h = Math.max(S.MIN_DESK, Math.min(S.MAX_DESK, Math.round(Number(target.value) || rm.deskSize.h)));
    }), 'Room updated', true);
  }
  function nudge(dx, dy) {
    const ids = new Set(st.selected);
    if (!ids.size) return;
    mutate(withRoom(rm => { for (const d of rm.desks) if (ids.has(d.id)) { d.x = Math.max(0, Math.min(S.MAX_COORD, d.x + dx)); d.y = Math.max(0, Math.min(S.MAX_COORD, d.y + dy)); } }), 'Desks moved', true);
  }
  function finishWalls() {
    const pts = st.draft || [];
    if (pts.length < 3) { toast('Click at least three corners to draw a room.'); return; }
    const outline = S.simplifyOutline(pts.map(p => [p.x, p.y]));
    st.draft = null; st.ghost = null;
    if (mutate(withRoom(rm => { rm.outline = outline; }), 'Walls updated')) setTool('select');
  }

  // ---- Pointer interaction ----------------------------------------------------------
  // Capture keeps a drag alive outside the canvas; it throws if the pointer is already gone.
  function capture(e) { try { svgEl().setPointerCapture(e.pointerId); } catch { /* the drag still works inside the canvas */ } }
  function onPointerDown(e) {
    const r = room();
    if (!r || (e.button !== 0 && e.button !== 1)) return;
    const raw = toWorld(e), p = snapPoint(raw), c = canvas();
    const deskEl = e.target.closest('[data-desk-id]'), vertex = e.target.closest('[data-vertex]'), edge = e.target.closest('[data-edge]');
    // Touch has no scroll wheel or middle button: a finger on empty floor in Select pans instead of box-selecting.
    const touchPan = e.pointerType === 'touch' && st.tool === 'select' && !deskEl && !vertex && !edge;
    if (e.button === 1 || st.space || touchPan) { st.drag = { kind: 'pan', x: e.clientX, y: e.clientY, left: c.scrollLeft, top: c.scrollTop }; capture(e); e.preventDefault(); return; }
    if (st.tool === 'select') {
      if (vertex && editable()) st.drag = { kind: 'vertex', index: Number(vertex.dataset.vertex), outline: r.outline.map(q => [...q]), moved: false };
      else if (edge && editable()) { const i = Number(edge.dataset.edge), outline = r.outline.map(q => [...q]), a = outline[i], b = outline[(i + 1) % outline.length], mid = snapPoint({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }); outline.splice(i + 1, 0, [mid.x, mid.y]); st.drag = { kind: 'vertex', index: i + 1, outline, moved: true }; }
      else if (deskEl) {
        const id = deskEl.dataset.deskId, additive = e.shiftKey || e.metaKey || e.ctrlKey;
        let collapseTo = '';
        if (additive) { if (st.selected.has(id)) st.selected.delete(id); else st.selected.add(id); }
        else if (!st.selected.has(id)) st.selected = new Set([id]);
        else collapseTo = id;
        st.drag = editable() && st.selected.has(id) ? { kind: 'move', start: raw, orig: new Map(r.desks.filter(d => st.selected.has(d.id)).map(d => [d.id, { x: d.x, y: d.y }])), dx: 0, dy: 0, collapseTo } : null;
        render();
      } else { if (!(e.shiftKey || e.metaKey || e.ctrlKey)) st.selected.clear(); st.drag = { kind: 'marquee', start: raw, current: null, base: new Set(st.selected) }; render(); }
    } else if (!editable()) return;
    else if (st.tool === 'rect') st.drag = { kind: 'rect', start: p, current: null };
    else if (st.tool === 'block') st.drag = { kind: 'block', start: p, current: null };
    else if (st.tool === 'desk') {
      const rotation = e.altKey ? 90 : 0;
      mutate(withRoom(rm => { const [d] = S.addDesks(rm, [{ x: p.x, y: p.y, rotation }]); st.selected = new Set([d.id]); }), 'Desk added', true);
      return;
    } else if (st.tool === 'walls') {
      const pt = constrain(p, e.shiftKey);
      if (st.draft?.length >= 3) { const f = st.draft[0]; if (Math.hypot(raw.x - f.x, raw.y - f.y) * scale() < 12 || (pt.x === f.x && pt.y === f.y)) { finishWalls(); return; } }
      st.draft = [...(st.draft || []), pt];
      paint();
      return;
    }
    if (st.drag) { capture(e); e.preventDefault(); }
  }
  function constrain(p, free) {
    const last = st.draft?.at(-1);
    if (!last || free) return p;
    return Math.abs(p.x - last.x) >= Math.abs(p.y - last.y) ? { x: p.x, y: last.y } : { x: last.x, y: p.y };
  }
  function onPointerMove(e) {
    const d = st.drag, r = room();
    if (!r) return;
    if (!d) {
      if (st.tool === 'walls' && st.draft?.length) { st.ghost = constrain(snapPoint(toWorld(e)), e.shiftKey); paintOverlay(); }
      else if (st.tool === 'desk' && editable()) { st.ghost = { ...snapPoint(toWorld(e)), rotation: e.altKey ? 90 : 0 }; paintOverlay(); }
      return;
    }
    if (d.kind === 'pan') { const c = canvas(); c.scrollLeft = d.left - (e.clientX - d.x); c.scrollTop = d.top - (e.clientY - d.y); return; }
    const raw = toWorld(e), p = snapPoint(raw);
    if (d.kind === 'move') {
      d.dx = S.snap(raw.x - d.start.x, st.grid); d.dy = S.snap(raw.y - d.start.y, st.grid);
      for (const [id, o] of d.orig) { const g = svgEl().querySelector(`[data-desk-id="${CSS.escape(id)}"]`); if (g) g.setAttribute('transform', `translate(${Math.max(0, o.x + d.dx)} ${Math.max(0, o.y + d.dy)})`); }
      if (d.dx || d.dy) hint(`Moving ${d.orig.size} desk${d.orig.size === 1 ? '' : 's'} by ${metres(d.dx)} m, ${metres(d.dy)} m`);
    } else if (d.kind === 'vertex') {
      d.outline[d.index] = [p.x, p.y]; d.moved = true;
      $('#seatRoomLayer').innerHTML = roomMarkup(r, d.outline, { handles: true });
      const b = S.bounds(d.outline); hint(`${metres(b.w)} × ${metres(b.h)} m · ${S.polygonArea(d.outline).toFixed(1)} m²`);
    } else if (d.kind === 'marquee') {
      d.current = raw;
      const x1 = Math.min(d.start.x, raw.x), x2 = Math.max(d.start.x, raw.x), y1 = Math.min(d.start.y, raw.y), y2 = Math.max(d.start.y, raw.y);
      st.selected = new Set([...d.base, ...r.desks.filter(q => q.x >= x1 && q.x <= x2 && q.y >= y1 && q.y <= y2).map(q => q.id)]);
      $$('#seatDeskLayer [data-desk-id]').forEach(g => g.classList.toggle('selected', st.selected.has(g.dataset.deskId)));
      paintOverlay();
    } else { d.current = p; paintOverlay(); }
  }
  function onPointerUp() {
    const d = st.drag, r = room();
    st.drag = null;
    if (!d || !r) return;
    if (d.kind === 'pan') return;
    if (d.kind === 'move') {
      if (d.dx || d.dy) mutate(withRoom(rm => { for (const q of rm.desks) if (d.orig.has(q.id)) { const o = d.orig.get(q.id); q.x = Math.max(0, Math.min(S.MAX_COORD, o.x + d.dx)); q.y = Math.max(0, Math.min(S.MAX_COORD, o.y + d.dy)); } }), d.orig.size === 1 ? 'Desk moved' : 'Desks moved', true);
      else { if (d.collapseTo) st.selected = new Set([d.collapseTo]); render(); }
    } else if (d.kind === 'vertex') {
      if (d.moved) { if (!mutate(withRoom(rm => { rm.outline = S.simplifyOutline(d.outline); }), 'Walls reshaped', true)) paint(); }
    } else if (d.kind === 'marquee') render();
    else if (d.kind === 'rect') {
      const c = d.current || d.start, w = Math.abs(c.x - d.start.x), h = Math.abs(c.y - d.start.y);
      if (w < 50 || h < 50) { toast('Drag a larger area to draw the room.'); paint(); return; }
      if (mutate(withRoom(rm => { rm.outline = S.rectOutline(Math.min(c.x, d.start.x), Math.min(c.y, d.start.y), w, h); }), `Room drawn · ${metres(w)} × ${metres(h)} m`)) setTool('block');
    } else if (d.kind === 'block') {
      const { fit: specs, skipped } = blockSpecs(r, d.start, d.current || d.start);
      if (!specs.length) { toast(skipped ? 'Those desks would sit outside the walls or on other desks.' : 'Drag a larger area — at least one desk wide and deep.'); paint(); toolHint(); return; }
      st.tool = 'select';
      mutate(withRoom(rm => { st.selected = new Set(S.addDesks(rm, specs).map(x => x.id)); }), `${specs.length} desks added${skipped ? ` · ${skipped} skipped` : ''}`);
    }
    toolHint();
  }
  function onDoubleClick(e) {
    const r = room();
    if (!r) return;
    if (st.tool === 'walls' && st.draft) { e.preventDefault(); finishWalls(); return; }
    const vertex = e.target.closest('[data-vertex]');
    if (st.tool === 'select' && vertex && editable()) {
      if (r.outline.length <= 3) { toast('A room needs at least three corners.'); return; }
      const i = Number(vertex.dataset.vertex);
      mutate(withRoom(rm => { rm.outline.splice(i, 1); }), 'Corner removed', true);
      return;
    }
    if (e.target.closest('[data-desk-id]')) setTimeout(() => $('#seatAssign')?.focus(), 0);
  }

  // ---- Keyboard --------------------------------------------------------------------
  function handleKey(e, typing) {
    if (typing) return false;
    const key = e.key, mod = e.metaKey || e.ctrlKey;
    if (key === 'Escape') {
      if (st.draft) { st.draft = null; st.ghost = null; paint(); toolHint(); return true; }
      if (st.drag) { st.drag = null; paint(); return true; }
      if (st.tool !== 'select') { setTool('select'); return true; }
      if (st.selected.size) { st.selected.clear(); render(); return true; }
      return false;
    }
    if (!room()) return false;
    if (st.draft && key === 'Enter') { e.preventDefault(); finishWalls(); return true; }
    if (st.draft && key === 'Backspace') { e.preventDefault(); st.draft.pop(); if (!st.draft.length) st.draft = null; paint(); return true; }
    if (key === ' ' && !st.space) { st.space = true; canvas().classList.add('panning'); e.preventDefault(); return true; }
    if (mod && key.toLowerCase() === 'd') { e.preventDefault(); action('duplicate'); return true; }
    if (mod && key.toLowerCase() === 'a') { e.preventDefault(); st.selected = new Set(room().desks.map(d => d.id)); setTool('select'); return true; }
    if (mod || e.altKey) return false;
    if ((key === 'Delete' || key === 'Backspace') && st.selected.size) { e.preventDefault(); action('delete'); return true; }
    if (key.toLowerCase() === 'r' && st.selected.size) { e.preventDefault(); action('rotate'); return true; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[key] && st.selected.size) { e.preventDefault(); const step = st.grid * (e.shiftKey ? 5 : 1); nudge(arrows[key][0] * step, arrows[key][1] * step); return true; }
    if (TOOLS[key.toLowerCase()] && !e.shiftKey) { e.preventDefault(); if (editable() || key.toLowerCase() === 'v') setTool(TOOLS[key.toLowerCase()]); return true; }
    if (key === '+' || key === '=') { e.preventDefault(); setZoom(st.zoom * 1.2); return true; }
    if (key === '-' || key === '_') { e.preventDefault(); setZoom(st.zoom / 1.2); return true; }
    if (key === '0') { e.preventDefault(); fit(); return true; }
    return false;
  }
  window.addEventListener('keyup', e => { if (e.key === ' ' && st.space) { st.space = false; canvas()?.classList.remove('panning'); } });

  // ---- Export ------------------------------------------------------------------------
  const EXPORT_CSS = '.seat-floor{fill:#ffffff}.seat-wall{fill:none;stroke:#0f172a;stroke-width:12;stroke-linejoin:round}.seat-dim{fill:#64748b;font-weight:700}.seat-top{fill:#f8fafc;stroke:#94a3b8;stroke-width:2}.seat-chair{fill:#e2e8f0;stroke:#94a3b8;stroke-width:1.5}.seat-desk.free .seat-top{fill:#ecfdf3;stroke:#12b76a}.seat-desk.hot .seat-top{fill:#fff7ed;stroke:#f79009;stroke-dasharray:8 5}.seat-desk.missing .seat-top{fill:#fff0ee;stroke:#b42318}.seat-label{fill:#0f172a;font-weight:800}.seat-name{fill:#334155;font-weight:600}text{font-family:ui-sans-serif,system-ui,sans-serif}';
  function exportArt(r) {
    const byId = positionsById(), b = S.bounds([...r.outline, ...r.desks.flatMap(d => S.deskCorners(d))]), pad = 120, head = 170, keep = st.zoom;
    const x = b.x - pad, y = b.y - pad - head, w = b.w + pad * 2, h = b.h + pad * 2 + head, sub = [r.floor, `${activeScenario().name} · ${today}`].filter(Boolean).join(' · ');
    let body;
    st.zoom = 1; // dimension labels are sized for the export, not the current zoom
    try { body = roomMarkup(r, r.outline, { handles: false }) + r.desks.map(d => deskMarkup(d, { byId, exportMode: true })).join(''); }
    finally { st.zoom = keep; }
    const px = Math.min(1, 2400 / w);
    const xml = `<svg xmlns="${NS}" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w * px)}" height="${Math.round(h * px)}"><style>${EXPORT_CSS}</style><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3f5f9"/><text x="${b.x}" y="${b.y - pad - 80}" font-size="54" font-weight="800" fill="#0f172a">${esc(r.name)}</text><text x="${b.x}" y="${b.y - pad - 24}" font-size="30" fill="#64748b">${esc(sub)}</text>${body}</svg>`;
    return { xml, width: Math.round(w * px), height: Math.round(h * px) };
  }
  async function exportPNG() {
    const r = room();
    if (!r) return;
    try { if (!(await allowEnterpriseExport('seating-png'))) return; downloadBlob(await pngFromExport(exportArt(r)), `orgflow-seating-${slug(r.name) || 'room'}.png`); toast('Room exported as PNG'); }
    catch (error) { toast(error.message || 'PNG export failed'); }
  }
  async function exportCSV() {
    if (!rooms().length) return;
    if (!(await allowEnterpriseExport('seating-csv'))) return;
    const s = activeScenario();
    downloadBlob(csvBlob(S.CSV_COLUMNS, S.seatingRows(seating(), people, s.employees)), `orgflow-seating-${slug(s.name)}.csv`);
    toast('Seating plan exported as CSV');
  }

  // ---- Wiring -------------------------------------------------------------------------
  function setup() {
    const panel = $('#seatingPanel');
    if (!panel) return;
    const s = svgEl(), c = canvas();
    s.addEventListener('pointerdown', onPointerDown);
    s.addEventListener('pointermove', onPointerMove);
    s.addEventListener('pointerup', onPointerUp);
    s.addEventListener('pointercancel', () => { st.drag = null; paint(); });
    s.addEventListener('pointerleave', () => { if (!st.drag && st.ghost && st.tool === 'desk') { st.ghost = null; paintOverlay(); } });
    s.addEventListener('dblclick', onDoubleClick);
    c.addEventListener('wheel', e => { if (!(e.ctrlKey || e.metaKey) || !room()) return; e.preventDefault(); setZoom(st.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); }, { passive: false });
    s.addEventListener('dragover', e => {
      const g = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-desk-id]'), found = g && S.findDesk(seating(), g.dataset.deskId);
      const id = found && !found.desk.hotDesk && editable() ? found.desk.id : '';
      if (id) { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; }
      if (id !== st.dropDesk) { st.dropDesk = id; $$('#seatDeskLayer [data-desk-id]').forEach(x => x.classList.toggle('drop-target', x.dataset.deskId === id)); }
    });
    s.addEventListener('dragleave', e => { if (!s.contains(e.relatedTarget)) { st.dropDesk = ''; $$('#seatDeskLayer .drop-target').forEach(x => x.classList.remove('drop-target')); } });
    s.addEventListener('drop', e => {
      e.preventDefault();
      const id = st.dropDesk, positionId = e.dataTransfer.getData('text/x-orgflow-position');
      st.dropDesk = '';
      if (id && positionId) { st.selected = new Set([id]); assign(id, positionId); } else paint();
    });
    $('#seatingAddRoom').addEventListener('click', () => createRoom());
    $('#seatingCreateFirst').addEventListener('click', () => createRoom($('#seatingNewW').value, $('#seatingNewD').value));
    $('#seatingRoomList').addEventListener('click', e => { const b = e.target.closest('[data-seat-room]'); if (b) selectRoom(b.dataset.seatRoom); });
    panel.querySelector('.seating-tools').addEventListener('click', e => { const b = e.target.closest('[data-seat-tool]'); if (b && !b.disabled) setTool(b.dataset.seatTool); });
    $('#seatingGrid').addEventListener('change', e => { st.grid = Number(e.target.value) || 50; savePrefs(); paint(); });
    $('#seatingZoomIn').addEventListener('click', () => setZoom(st.zoom * 1.2));
    $('#seatingZoomOut').addEventListener('click', () => setZoom(st.zoom / 1.2));
    $('#seatingFit').addEventListener('click', fit);
    $('#seatingCsvBtn').addEventListener('click', exportCSV);
    $('#seatingPngBtn').addEventListener('click', exportPNG);
    const inspector = $('#seatingInspector');
    inspector.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.seatField) updateDeskField(t.dataset.seatField, t);
      else if (t.dataset.roomField) updateRoomField(t.dataset.roomField, t);
      else if (t.dataset.blockField) { const f = t.dataset.blockField; st.block[f] = f === 'layout' ? (t.value === 'rows' ? 'rows' : 'pairs') : clampInt(t.value, 0, f === 'aisle' ? 600 : 300, st.block[f]); savePrefs(); }
      else if (t.id === 'seatPeopleFilter') { st.filter = t.value; savePrefs(); renderPeopleList(); }
    });
    inspector.addEventListener('input', e => { if (e.target.id === 'seatPeopleSearch') { st.search = e.target.value; renderPeopleList(); } });
    inspector.addEventListener('click', e => {
      const a = e.target.closest('[data-seat-action]'), open = e.target.closest('[data-seat-open]'), person = e.target.closest('[data-seat-position]');
      if (a && !a.disabled) action(a.dataset.seatAction);
      else if (open) openDrawer(open.dataset.seatOpen);
      else if (person) {
        const id = person.dataset.seatPosition, desk = selectedDesks();
        if (desk.length === 1 && editable() && !desk[0].hotDesk && desk[0].positionId !== id) { assign(desk[0].id, id); return; }
        const seat = S.deskForPosition(seating(), id);
        if (seat) { st.roomId = seat.room.id; st.selected = new Set([seat.desk.id]); if (st.tool !== 'select') setTool('select', false); savePrefs(); render(); }
        else toast(editable() ? 'Select a free desk first, or drag the name onto a desk.' : 'This position has no desk.');
      }
    });
    inspector.addEventListener('dragstart', e => { const p = e.target.closest?.('[data-seat-position]'); if (!p || !editable()) { e.preventDefault(); return; } e.dataTransfer.setData('text/x-orgflow-position', p.dataset.seatPosition); e.dataTransfer.setData('text/plain', p.querySelector('b')?.textContent || ''); e.dataTransfer.effectAllowed = 'link'; });
    new ResizeObserver(() => { if (currentView === 'seating' && room()) paint(); }).observe(c);
  }
  setup();
  window.OrgFlowSeatingUI = { render, handleKey, describeSeat, fit, setTool, state: st };
})();
