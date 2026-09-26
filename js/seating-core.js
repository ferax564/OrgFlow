/** Seating plans: rooms drawn as wall outlines, desks placed inside them and assigned to positions.
 *  Pure data rules shared by the planner, the enterprise host and tests. Units are centimetres. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OrgFlowSeating = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_ROOMS = 50, MAX_DESKS_PER_ROOM = 600, MAX_DESKS = 5000, MAX_POINTS = 64;
  const MAX_COORD = 20000; // 200 m
  const MIN_DESK = 30, MAX_DESK = 500;
  const DESK_DEFAULTS = Object.freeze({ w: 160, h: 80 });
  const BLOCK_DEFAULTS = Object.freeze({ layout: 'pairs', gap: 0, aisle: 120, spacing: 20 });
  // Floor-plan images are embedded in the workspace (12 MB document limit), so keep them bounded.
  const MAX_BACKGROUND_CHARS = 2500000, MAX_BACKGROUND_TOTAL = 8000000;
  const BACKGROUND_TYPES = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
  const SHAPES = ['rect', 'L', 'U', 'T'];

  function makeId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function text(value, label, max, required = false) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') throw new Error(`${label} must be text.`);
    const out = value.trim();
    if (out.length > max) throw new Error(`${label} is longer than ${max} characters.`);
    if (required && !out) throw new Error(`${label} is required.`);
    return out;
  }
  function num(value, label, min, max) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
    return Math.round(n);
  }
  function normRotation(r) { const n = Math.round(Number(r) || 0) % 360; return n < 0 ? n + 360 : n; }

  // ---- Geometry --------------------------------------------------------
  function snap(value, grid) { return grid > 0 ? Math.round(value / grid) * grid : Math.round(value); }
  function rectOutline(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
  function bounds(points) {
    if (!points?.length) return { x: 0, y: 0, w: 0, h: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, maxX, maxY };
  }
  /** Area in square metres. */
  function polygonArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) { const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length]; a += x1 * y2 - x2 * y1; }
    return Math.abs(a) / 2 / 10000;
  }
  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      if (onSegment(x, y, xi, yi, xj, yj)) return true;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function onSegment(px, py, x1, y1, x2, y2) {
    const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
    if (Math.abs(cross) > 1e-6 * Math.max(1, Math.hypot(x2 - x1, y2 - y1))) return false;
    return px >= Math.min(x1, x2) - 1e-6 && px <= Math.max(x1, x2) + 1e-6 && py >= Math.min(y1, y2) - 1e-6 && py <= Math.max(y1, y2) + 1e-6;
  }
  function segmentsCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }
  /** True when two non-adjacent walls cross or touch (a corner on another wall, or a corner used twice),
   *  i.e. the outline is not a simple polygon. Neighbouring walls may share only their common corner. */
  function selfIntersects(points) {
    const n = points.length, on = (p, a, b) => onSegment(p[0], p[1], a[0], a[1], b[0], b[1]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = points[i], b = points[(i + 1) % n], c = points[j], d = points[(j + 1) % n];
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        // Adjacent walls: fold-backs overlap beyond the shared corner.
        const shared = j === i + 1 ? b : a, far1 = j === i + 1 ? a : b, far2 = j === i + 1 ? d : c;
        if (n > 3 && (on(far1, c, d) || on(far2, a, b)) && !(far1[0] === shared[0] && far1[1] === shared[1])) return true;
        continue;
      }
      if (segmentsCross(a, b, c, d) || on(a, c, d) || on(b, c, d) || on(c, a, b) || on(d, a, b)) return true;
    }
    return false;
  }
  /** Removes repeated and collinear points so an outline drawn click-by-click stays tidy. */
  function simplifyOutline(points) {
    let pts = points.map(([x, y]) => [Math.round(x), Math.round(y)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
    let changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) === 0) { pts.splice(i, 1); changed = true; break; }
      }
    }
    return pts;
  }
  function deskCorners(d) {
    const rad = normRotation(d.rotation) * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad), hw = d.w / 2, hh = d.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [d.x + x * cos - y * sin, d.y + x * sin + y * cos]);
  }
  function deskBounds(d) { return bounds(deskCorners(d)); }
  function deskInsideRoom(d, outline) {
    const corners = deskCorners(d);
    if (!corners.every(([x, y]) => pointInPolygon(x, y, outline))) return false;
    // A concave corner can poke into the desk even when all four desk corners are inside.
    for (let i = 0; i < 4; i++) for (let j = 0; j < outline.length; j++) if (segmentsCross(corners[i], corners[(i + 1) % 4], outline[j], outline[(j + 1) % outline.length])) return false;
    return true;
  }
  /** Separating-axis overlap test for rotated desks; touching edges do not count as overlap. */
  function desksOverlap(a, b) {
    const ca = deskCorners(a), cb = deskCorners(b);
    for (const poly of [ca, cb]) for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4], nx = y1 - y2, ny = x2 - x1;
      const proj = pts => pts.map(([x, y]) => x * nx + y * ny), pa = proj(ca), pb = proj(cb);
      const tol = 1e-6 * Math.hypot(nx, ny) * 1000;
      if (Math.max(...pa) <= Math.min(...pb) + tol || Math.max(...pb) <= Math.min(...pa) + tol) return false;
    }
    return true;
  }
  /** Desks that sit outside the walls or on top of each other, for the editor's warnings. */
  function roomIssues(room) {
    const outside = [], overlapping = new Set();
    for (const d of room.desks) if (!deskInsideRoom(d, room.outline)) outside.push(d.id);
    for (let i = 0; i < room.desks.length; i++) {
      const bi = deskBounds(room.desks[i]);
      for (let j = i + 1; j < room.desks.length; j++) {
        const bj = deskBounds(room.desks[j]);
        if (bi.maxX <= bj.x || bj.maxX <= bi.x || bi.maxY <= bj.y || bj.maxY <= bi.y) continue;
        if (desksOverlap(room.desks[i], room.desks[j])) { overlapping.add(room.desks[i].id); overlapping.add(room.desks[j].id); }
      }
    }
    return { outside, overlapping: [...overlapping] };
  }

  // ---- Validation --------------------------------------------------------
  function sanitizeOutline(points, label) {
    if (!Array.isArray(points) || points.length < 3 || points.length > MAX_POINTS) throw new Error(`${label} needs between 3 and ${MAX_POINTS} wall corners.`);
    const out = points.map(p => {
      if (!Array.isArray(p) || p.length !== 2) throw new Error(`${label} has an invalid wall corner.`);
      return [num(p[0], `${label} corner`, 0, MAX_COORD), num(p[1], `${label} corner`, 0, MAX_COORD)];
    });
    const clean = simplifyOutline(out);
    if (clean.length >= 4 && selfIntersects(clean)) throw new Error(`${label} has walls that cross each other.`);
    if (clean.length < 3 || polygonArea(clean) < 0.25) throw new Error(`${label} is too small; draw at least 0.25 m².`);
    return clean;
  }
  function sanitizeDesk(d, label) {
    if (!d || typeof d !== 'object') throw new Error(`${label} has an invalid desk.`);
    const id = text(d.id, 'Desk ID', 150, true);
    const out = {
      id, label: text(d.label, 'Desk label', 40),
      x: num(d.x, 'Desk position', 0, MAX_COORD), y: num(d.y, 'Desk position', 0, MAX_COORD),
      w: num(d.w ?? DESK_DEFAULTS.w, 'Desk width', MIN_DESK, MAX_DESK), h: num(d.h ?? DESK_DEFAULTS.h, 'Desk depth', MIN_DESK, MAX_DESK),
      rotation: normRotation(d.rotation), positionId: text(d.positionId, 'Assigned position', 150), hotDesk: d.hotDesk === true
    };
    if (out.hotDesk && out.positionId) throw new Error(`Desk ${out.label || id} is a shared hot desk and cannot also be assigned.`);
    const note = text(d.note, 'Desk note', 300);
    if (note) out.note = note;
    return out;
  }
  /** A traced floor-plan image under the room. An empty image (stripped from a local history copy) drops the background. */
  function sanitizeBackground(bg, label) {
    if (bg === undefined || bg === null) return undefined;
    if (typeof bg !== 'object') throw new Error(`${label} has an invalid floor plan.`);
    if (bg.image === '') return undefined;
    if (typeof bg.image !== 'string' || bg.image.length > MAX_BACKGROUND_CHARS || !BACKGROUND_TYPES.test(bg.image)) throw new Error(`${label}: the floor plan must be a PNG, JPEG or WebP image under ${Math.round(MAX_BACKGROUND_CHARS * 0.75 / 1e6 * 10) / 10} MB.`);
    const opacity = Number(bg.opacity ?? 0.6);
    return {
      image: bg.image,
      x: num(bg.x, 'Floor plan position', -MAX_COORD, MAX_COORD), y: num(bg.y, 'Floor plan position', -MAX_COORD, MAX_COORD),
      w: num(bg.w, 'Floor plan width', 10, MAX_COORD * 2), h: num(bg.h, 'Floor plan height', 10, MAX_COORD * 2),
      opacity: Number.isFinite(opacity) ? Math.round(Math.max(0.05, Math.min(1, opacity)) * 100) / 100 : 0.6,
      hidden: bg.hidden === true
    };
  }
  function sanitizeSeating(input) {
    if (input === undefined || input === null) return { rooms: [] };
    if (typeof input !== 'object' || !Array.isArray(input.rooms)) throw new Error('Seating must contain a rooms list.');
    if (input.rooms.length > MAX_ROOMS) throw new Error(`At most ${MAX_ROOMS} rooms are supported.`);
    const roomIds = new Set(), deskIds = new Set(), seated = new Map();
    let total = 0, imageChars = 0;
    const rooms = input.rooms.map((r, index) => {
      if (!r || typeof r !== 'object') throw new Error(`Invalid room at position ${index + 1}.`);
      const id = text(r.id, 'Room ID', 150, true), name = text(r.name, 'Room name', 80, true);
      if (roomIds.has(id)) throw new Error(`Duplicate room ID: ${id}.`);
      roomIds.add(id);
      if (!Array.isArray(r.desks) || r.desks.length > MAX_DESKS_PER_ROOM) throw new Error(`${name} can hold at most ${MAX_DESKS_PER_ROOM} desks.`);
      total += r.desks.length;
      if (total > MAX_DESKS) throw new Error(`At most ${MAX_DESKS} desks are supported across all rooms.`);
      const desks = r.desks.map(d => {
        const desk = sanitizeDesk(d, name);
        if (deskIds.has(desk.id)) throw new Error(`Duplicate desk ID: ${desk.id}.`);
        deskIds.add(desk.id);
        if (desk.positionId) {
          if (seated.has(desk.positionId)) throw new Error(`Position ${desk.positionId} is assigned to two desks (${seated.get(desk.positionId)} and ${desk.label || desk.id}).`);
          seated.set(desk.positionId, desk.label || desk.id);
        }
        return desk;
      });
      const out = {
        id, name, floor: text(r.floor, 'Floor / building', 80),
        outline: sanitizeOutline(r.outline, name), desks,
        deskSize: { w: num(r.deskSize?.w ?? DESK_DEFAULTS.w, 'Default desk width', MIN_DESK, MAX_DESK), h: num(r.deskSize?.h ?? DESK_DEFAULTS.h, 'Default desk depth', MIN_DESK, MAX_DESK) }
      };
      const background = sanitizeBackground(r.background, name);
      if (background) { imageChars += background.image.length; out.background = background; }
      return out;
    });
    if (imageChars > MAX_BACKGROUND_TOTAL) throw new Error('Floor plan images are too large together. Remove one or import smaller images.');
    return { rooms };
  }

  // ---- Editing helpers --------------------------------------------------------
  /** Next wall corner while drawing: snapped to the grid and, unless `free`, to 45° steps from the previous corner. */
  function snapWallPoint(last, p, grid, free = false) {
    const g = { x: snap(p.x, grid), y: snap(p.y, grid) };
    if (!last || free) return g;
    const dx = p.x - last.x, dy = p.y - last.y, angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const ux = Math.round(Math.cos(angle)), uy = Math.round(Math.sin(angle));
    if (!ux || !uy) return ux ? { x: g.x, y: last.y } : { x: last.x, y: g.y };
    // Diagonal: equal steps in x and y keep the corner on the grid.
    const step = snap((Math.abs(dx) + Math.abs(dy)) / 2, grid);
    return { x: last.x + ux * step, y: last.y + uy * step };
  }
  /** Preset outlines that fill a bounding box: rectangle, L, U and T shapes. */
  function shapeOutline(kind, x, y, w, h, grid = 10) {
    const X = v => snap(x + v * w, grid), Y = v => snap(y + v * h, grid);
    if (kind === 'L') return [[X(0), Y(0)], [X(1), Y(0)], [X(1), Y(0.5)], [X(0.5), Y(0.5)], [X(0.5), Y(1)], [X(0), Y(1)]];
    if (kind === 'U') return [[X(0), Y(0)], [X(1 / 3), Y(0)], [X(1 / 3), Y(0.5)], [X(2 / 3), Y(0.5)], [X(2 / 3), Y(0)], [X(1), Y(0)], [X(1), Y(1)], [X(0), Y(1)]];
    if (kind === 'T') return [[X(0), Y(0)], [X(1), Y(0)], [X(1), Y(0.45)], [X(2 / 3), Y(0.45)], [X(2 / 3), Y(1)], [X(1 / 3), Y(1)], [X(1 / 3), Y(0.45)], [X(0), Y(0.45)]];
    return rectOutline(snap(x, grid), snap(y, grid), snap(w, grid), snap(h, grid));
  }
  /** Stretches any outline to a new bounding width and depth, keeping its shape and top-left corner. */
  function scaleOutline(outline, w, h) {
    const b = bounds(outline);
    if (!b.w || !b.h) throw new Error('This room has no area to resize.');
    return simplifyOutline(outline.map(([x, y]) => [b.x + (x - b.x) * w / b.w, b.y + (y - b.y) * h / b.h]));
  }
  /** Rescales a floor plan so the distance between two picked points equals `realCm`, keeping the first point fixed. */
  function calibrateBackground(bg, a, b, realCm) {
    const measured = Math.hypot(b.x - a.x, b.y - a.y), real = Number(realCm);
    if (measured < 1) throw new Error('Pick two points further apart.');
    if (!Number.isFinite(real) || real <= 0) throw new Error('Enter the real distance between the two points.');
    const f = real / measured;
    return { ...bg, x: Math.round(a.x - (a.x - bg.x) * f), y: Math.round(a.y - (a.y - bg.y) * f), w: Math.round(bg.w * f), h: Math.round(bg.h * f) };
  }
  /** Undo snapshots are whole workspace strings; plan images inside them are swapped for references
   *  into `store` so repeated edits keep one copy of each image instead of one per snapshot. */
  const PLAN_IMAGE_IN_JSON = /"image":"(data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)"/g;
  function packPlanImages(text, store) {
    return String(text).replace(PLAN_IMAGE_IN_JSON, (_, data) => {
      let id = store.ids.get(data);
      if (id === undefined) { id = store.data.length; store.ids.set(data, id); store.data.push(data); }
      return `"image":"orgflow-plan:${id}"`;
    });
  }
  function unpackPlanImages(text, store) {
    return String(text).replace(/"image":"orgflow-plan:(\d+)"/g, (_, id) => `"image":"${store.data[Number(id)] || ''}"`);
  }
  /** Local history copies drop plan images; put them back from the live workspace when a room still has one. */
  function restoreBackgrounds(target, source) {
    const byId = new Map((source?.rooms || []).filter(r => r.background?.image).map(r => [r.id, r.background.image]));
    for (const room of target?.rooms || []) if (room.background && !room.background.image && byId.has(room.id)) room.background.image = byId.get(room.id);
    return target;
  }
  function createRoom({ id = makeId('room'), name = 'Room', floor = '', width = 1200, depth = 800, x = 100, y = 100 } = {}) {
    return { id, name, floor, outline: rectOutline(x, y, num(width, 'Room width', 50, MAX_COORD - x), num(depth, 'Room depth', 50, MAX_COORD - y)), desks: [], deskSize: { ...DESK_DEFAULTS } };
  }
  /** The next free label such as D7, continuing the highest number already used with that prefix. */
  function nextDeskLabels(existing, count = 1, prefix = 'D') {
    const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$', 'i');
    let max = 0;
    for (const l of existing) { const m = re.exec(String(l || '')); if (m) max = Math.max(max, Number(m[1])); }
    return Array.from({ length: count }, (_, i) => `${prefix}${max + i + 1}`);
  }
  /** Fits as many desks as possible into a dragged rectangle.
   *  `pairs` places back-to-back benches with an aisle between each bench; `rows` faces every desk the same way. */
  function planDeskBlock(rect, { w = DESK_DEFAULTS.w, h = DESK_DEFAULTS.h, layout = BLOCK_DEFAULTS.layout, spacing = BLOCK_DEFAULTS.spacing, aisle = BLOCK_DEFAULTS.aisle } = {}) {
    const x0 = Math.min(rect.x, rect.x + rect.w), y0 = Math.min(rect.y, rect.y + rect.h), W = Math.abs(rect.w), H = Math.abs(rect.h);
    const cols = Math.floor((W + spacing) / (w + spacing));
    if (cols < 1 || H < h) return [];
    const rowsY = [];
    if (layout === 'pairs') {
      // Each bench is two desks back to back (2h deep); a lone desk fills a final strip that fits only one.
      let y = 0;
      while (y + h <= H + 1e-9) {
        rowsY.push({ y: y + h / 2, rotation: 180 });
        if (y + 2 * h <= H + 1e-9) rowsY.push({ y: y + 1.5 * h, rotation: 0 });
        y += 2 * h + aisle;
      }
    } else {
      for (let y = 0; y + h <= H + 1e-9; y += h + aisle) rowsY.push({ y: y + h / 2, rotation: 0 });
    }
    const usedW = cols * w + (cols - 1) * spacing, offX = (W - usedW) / 2;
    const out = [];
    for (const row of rowsY) for (let c = 0; c < cols; c++) out.push({ x: Math.round(x0 + offX + c * (w + spacing) + w / 2), y: Math.round(y0 + row.y), w, h, rotation: row.rotation });
    return out;
  }
  function addDesks(room, specs, idFactory = () => makeId('desk'), prefix = 'D') {
    if (room.desks.length + specs.length > MAX_DESKS_PER_ROOM) throw new Error(`${room.name} can hold at most ${MAX_DESKS_PER_ROOM} desks.`);
    const labels = nextDeskLabels(room.desks.map(d => d.label), specs.length, prefix);
    const added = specs.map((s, i) => ({ id: idFactory(), label: s.label || labels[i], x: Math.round(s.x), y: Math.round(s.y), w: s.w ?? room.deskSize.w, h: s.h ?? room.deskSize.h, rotation: normRotation(s.rotation), positionId: '', hotDesk: false }));
    room.desks.push(...added);
    return added;
  }
  function findDesk(seating, deskId) {
    for (const room of seating?.rooms || []) { const desk = room.desks.find(d => d.id === deskId); if (desk) return { room, desk }; }
    return null;
  }
  function deskForPosition(seating, positionId) {
    if (!positionId) return null;
    for (const room of seating?.rooms || []) { const desk = room.desks.find(d => d.positionId === positionId); if (desk) return { room, desk }; }
    return null;
  }
  /** Seats a position at a desk, freeing any desk it held before. Mutates and returns what moved. */
  function assignDesk(seating, deskId, positionId) {
    const target = findDesk(seating, deskId);
    if (!target) throw new Error('Desk not found.');
    if (positionId && target.desk.hotDesk) throw new Error('Hot desks are shared and cannot be assigned.');
    const previous = positionId ? deskForPosition(seating, positionId) : null;
    if (previous && previous.desk.id !== deskId) previous.desk.positionId = '';
    const displaced = target.desk.positionId && target.desk.positionId !== positionId ? target.desk.positionId : '';
    target.desk.positionId = positionId || '';
    return { movedFrom: previous && previous.desk.id !== deskId ? previous : null, displaced };
  }
  /** Assigns unseated staffed positions to free desks in one room, keeping each group together.
   *  Desks are filled in reading order (top-to-bottom, left-to-right). Returns the number seated. */
  function autoSeat(seating, roomId, positions, { includeVacant = false } = {}) {
    const room = seating.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('Room not found.');
    const seated = new Set(seating.rooms.flatMap(r => r.desks.map(d => d.positionId)).filter(Boolean));
    const waiting = positions.filter(p => !seated.has(p.id) && (includeVacant || p.personId))
      .sort((a, b) => String(a.group || '').localeCompare(String(b.group || '')) || String(a.managerId || '').localeCompare(String(b.managerId || '')) || String(a.title).localeCompare(String(b.title)));
    const free = room.desks.filter(d => !d.positionId && !d.hotDesk).sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
    const n = Math.min(waiting.length, free.length);
    for (let i = 0; i < n; i++) free[i].positionId = waiting[i].id;
    return n;
  }
  function duplicateRoom(room, idFactory = makeId) {
    const copy = JSON.parse(JSON.stringify(room));
    copy.id = idFactory('room');
    delete copy.background; // images are large; import the plan again if the copy needs it
    copy.name = `${room.name} (copy)`.slice(0, 80);
    copy.desks = copy.desks.map(d => ({ ...d, id: idFactory('desk'), positionId: '' }));
    return copy;
  }
  /** Clears desks that point at positions which no longer exist anywhere in the workspace. */
  function clearMissing(seating, knownPositionIds) {
    let cleared = 0;
    for (const room of seating.rooms) for (const d of room.desks) if (d.positionId && !knownPositionIds.has(d.positionId)) { d.positionId = ''; cleared++; }
    return cleared;
  }

  // ---- Reporting --------------------------------------------------------
  function summarize(seating, positions) {
    const byId = new Map(positions.map(p => [p.id, p]));
    const rooms = (seating?.rooms || []).map(room => {
      let assigned = 0, hot = 0, missing = 0;
      for (const d of room.desks) { if (d.hotDesk) hot++; else if (d.positionId) { if (byId.has(d.positionId)) assigned++; else missing++; } }
      return { id: room.id, name: room.name, floor: room.floor, desks: room.desks.length, assigned, hot, missing, free: room.desks.length - assigned - hot - missing, area: Math.round(polygonArea(room.outline) * 10) / 10 };
    });
    const seatedIds = new Set((seating?.rooms || []).flatMap(r => r.desks.map(d => d.positionId)).filter(id => byId.has(id)));
    const staffed = positions.filter(p => p.personId);
    return {
      rooms,
      desks: rooms.reduce((n, r) => n + r.desks, 0), assigned: rooms.reduce((n, r) => n + r.assigned, 0), free: rooms.reduce((n, r) => n + r.free, 0), hot: rooms.reduce((n, r) => n + r.hot, 0), missing: rooms.reduce((n, r) => n + r.missing, 0),
      unseatedPeople: staffed.filter(p => !seatedIds.has(p.id)).length, seatedPeople: staffed.filter(p => seatedIds.has(p.id)).length
    };
  }
  const CSV_COLUMNS = ['room', 'floor', 'desk', 'deskId', 'hotDesk', 'positionId', 'positionTitle', 'person', 'group', 'location'];
  /** One row per desk, with the occupant resolved against a scenario's positions and people. */
  function seatingRows(seating, positions, employees = []) {
    const byId = new Map(positions.map(p => [p.id, p])), people = new Map(employees.map(e => [e.id, e]));
    const rows = [];
    for (const room of seating?.rooms || []) for (const d of [...room.desks].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))) {
      const p = byId.get(d.positionId);
      rows.push([room.name, room.floor, d.label, d.id, d.hotDesk ? 'yes' : 'no', d.positionId, p ? p.title : d.positionId ? '(not in this scenario)' : '', p?.personId ? people.get(p.personId)?.name || '' : '', p?.group || '', p?.location || '']);
    }
    return rows;
  }

  return {
    packPlanImages, unpackPlanImages,
    MAX_BACKGROUND_CHARS, MAX_BACKGROUND_TOTAL, SHAPES, sanitizeBackground, snapWallPoint, shapeOutline, scaleOutline, calibrateBackground, restoreBackgrounds,
    MAX_ROOMS, MAX_DESKS_PER_ROOM, MAX_DESKS, MAX_POINTS, MAX_COORD, MIN_DESK, MAX_DESK, DESK_DEFAULTS, BLOCK_DEFAULTS, CSV_COLUMNS,
    makeId, snap, rectOutline, bounds, polygonArea, pointInPolygon, selfIntersects, simplifyOutline,
    deskCorners, deskBounds, deskInsideRoom, desksOverlap, roomIssues, normRotation,
    sanitizeSeating, createRoom, nextDeskLabels, planDeskBlock, addDesks, findDesk, deskForPosition, assignDesk, autoSeat,
    duplicateRoom, clearMissing, summarize, seatingRows
  };
});
