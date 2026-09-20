'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { atomicWrite } = require('./store.cjs');

// Only native dialogs and the remembered recent list can grant file access.
function createDocuments(dataDir) {
  const settings = path.join(dataDir, 'recent-documents.json');
  const handles = new Map();
  let recent = [];
  try { recent = JSON.parse(fs.readFileSync(settings, 'utf8')).filter(x => typeof x.path === 'string').slice(0, 10); } catch { /* first launch */ }
  const hash = text => createHash('sha256').update(text).digest('hex');
  function read(file) {
    if (fs.statSync(file).size > 12 * 1024 * 1024) throw new Error('Workspace file exceeds 12 MB.');
    return fs.readFileSync(file, 'utf8');
  }
  function grant(file, opening = true) {
    const text = opening ? read(file) : (fs.existsSync(file) ? read(file) : null);
    const token = randomUUID();
    handles.set(token, { file, hash: text === null ? null : hash(text) });
    return { token, name: path.basename(file), ...(opening ? { text } : {}) };
  }
  function get(token) {
    const handle = handles.get(token);
    if (!handle) throw new Error('Choose the workspace file again.');
    return handle;
  }
  function remember(token) {
    const { file } = get(token);
    recent = [{ path: file }, ...recent.filter(x => x.path !== file)].slice(0, 10);
    fs.mkdirSync(dataDir, { recursive: true });
    atomicWrite(settings, JSON.stringify(recent));
  }
  return {
    grant,
    list: () => recent.map((x, index) => ({ index, name: path.basename(x.path), location: x.path })),
    openRecent(index) {
      if (!Number.isInteger(index) || !recent[index]) throw new Error('Recent file is unavailable.');
      return grant(recent[index].path);
    },
    read: token => read(get(token).file),
    remember,
    save(token, text) {
      const handle = get(token);
      if (typeof text !== 'string' || Buffer.byteLength(text) > 12 * 1024 * 1024) throw new Error('Workspace file exceeds 12 MB.');
      JSON.parse(text);
      const current = fs.existsSync(handle.file) ? hash(read(handle.file)) : null;
      if (current !== handle.hash) throw new Error('This file changed outside OrgFlow. Open it again or use Save as to keep both copies.');
      atomicWrite(handle.file, text);
      handle.hash = hash(text);
      remember(token);
      return true;
    }
  };
}
module.exports = { createDocuments };
