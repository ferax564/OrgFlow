/**
 * Standalone viewer embedded in OrgFlow interactive HTML exports. Reads the
 * redacted dataset from #orgflow-share and renders an explorable read-only
 * chart: zoom, pan, expand/collapse, depth presets, filters, search and a
 * details panel. No network, no OrgFlow app required — the OrgFlow domain
 * script above it in the file provides the layout.
 */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const dataEl = el('orgflow-share');
  if (!dataEl || typeof OrgFlow === 'undefined') return;
  let data;
  try { data = JSON.parse(dataEl.textContent); } catch { return; }
  const OF = OrgFlow;
  const F = new Set(data.fields || []);
  const esc = OF.esc;

  // ---- model ---------------------------------------------------------------
  const byId = new Map();
  const roots = [];
  (data.positions || []).forEach(p => byId.set(p.id, Object.assign({}, p, { children: [] })));
  (data.positions || []).forEach(p => {
    const node = byId.get(p.id);
    const parent = p.managerId ? byId.get(p.managerId) : null;
    (parent ? parent.children : roots).push(node);
  });
  const cmp = (a, b) => ((a.sortOrder || 0) - (b.sortOrder || 0)) || ((a.type === 'Head' ? -1 : 0) - (b.type === 'Head' ? -1 : 0)) || String(a.title).localeCompare(String(b.title));
  (function sortAll(list) { list.sort(cmp); list.forEach(n => sortAll(n.children)); })(roots);
  const totalReports = new Map();
  (function countAll(list) {
    for (const n of list) {
      countAll(n.children);
      totalReports.set(n.id, n.children.length + n.children.reduce((s, c) => s + (totalReports.get(c.id) || 0), 0));
    }
  })(roots);

  const state = {
    collapsed: new Set(), expanded: new Set(),
    depth: [1, 2, 3, 99].includes(data.initialDepth) ? data.initialDepth : 99,
    filter: { group: '', site: '', type: '' },
    q: '', hits: [], hitIndex: -1,
    zoom: 1, focusId: null
  };

  function displayName(n) {
    if (n.person?.name) return n.person.name;
    if (n.hiringState === 'Recruiting') return 'Recruiting';
    return 'Vacant position';
  }
  function keep(n) {
    const f = state.filter;
    return (!f.group || (n.group || '') === f.group) && (!f.site || (n.location || '') === f.site) && (!f.type || n.type === f.type);
  }
  function visible(n, depth) {
    // Returns a pruned copy. A filtered-out node hides its subtree; a
    // collapsed node keeps its descendants in the dataset but off-screen.
    if (!keep(n)) return null;
    const copy = Object.assign({}, n);
    const blocked = (depth >= state.depth || state.collapsed.has(n.id)) && !state.expanded.has(n.id);
    copy._hiddenKids = !blocked ? 0 : n.children.filter(keep).length;
    copy.children = blocked ? [] : n.children.map(c => visible(c, depth + 1)).filter(Boolean);
    return copy;
  }

  // ---- card sizing (mirrors the app's compact card metrics) ----------------
  function cardSize(n) {
    const nameLines = OF.wrapText(displayName(n), 186, 7.1).slice(0, 4);
    const titleLines = OF.wrapText(n.title || '', 224, 5.7).slice(0, 3);
    const group = F.has('group') ? (n.group || 'No group') : '';
    const site = F.has('location') ? (n.location || 'No site') : '';
    const groupLines = group ? OF.wrapText(group, 224, 5.4).slice(0, 2) : [];
    const siteLines = site ? OF.wrapText(site, 224, 5.4).slice(0, 2) : [];
    const chips = [
      F.has('type') || true ? n.type : '',
      F.has('status') ? n.status : '',
      F.has('hiringState') ? n.hiringState : '',
      F.has('fte') && n.fte != null ? OF.fteText(n.fte) + ' FTE' : ''
    ].filter(Boolean);
    let h = 14 + Math.max(nameLines.length * 15, n.person?.photo ? 40 : 0) + 4 + titleLines.length * 13;
    h += groupLines.length * 13 + siteLines.length * 13;
    if (chips.length) h += 22;
    h += 10;
    return { w: 248, h, nameLines, titleLines, groupLines, siteLines, chips };
  }
  function sizeForest(list) {
    for (const n of list) {
      const m = cardSize(n);
      n._cardW = m.w; n._cardH = m.h; n._lines = m;
      sizeForest(n.children);
    }
  }

  // ---- render ---------------------------------------------------------------
  const wrap = el('of-wrap'), stage = el('of-stage');
  function render() {
    const forest = roots.map(n => visible(n, 1)).filter(Boolean);
    sizeForest(forest);
    const lay = OF.layoutOrgChart(forest, { groupGap: 32 });
    if (!lay.all.length) {
      stage.innerHTML = '<div class="of-empty">Nothing to show — every position is filtered out.</div>';
      stage.style.width = '100%'; stage.style.height = '240px';
      return;
    }
    const w = lay.width + 48, h = lay.height + 48;
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    let svg = `<svg class="of-svg" width="${w}" height="${h}">`;
    for (const c of lay.connectors) {
      const cls = c.kind === 'dotted' ? 'of-line of-dotted' : 'of-line';
      svg += `<path class="${cls}" d="${c.d}"/>`;
    }
    svg += '</svg>';
    let cards = '';
    for (const n of lay.all) {
      const m = n._lines;
      const hit = state.hits.includes(n.id);
      const vacant = (n.hiringState && n.hiringState !== 'Filled') || !n.person?.name;
      cards += `<div class="of-card${hit ? ' hit' : ''}${vacant && F.has('hiringState') ? ' vacant' : ''}" data-id="${esc(n.id)}" style="left:${n._x + 24}px;top:${n._y + 24}px;width:${n._cardW}px" role="button" tabindex="0" aria-label="${esc(n.title)} — ${esc(displayName(n))}">`
        + (n.person?.photo?.data ? `<img class="of-photo" src="${esc(n.person.photo.data)}" width="${n.person.photo.width}" height="${n.person.photo.height}" alt="">` : '')
        + `<div class="of-name">${m.nameLines.map(esc).join('<br>')}</div>`
        + `<div class="of-role">${m.titleLines.map(esc).join('<br>')}</div>`
        + m.groupLines.map(l => `<div class="of-meta">${esc(l)}</div>`).join('')
        + m.siteLines.map(l => `<div class="of-meta">${esc(l)}</div>`).join('')
        + (m.chips.length ? `<div class="of-chips">${m.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : '')
        + (n._hiddenKids ? `<button class="of-toggle" data-toggle="${esc(n.id)}" title="Show team">+${n._hiddenKids}</button>` : '')
        + ((!n._hiddenKids && n.children.length) ? `<button class="of-toggle" data-toggle="${esc(n.id)}" title="Hide team">−</button>` : '')
        + `</div>`;
    }
    stage.innerHTML = svg + cards;
    stage.style.transform = `scale(${state.zoom})`;
    el('of-zoom-label').textContent = Math.round(state.zoom * 100) + '%';
    el('of-count').textContent = `${lay.all.length} of ${data.positions.length} positions`;
    const st = el('of-static');
    if (st) st.remove();
  }

  // ---- controls -------------------------------------------------------------
  function setZoom(z) { state.zoom = Math.min(2.5, Math.max(0.15, z)); stage.style.transform = `scale(${state.zoom})`; el('of-zoom-label').textContent = Math.round(state.zoom * 100) + '%'; }
  el('of-zoom-in').onclick = () => setZoom(state.zoom + 0.1);
  el('of-zoom-out').onclick = () => setZoom(state.zoom - 0.1);
  el('of-zoom-reset').onclick = () => { setZoom(1); };
  el('of-fit').onclick = () => {
    const scale = Math.min(wrap.clientWidth / stage.scrollWidth, wrap.clientHeight / stage.scrollHeight, 1);
    setZoom(scale);
    wrap.scrollTo({ left: Math.max(0, (stage.scrollWidth * state.zoom - wrap.clientWidth) / 2), top: 0 });
  };
  el('of-expand').onclick = () => { state.collapsed.clear(); state.expanded.clear(); state.depth = 99; syncDepthButtons(); render(); };
  el('of-collapse-all').onclick = () => { state.depth = 1; state.collapsed = new Set(); state.expanded.clear(); syncDepthButtons(); render(); };
  function syncDepthButtons() {
    document.querySelectorAll('#of-depth button').forEach(b => b.classList.toggle('active', +b.dataset.depth === state.depth));
  }
  document.querySelectorAll('#of-depth button').forEach(b => {
    b.onclick = () => { state.depth = +b.dataset.depth; state.collapsed = new Set(); state.expanded.clear(); syncDepthButtons(); render(); };
  });
  syncDepthButtons();

  // filter selects — only offered when the field was included in the export
  function fillSelect(id, key, values) {
    const sel = el(id);
    if (!sel) return;
    if (!values.size) { sel.closest('.of-filter').style.display = 'none'; return; }
    sel.innerHTML = `<option value="">${sel.dataset.label}</option>` + [...values].sort().map(v => `<option>${esc(v)}</option>`).join('');
    sel.onchange = () => { state.filter[key] = sel.value; render(); };
  }
  fillSelect('of-group', 'group', new Set(data.positions.map(p => p.group).filter(Boolean)));
  fillSelect('of-site', 'site', new Set(data.positions.map(p => p.location).filter(Boolean)));
  fillSelect('of-type', 'type', new Set(data.positions.map(p => p.type).filter(Boolean)));

  // search — reveals the included ancestor path and centers the hit
  el('of-search').addEventListener('input', e => {
    state.q = e.target.value.trim().toLowerCase();
    state.hits = []; state.hitIndex = -1;
    if (state.q) {
      for (const n of byId.values()) {
        const hay = [displayName(n), n.title, n.group, n.location, n.type, n.person?.employeeNumber].filter(Boolean).join(' ').toLowerCase();
        if (hay.includes(state.q)) state.hits.push(n.id);
      }
    }
    if (state.hits.length) {
      state.depth = 99; syncDepthButtons();
      for (const id of state.hits) {
        let cur = byId.get(id)?.managerId;
        while (cur) { state.collapsed.delete(cur); cur = byId.get(cur)?.managerId; }
      }
      state.hitIndex = 0;
    }
    render();
    if (state.hitIndex >= 0) centerHit();
    el('of-hits').textContent = state.q ? `${state.hits.length} match${state.hits.length === 1 ? '' : 'es'}` : '';
  });
  function centerHit() {
    const id = state.hits[state.hitIndex];
    const node = stage.querySelector(`[data-id="${CSS.escape(id)}"]`);
    node?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }
  el('of-prev').onclick = () => { if (state.hits.length) { state.hitIndex = (state.hitIndex - 1 + state.hits.length) % state.hits.length; centerHit(); } };
  el('of-next').onclick = () => { if (state.hits.length) { state.hitIndex = (state.hitIndex + 1) % state.hits.length; centerHit(); } };

  // expand / collapse + details
  stage.addEventListener('click', e => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      if (toggle.textContent.startsWith('+')) { state.expanded.add(id); state.collapsed.delete(id); }
      else { state.collapsed.add(id); state.expanded.delete(id); }
      render();
      return;
    }
    const card = e.target.closest('.of-card');
    if (card) showDetails(card.dataset.id);
  });
  stage.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.of-card')) { e.preventDefault(); showDetails(e.target.closest('.of-card').dataset.id); }
  });
  const detailFields = [
    ['title', 'Title'], ['type', 'Type'], ['group', 'Group / team'], ['location', 'Location / site'],
    ['status', 'Approval'], ['hiringState', 'Hiring'], ['fte', 'FTE'],
    ['startDate', 'Start'], ['endDate', 'End'], ['costCenter', 'Cost center'], ['jobFamily', 'Job family']
  ];
  function showDetails(id) {
    const n = byId.get(id); if (!n) return;
    const rows = detailFields
      .filter(([k]) => k === 'title' || k === 'type' || F.has(k))
      .map(([k, label]) => `<tr><th>${esc(label)}</th><td>${esc(k === 'fte' ? OF.fteText(n[k] ?? 0) : n[k] || '—')}</td></tr>`);
    if (n.person) {
      if (n.person.name) rows.push(`<tr><th>Person</th><td>${esc(n.person.name)}</td></tr>`);
      if (n.person.employeeNumber) rows.push(`<tr><th>Employee no</th><td>${esc(n.person.employeeNumber)}</td></tr>`);
    }
    if (n.secondaryManagerId) rows.push(`<tr><th>Dotted line</th><td>${esc(byId.get(n.secondaryManagerId)?.title || n.secondaryManagerId)}</td></tr>`);
    rows.push(`<tr><th>Reports</th><td>${n.children.length} direct · ${totalReports.get(n.id) || 0} total</td></tr>`);
    el('of-details').innerHTML = `<div class="of-detail-head"><b>${esc(displayName(n))}</b><button class="of-x" id="of-detail-close" aria-label="Close details">×</button></div><table>${rows.join('')}</table>`;
    el('of-details').classList.add('open');
    el('of-detail-close').onclick = () => el('of-details').classList.remove('open');
  }

  // drag-pan on empty canvas (mouse/pen); touch keeps native scrolling
  wrap.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0 || e.target.closest('.of-card')) return;
    const sx = e.clientX, sy = e.clientY, sl = wrap.scrollLeft, st = wrap.scrollTop;
    wrap.classList.add('panning');
    const move = ev => { wrap.scrollLeft = sl - (ev.clientX - sx); wrap.scrollTop = st - (ev.clientY - sy); ev.preventDefault(); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); wrap.classList.remove('panning'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // context header
  const scopeText = data.scope?.rootId ? `Team: ${data.scope.rootTitle}` : 'Whole organization';
  el('of-context').innerHTML = `<b>${esc(data.companyName || 'Organization')}</b> · ${esc(data.chartTitle || data.scenario?.name || '')} · ${esc(data.scenario?.name || '')} · ${esc(scopeText)} · exported ${esc(String(data.exportedAt || '').slice(0, 10))} · read-only snapshot — not live data`;

  render();
  el('of-fit').click();
})();
