'use strict';
/**
 * Journaled workspace storage owned by the Electron main process. The renderer
 * writes through on every commit, so the document survives even when the
 * browser profile (localStorage/IndexedDB) is lost, moved or reset. Writes go
 * to every configured directory — the portable OrgFlow-data folder when
 * present and the OS-standard userData location — and the newest revision
 * wins on load.
 */
const fs = require('fs');
const path = require('path');

const MAX_BACKUPS = 10;
const FILE_NAME = 'workspace.json';
const BACKUP_DIR = 'workspace-backups';

function atomicWrite(file, text) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// A stored document is the serialized workspace — either a full
// orgflow.workspace envelope or bare planning data. Revision then timestamp
// decides which copy is newer; both live on the planning object.
function stampOf(text) {
  try {
    const p = JSON.parse(text);
    const planning = p?.format === 'orgflow.workspace' ? p.planning : p;
    return { revision: Number.isInteger(planning?.revision) ? planning.revision : 0, at: String(planning?.lastCommittedAt || '') };
  } catch { return null; }
}

function compareStamps(a, b) {
  if (a.revision !== b.revision) return a.revision - b.revision;
  return a.at.localeCompare(b.at);
}

function createWorkspaceStore(dirs) {
  const unique = [...new Set((dirs || []).filter(Boolean))];

  function fileFor(dir) { return path.join(dir, FILE_NAME); }
  function backupDirFor(dir) { return path.join(dir, BACKUP_DIR); }

  function writeDir(dir, text) {
    fs.mkdirSync(backupDirFor(dir), { recursive: true });
    const file = fileFor(dir);
    atomicWrite(file, text);
    const stamp = stampOf(text) || { revision: 0, at: '' };
    const backup = path.join(backupDirFor(dir), `workspace-r${String(stamp.revision).padStart(5, '0')}-${Date.now()}.json`);
    fs.copyFileSync(file, backup);
    const backups = fs.readdirSync(backupDirFor(dir))
      .filter(f => f.startsWith('workspace-') && f.endsWith('.json')).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
      try { fs.unlinkSync(path.join(backupDirFor(dir), old)); } catch { /* rotation is best-effort */ }
    }
  }

  function readDir(dir) {
    const direct = readJson(fileFor(dir));
    if (direct) return { text: JSON.stringify(direct), from: fileFor(dir) };
    // The primary file may be unreadable or partial — fall back to backups.
    try {
      const backups = fs.readdirSync(backupDirFor(dir))
        .filter(f => f.startsWith('workspace-') && f.endsWith('.json')).sort().reverse();
      for (const name of backups) {
        const doc = readJson(path.join(backupDirFor(dir), name));
        if (doc) return { text: JSON.stringify(doc), from: path.join(backupDirFor(dir), name) };
      }
    } catch { /* no backups */ }
    return null;
  }

  return {
    dirs: unique,

    save(text) {
      if (typeof text !== 'string' || !text.length) throw new Error('Nothing to journal.');
      if (stampOf(text) === null) throw new Error('Workspace journal only stores valid JSON.');
      let firstError = null, wrote = 0;
      for (const dir of unique) {
        try { writeDir(dir, text); wrote++; }
        catch (error) { if (!firstError) firstError = error; }
      }
      if (!wrote && firstError) throw firstError;
      return { wrote };
    },

    load() {
      let best = null;
      for (const dir of unique) {
        const found = readDir(dir);
        if (!found) continue;
        const stamp = stampOf(found.text) || { revision: 0, at: '' };
        if (!best || compareStamps(stamp, best.stamp) > 0) best = { ...found, stamp };
      }
      return best ? { text: best.text, from: best.from, dirs: unique } : null;
    },

    paths() { return unique; }
  };
}

module.exports = { createWorkspaceStore, atomicWrite, stampOf, compareStamps, FILE_NAME, BACKUP_DIR };
