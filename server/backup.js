#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { validateDocument } = require('./lib/document');

function verify(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const result = db.prepare('PRAGMA quick_check').get();
    if (result.quick_check !== 'ok') throw new Error('SQLite integrity check failed.');
    const rows = db.prepare('SELECT document FROM workspaces').all();
    if (!rows.length) throw new Error('Backup contains no workspace.');
    for (const row of rows) validateDocument(JSON.parse(row.document));
    return rows.length;
  } finally { db.close(); }
}
function backup(source, destination) {
  if (fs.existsSync(destination)) throw new Error('Backup destination already exists. Choose a new name.');
  fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try { db.prepare('VACUUM INTO ?').run(path.resolve(destination)); }
  finally { db.close(); }
  fs.chmodSync(destination, 0o600);
  return verify(destination);
}
function restore(source, destination) {
  verify(source);
  if (fs.existsSync(destination) || fs.existsSync(destination+'-wal')) throw new Error('Restore into a new data directory, then point DATA_DIR there and restart. Existing databases are never overwritten.');
  fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(destination, 0o600);
  return verify(destination);
}
if (require.main === module) {
  try {
    const [command,source,destination]=process.argv.slice(2);
    if (!source || !destination || !['backup','restore'].includes(command)) throw new Error('Usage: node server/backup.js backup|restore SOURCE.sqlite DESTINATION.sqlite');
    console.log(JSON.stringify({ok:true,workspaces:(command==='backup'?backup:restore)(source,destination)}));
  } catch(error) { console.error(error.message);process.exitCode=1; }
}
module.exports={verify,backup,restore};
