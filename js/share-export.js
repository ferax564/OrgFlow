/**
 * Interactive HTML export. Builds a single self-contained file: the redacted
 * dataset (JSON), the OrgFlow domain script, the standalone viewer, its
 * styles, and a pre-rendered static SVG that remains visible when a recipient
 * opens the file where scripts are blocked.
 */
(function (root) {
  'use strict';
  const OF = typeof module === 'object' && module.exports ? require('./orgflow-core.js') : root.OrgFlow;

  const SHARE_CSS = `
:root{--of-ink:#0f172a;--of-muted:#64748b;--of-line:#dbe2ea;--of-panel:#fff;--of-bg:#f3f5f9;--of-accent:#4f46e5}
*{box-sizing:border-box}body{margin:0;font:13px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--of-bg);color:var(--of-ink)}
.of-bar{position:sticky;top:0;z-index:20;background:#fffffff2;backdrop-filter:blur(10px);border-bottom:1px solid var(--of-line);padding:10px 14px}
#of-context{font-size:12px;color:var(--of-muted);margin-bottom:8px}#of-context b{color:var(--of-ink)}
.of-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.of-tools button,.of-tools select{height:30px;border:1px solid var(--of-line);border-radius:8px;background:var(--of-panel);color:var(--of-ink);font-size:11.5px;font-weight:650;padding:0 10px;cursor:pointer}
.of-tools button:hover{border-color:var(--of-accent)}
#of-search{height:30px;border:1px solid var(--of-line);border-radius:8px;padding:0 10px;font-size:12px;min-width:180px;background:var(--of-panel);color:var(--of-ink)}
#of-hits{font-size:10.5px;color:var(--of-muted);min-width:52px}
#of-depth{display:inline-flex;gap:2px;background:var(--of-bg);border:1px solid var(--of-line);border-radius:9px;padding:2px}
#of-depth button{border:0;background:transparent;height:24px;padding:0 9px;border-radius:6px}
#of-depth button.active{background:var(--of-panel);box-shadow:0 1px 3px #0002;color:var(--of-ink)}
#of-count{margin-left:auto;font-size:10.5px;color:var(--of-muted);font-weight:700}
.of-filter{display:inline-flex}
#of-wrap{position:fixed;inset:118px 0 0 0;overflow:auto;cursor:grab}
#of-wrap.panning{cursor:grabbing;user-select:none}
#of-stage{position:relative;transform-origin:0 0;padding:0}
.of-svg{position:absolute;left:0;top:0;overflow:visible}
.of-line{fill:none;stroke:#b9c2cf;stroke-width:1.5}
.of-dotted{stroke-dasharray:5 4}
.of-card{position:absolute;background:var(--of-panel);border:1px solid var(--of-line);border-radius:12px;box-shadow:0 8px 16px rgba(15,23,42,.07);padding:10px 12px;cursor:pointer}
.of-card:hover{border-color:var(--of-accent)}
.of-card.hit{outline:3px solid color-mix(in srgb,var(--of-accent) 35%,transparent);border-color:var(--of-accent)}
.of-card.vacant{border-style:dashed}
.of-photo{position:absolute;right:10px;top:10px;width:34px;height:34px;object-fit:cover;border-radius:8px;border:1px solid var(--of-line)}
.of-name{font-size:12.5px;font-weight:800;line-height:1.25;padding-right:36px}
.of-role{font-size:10px;color:var(--of-muted);font-weight:650;margin-top:3px}
.of-meta{font-size:9.5px;color:var(--of-muted)}
.of-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
.of-chips span{font-size:8.5px;font-weight:800;padding:2.5px 6px;border-radius:6px;background:var(--of-bg);border:1px solid var(--of-line);color:var(--of-muted)}
.of-toggle{position:absolute;left:50%;transform:translateX(-50%);bottom:-13px;min-width:22px;height:22px;border-radius:11px;border:1px solid var(--of-line);background:var(--of-panel);font-size:11px;font-weight:800;cursor:pointer;color:var(--of-accent);box-shadow:0 2px 5px #0001}
#of-details{position:fixed;top:118px;right:0;bottom:0;width:300px;background:var(--of-panel);border-left:1px solid var(--of-line);padding:16px;overflow:auto;transform:translateX(100%);transition:transform .18s ease;z-index:15}
#of-details.open{transform:none}
.of-detail-head{display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-bottom:10px}
.of-x{border:0;background:var(--of-bg);border-radius:7px;width:26px;height:26px;cursor:pointer;font-size:14px}
#of-details table{width:100%;border-collapse:collapse;font-size:11.5px}
#of-details th{text-align:left;color:var(--of-muted);font-weight:650;padding:6px 8px 6px 0;vertical-align:top;width:96px}
#of-details td{padding:6px 0;border-bottom:1px solid var(--of-bg)}
#of-static{padding:18px}
.of-empty{padding:40px;color:var(--of-muted)}
.of-noscript{margin:10px 18px;padding:10px 12px;border:1px solid var(--of-line);border-radius:10px;background:#fff8e6;color:#7c5a00;font-size:11.5px}
@media(max-width:760px){#of-wrap{inset:148px 0 0 0}.of-tools{gap:4px}#of-search{min-width:120px}#of-details{width:100%;top:auto;height:46vh}}
`;

  // ---- static fallback: render the initially visible chart as plain SVG ----
  function shareStaticSvg(dataset) {
    const byId = new Map();
    const roots = [];
    (dataset.positions || []).forEach(p => byId.set(p.id, Object.assign({}, p, { children: [] })));
    (dataset.positions || []).forEach(p => {
      const n = byId.get(p.id);
      const parent = p.managerId ? byId.get(p.managerId) : null;
      (parent ? parent.children : roots).push(n);
    });
    const cmp = (a, b) => ((a.sortOrder || 0) - (b.sortOrder || 0)) || ((a.type === 'Head' ? -1 : 0) - (b.type === 'Head' ? -1 : 0)) || String(a.title).localeCompare(String(b.title));
    (function sortAll(l) { l.sort(cmp); l.forEach(n => sortAll(n.children)); })(roots);
    const depth = [1, 2, 3, 99].includes(dataset.initialDepth) ? dataset.initialDepth : 99;
    const F = new Set(dataset.fields || []);
    function prune(n, d) {
      const copy = Object.assign({}, n);
      copy.children = d >= depth ? [] : n.children.map(c => prune(c, d + 1));
      return copy;
    }
    const forest = roots.map(n => prune(n, 1));
    const name = n => OF.shareDisplayName(n);
    for (const n of (function flat(l) { const o = []; l.forEach(n => { o.push(n); o.push(...flat(n.children)); }); return o; })(forest)) {
      const nameLines = OF.wrapText(name(n), 186, 7.1).slice(0, 4);
      const titleLines = OF.wrapText(n.title || '', 224, 5.7).slice(0, 3);
      const groupLines = F.has('group') ? OF.wrapText(n.group || 'No group', 224, 5.4).slice(0, 2) : [];
      const siteLines = F.has('location') ? OF.wrapText(n.location || 'No site', 224, 5.4).slice(0, 2) : [];
      let h = 14 + Math.max(nameLines.length * 15, 30) + 4 + titleLines.length * 13 + groupLines.length * 13 + siteLines.length * 13 + 32;
      n._cardW = 248; n._cardH = h; n._lines = { nameLines, titleLines, groupLines, siteLines };
    }
    const lay = OF.layoutOrgChart(forest, { groupGap: 32 });
    if (!lay.all.length) return '';
    const w = lay.width + 40, h = lay.height + 40;
    const esc = OF.esc;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="ui-sans-serif,system-ui,sans-serif">`;
    for (const c of lay.connectors) svg += `<path d="${c.d}" fill="none" stroke="#b9c2cf" stroke-width="1.5" ${c.kind === 'dotted' ? 'stroke-dasharray="5 4"' : ''}/>`;
    for (const n of lay.all) {
      const x = n._x + 20, y = n._y + 20, m = n._lines;
      const vacant = !OF.shareOccupied(n);
      svg += `<g transform="translate(${x},${y})"><rect width="${n._cardW}" height="${n._cardH}" rx="12" fill="#fff" stroke="#dbe2ea" ${vacant ? 'stroke-dasharray="5 3"' : ''}/>`;
      let ty = 20;
      m.nameLines.forEach((l, i) => { svg += `<text x="12" y="${ty + i * 15}" font-size="12.5" font-weight="800" fill="#0f172a">${esc(l)}</text>`; });
      ty += Math.max(m.nameLines.length * 15, 30) + 4;
      m.titleLines.forEach((l, i) => { svg += `<text x="12" y="${ty + i * 13}" font-size="10" font-weight="650" fill="#64748b">${esc(l)}</text>`; });
      ty += m.titleLines.length * 13;
      m.groupLines.concat(m.siteLines).forEach((l, i) => { svg += `<text x="12" y="${ty + i * 13}" font-size="9.5" fill="#64748b">${esc(l)}</text>`; });
      svg += '</g>';
    }
    return svg + '</svg>';
  }

  function buildShareHtml(dataset, { managementSrc = '', coreSrc = '', viewerSrc = '', staticSvg = '' } = {}) {
    const esc = OF.esc;
    const title = `${dataset.companyName || 'OrgFlow'} · ${dataset.scenario?.name || 'chart'}`;
    const safeJson = JSON.stringify(dataset).replace(/</g, '\\u003c');
    const safeManagement = String(managementSrc).replace(/<\//g, '<\\/');
    const safeCore = String(coreSrc).replace(/<\//g, '<\\/');
    const safeViewer = String(viewerSrc).replace(/<\//g, '<\\/');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)} — interactive chart</title><style>${SHARE_CSS}</style></head><body>
<header class="of-bar"><div id="of-context"></div><div class="of-tools">
<input id="of-search" type="search" placeholder="Search people or positions" aria-label="Search"/><span id="of-hits"></span><button id="of-prev" title="Previous match">‹</button><button id="of-next" title="Next match">›</button>
<span class="of-filter"><select id="of-group" data-label="All groups" aria-label="Filter by group"></select></span>
<span class="of-filter"><select id="of-site" data-label="All sites" aria-label="Filter by site"></select></span>
<span class="of-filter"><select id="of-type" data-label="All types" aria-label="Filter by type"></select></span>
<span id="of-depth"><button data-depth="1">1</button><button data-depth="2">2</button><button data-depth="3">3</button><button data-depth="99">All</button></span>
<button id="of-expand">Expand all</button><button id="of-collapse-all">Collapse all</button>
<button id="of-zoom-out" title="Zoom out">−</button><span id="of-zoom-label">100%</span><button id="of-zoom-in" title="Zoom in">+</button>
<button id="of-fit">Fit</button><button id="of-zoom-reset">Reset</button><span id="of-count"></span>
</div></header>
<div id="of-wrap"><div id="of-stage"><div id="of-static"><noscript><div class="of-noscript">JavaScript is off — this is the static chart. With scripts enabled the same file zooms, pans and expands teams.</div></noscript>${staticSvg}</div></div></div>
<aside id="of-details" aria-label="Position details"></aside>
<script type="application/json" id="orgflow-share">${safeJson}</script>
<script>${safeManagement}</script>
<script>${safeCore}</script>
<script>${safeViewer}</script>
</body></html>`;
  }

  const api = { SHARE_CSS, shareStaticSvg, buildShareHtml };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrgFlowShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
