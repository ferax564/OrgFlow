'use strict';
/**
 * Best-effort recovery of workspaces stranded under a previous desktop
 * origin (http://127.0.0.1:<random-port>). Chromium stores those copies in
 * this profile's Local Storage LevelDB and IndexedDB origin folders.
 */
const fs = require('fs');
const path = require('path');
const { stampOf } = require('./store.cjs');

function extractPlanningJson(text) {
  const found = [];
  let i = 0;
  while (i < text.length) {
    const key = text.indexOf('"activeScenarioId"', i);
    if (key < 0) break;
    const start = text.lastIndexOf('{', key);
    if (start < 0) { i = key + 1; continue; }
    let depth = 0, end = -1, inStr = false, esc = false;
    const limit = Math.min(text.length, start + 6_000_000);
    for (let j = start; j < limit; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end > start) {
      try {
        const obj = JSON.parse(text.slice(start, end + 1));
        const planning = obj.format === 'orgflow.workspace' ? obj.planning : obj;
        if (planning && Array.isArray(planning.scenarios) && planning.scenarios.length) {
          found.push({ planning, envelope: obj.format === 'orgflow.workspace' ? obj : null });
        }
      } catch { /* not a complete JSON object */ }
    }
    i = key + 1;
  }
  return found;
}

function readLocalStorageFiles(dir) {
  const ls = path.join(dir, 'Local Storage', 'leveldb');
  const out = [];
  let names = [];
  try { names = fs.readdirSync(ls); } catch { return out; }
  for (const name of names) {
    if (!/\.(ldb|log|sst)$/i.test(name)) continue;
    let buf;
    try { buf = fs.readFileSync(path.join(ls, name)); } catch { continue; }
    for (const text of [buf.toString('utf8'), buf.toString('utf16le')]) {
      out.push(...extractPlanningJson(text));
    }
  }
  return out;
}

function listRandomPortOrigins(dir) {
  const idb = path.join(dir, 'IndexedDB');
  const found = [];
  let names = [];
  try { names = fs.readdirSync(idb); } catch { return found; }
  for (const name of names) {
    const m = name.match(/^http_127\.0\.0\.1_(\d+)/);
    if (m) found.push({ origin: `http://127.0.0.1:${m[1]}`, path: path.join(idb, name) });
  }
  return found;
}

function uniqueByStamp(rows) {
  const seen = new Set(), out = [];
  for (const row of rows) {
    const stamp = stampOf(JSON.stringify(row.planning)) || { revision: 0, at: '' };
    const key = `${row.planning.workspaceId || ''}:${stamp.revision}:${stamp.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      workspaceId: row.planning.workspaceId || '',
      revision: stamp.revision,
      lastCommittedAt: stamp.at,
      scenarios: row.planning.scenarios.length,
      planning: row.planning,
      branding: row.envelope?.branding || null
    });
  }
  out.sort((a, b) => (b.revision - a.revision) || String(b.lastCommittedAt).localeCompare(String(a.lastCommittedAt)));
  return out;
}

function scanLegacyProfiles(dirs) {
  const uniqueDirs = [...new Set((dirs || []).filter(Boolean))];
  const origins = [];
  const recovered = [];
  for (const dir of uniqueDirs) {
    origins.push(...listRandomPortOrigins(dir).map(o => ({ ...o, profile: dir })));
    recovered.push(...readLocalStorageFiles(dir));
  }
  return { origins, recovered: uniqueByStamp(recovered) };
}

module.exports = { extractPlanningJson, listRandomPortOrigins, scanLegacyProfiles, uniqueByStamp };
