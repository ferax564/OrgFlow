'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { emptyDocument } = require('./document');

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return prefix + '-' + crypto.randomUUID();
}

function openDatabase(filePath) {
  if (filePath && filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath || ':memory:');
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* :memory: */ }
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      issuer_sub TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
      can_export INTEGER NOT NULL DEFAULT 0,
      scope_position_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      tenant_id TEXT PRIMARY KEY,
      document TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      code_verifier TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      token_prefix TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_revisions (
      tenant_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      document TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT,
      PRIMARY KEY (tenant_id, version)
    );
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(api_tokens)').all().map(x => x.name));
  if (!columns.has('expires_at')) db.exec('ALTER TABLE api_tokens ADD COLUMN expires_at TEXT');
  if (!columns.has('scopes')) db.exec(`ALTER TABLE api_tokens ADD COLUMN scopes TEXT NOT NULL DEFAULT '["read"]'`);
  // Legacy credentials become read-only and expire after the migration grace period.
  db.prepare('UPDATE api_tokens SET expires_at = ? WHERE expires_at IS NULL').run(new Date(Date.now()+30*86400000).toISOString());
  db.exec(`CREATE TABLE IF NOT EXISTS command_receipts (tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(tenant_id,user_id,key));`);
  return db;
}

function createStore(db, options = {}) {
  const tenantName = options.tenantName || 'Organization';
  const tenantSlug = options.tenantSlug || 'default';

  function bootstrap() {
    const existing = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(tenantSlug);
    if (existing) return existing.id;
    const id = options.tenantId || 'tenant-default';
    const created = nowIso();
    db.prepare('INSERT INTO tenants (id, slug, name, created_at) VALUES (?, ?, ?, ?)').run(id, tenantSlug, tenantName, created);
    const empty = JSON.stringify(emptyDocument());
    db.prepare('INSERT INTO workspaces (tenant_id, document, version, updated_at, updated_by) VALUES (?, ?, 1, ?, NULL)')
      .run(id, empty, created);
    db.prepare('INSERT INTO workspace_revisions (tenant_id, version, document, created_at, created_by) VALUES (?, 1, ?, ?, NULL)')
      .run(id, empty, created);
    return id;
  }

  const tenantId = bootstrap();

  function getTenant() {
    return db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  }

  function upsertUser({ issuerSub, email, name }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existingSub = db.prepare('SELECT * FROM users WHERE issuer_sub = ?').get(issuerSub);
    if (existingSub) {
      db.prepare('UPDATE users SET email = ?, name = ? WHERE id = ?').run(normalizedEmail, name || existingSub.name, existingSub.id);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(existingSub.id);
    }
    const existingEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
    if (existingEmail && (existingEmail.issuer_sub.startsWith('local:') || issuerSub.startsWith('local:'))) {
      if (existingEmail.issuer_sub.startsWith('local:') && !issuerSub.startsWith('local:')) db.prepare('UPDATE users SET issuer_sub = ? WHERE id = ?').run(issuerSub,existingEmail.id);
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name || existingEmail.name, existingEmail.id);
      return db.prepare('SELECT * FROM users WHERE id = ?').get(existingEmail.id);
    }
    const user = { id: newId('usr'), issuer_sub: issuerSub, email: normalizedEmail, name: name || normalizedEmail, created_at: nowIso() };
    db.prepare('INSERT INTO users (id, issuer_sub, email, name, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, user.issuer_sub, user.email, user.name, user.created_at);
    return user;
  }

  function memberCount() {
    return db.prepare('SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ?').get(tenantId).n;
  }

  function getMembership(userId) {
    return db.prepare(`
      SELECT m.*, u.email, u.name
      FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ? AND m.user_id = ?
    `).get(tenantId, userId);
  }

  function ensureMembership(user, { role, canExport, scopePositionId } = {}) {
    const existing = getMembership(user.id);
    if (existing) return existing;
    const count = memberCount();
    const nextRole = role || (count === 0 ? 'admin' : null);
    if (!nextRole) return null;
    const exportFlag = canExport == null ? (nextRole === 'viewer' ? 0 : 1) : (canExport ? 1 : 0);
    db.prepare(`
      INSERT INTO memberships (tenant_id, user_id, role, can_export, scope_position_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tenantId, user.id, nextRole, exportFlag, scopePositionId || '', nowIso());
    return getMembership(user.id);
  }

  function listMembers() {
    return db.prepare(`
      SELECT m.user_id, m.role, m.can_export, m.scope_position_id, m.created_at, u.email, u.name
      FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ?
      ORDER BY u.email
    `).all(tenantId);
  }

  function putMembership({ email, name, role, canExport, scopePositionId, issuerSub }) {
    if (!['admin', 'editor', 'viewer'].includes(role)) throw new Error('Role must be admin, editor or viewer.');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@') || normalizedEmail.length > 200) throw new Error('A valid email is required.');
    const user = upsertUser({
      issuerSub: issuerSub || 'local:' + normalizedEmail,
      email: normalizedEmail,
      name: String(name || normalizedEmail).slice(0, 120)
    });
    const existing = getMembership(user.id);
    if (existing?.role === 'admin' && role !== 'admin') {
      const admins = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'admin'").get(tenantId).n;
      if (admins <= 1) throw new Error('Cannot demote the last admin.');
    }
    const exportFlag = canExport == null ? (role === 'viewer' ? 0 : 1) : (canExport ? 1 : 0);
    const scope = String(scopePositionId || '').slice(0, 150);
    if (existing) {
      db.prepare('UPDATE memberships SET role = ?, can_export = ?, scope_position_id = ? WHERE tenant_id = ? AND user_id = ?')
        .run(role, exportFlag, scope, tenantId, user.id);
    } else {
      db.prepare(`
        INSERT INTO memberships (tenant_id, user_id, role, can_export, scope_position_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tenantId, user.id, role, exportFlag, scope, nowIso());
    }
    return getMembership(user.id);
  }

  function deleteMembership(userId) {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'admin'").get(tenantId).n;
    const target = getMembership(userId);
    if (target?.role === 'admin' && admins <= 1) throw new Error('Cannot remove the last admin.');
    db.prepare('DELETE FROM memberships WHERE tenant_id = ? AND user_id = ?').run(tenantId, userId);
  }

  function getWorkspaceRow() {
    return db.prepare('SELECT document, version, updated_at, updated_by FROM workspaces WHERE tenant_id = ?').get(tenantId);
  }

  function saveWorkspace(document, userId, expectedVersion) {
    const row = getWorkspaceRow();
    if (expectedVersion != null && Number(expectedVersion) !== Number(row.version)) {
      const err = new Error('Workspace was updated by someone else. Reload and try again.');
      err.code = 'version_conflict';
      err.currentVersion = row.version;
      throw err;
    }
    const version = row.version + 1;
    const updated = nowIso();
    db.prepare('UPDATE workspaces SET document = ?, version = ?, updated_at = ?, updated_by = ? WHERE tenant_id = ?')
      .run(JSON.stringify(document), version, updated, userId || null, tenantId);
    db.prepare('INSERT OR REPLACE INTO workspace_revisions (tenant_id, version, document, created_at, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(tenantId, version, JSON.stringify(document), updated, userId || null);
    const keep = db.prepare('SELECT version FROM workspace_revisions WHERE tenant_id = ? ORDER BY version DESC').all(tenantId);
    for (const old of keep.slice(30)) {
      db.prepare('DELETE FROM workspace_revisions WHERE tenant_id = ? AND version = ?').run(tenantId, old.version);
    }
    return { version, updatedAt: updated };
  }

  function getWorkspaceRevision(version) {
    const row = db.prepare('SELECT document, version, created_at FROM workspace_revisions WHERE tenant_id = ? AND version = ?').get(tenantId, Number(version));
    return row || null;
  }

  function listWorkspaceRevisions() {
    return db.prepare('SELECT version, created_at FROM workspace_revisions WHERE tenant_id = ? ORDER BY version DESC LIMIT 30').all(tenantId);
  }

  function createSession(userId, ttlMs = 12 * 60 * 60 * 1000) {
    const id = crypto.randomBytes(24).toString('hex');
    const created = nowIso();
    const expires = new Date(Date.now() + ttlMs).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, tenant_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, userId, tenantId, created, expires);
    return { id, expiresAt: expires };
  }

  function getSession(id) {
    if (!id) return null;
    const row = db.prepare(`
      SELECT s.*, u.email, u.name, u.id AS user_id
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.tenant_id = ?
    `).get(id,tenantId);
    if (!row) return null;
    if (row.expires_at <= nowIso()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return null;
    }
    return row;
  }

  function deleteSession(id) {
    if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  function saveOauthState({ state, nonce, codeVerifier, expiresAt }) {
    db.prepare('INSERT INTO oauth_states (state, nonce, code_verifier, expires_at) VALUES (?, ?, ?, ?)')
      .run(state, nonce, codeVerifier, expiresAt);
  }

  function takeOauthState(state) {
    const row = db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state);
    if (row) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    if (!row || row.expires_at <= nowIso()) return null;
    return row;
  }

  function createApiToken(userId, name, { scopes = ['read'], expiresInDays = 30 } = {}) {
    if (!Array.isArray(scopes) || !scopes.length || scopes.some(x => !['read','export','propose'].includes(x))) throw new Error('Token scopes must be read, export or propose.');
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) throw new Error('Token lifetime must be 1–90 days.');
    const expiresAt = new Date(Date.now()+expiresInDays*86400000).toISOString();
    const raw = 'ofk_' + crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const id = newId('tok');
    db.prepare(`
      INSERT INTO api_tokens (id, token_hash, token_prefix, user_id, tenant_id, name, created_at, expires_at, scopes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tokenHash, raw.slice(0, 12), userId, tenantId, String(name || 'MCP').slice(0, 80), nowIso(), expiresAt, JSON.stringify([...new Set(scopes)]));
    return { id, token: raw, prefix: raw.slice(0, 12), expiresAt, scopes };
  }

  function listTokens(userId, isAdmin) {
    if (isAdmin) {
      return db.prepare(`
        SELECT t.id, t.token_prefix, t.name, t.created_at, t.last_used_at, t.expires_at, t.scopes, u.email
        FROM api_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.tenant_id = ? ORDER BY t.created_at DESC
      `).all(tenantId);
    }
    return db.prepare(`
      SELECT id, token_prefix, name, created_at, last_used_at, expires_at, scopes
      FROM api_tokens WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC
    `).all(tenantId, userId);
  }

  function deleteToken(tokenId, userId, isAdmin) {
    if (isAdmin) db.prepare('DELETE FROM api_tokens WHERE id = ? AND tenant_id = ?').run(tokenId, tenantId);
    else db.prepare('DELETE FROM api_tokens WHERE id = ? AND tenant_id = ? AND user_id = ?').run(tokenId, tenantId, userId);
  }

  function findToken(raw) {
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const row = db.prepare(`
      SELECT t.*, u.email, u.name
      FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ? AND t.tenant_id = ?
    `).get(tokenHash,tenantId);
    if (!row || row.expires_at <= nowIso()) return null;
    db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id);
    return row;
  }

  function prune() {
    const now = nowIso(), cutoff = new Date(Date.now()-90*86400000).toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now);
    db.prepare('DELETE FROM command_receipts WHERE created_at < ?').run(cutoff);
    db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(new Date(Date.now()-365*86400000).toISOString());
  }
  function audit({ userId, action, detail }) {
    db.prepare('INSERT INTO audit_log (id, tenant_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('aud'), tenantId, userId, action, JSON.stringify(detail || {}), nowIso());
  }

  function listAudit(limit = 100) {
    return db.prepare(`
      SELECT a.id, a.action, a.detail, a.created_at, u.email, u.name
      FROM audit_log a JOIN users u ON u.id = a.user_id
      WHERE a.tenant_id = ?
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(tenantId, Math.min(500, Math.max(1, Number(limit) || 100)));
  }

  return {
    db,
    prune,
    tenantId,
    getTenant,
    upsertUser,
    ensureMembership,
    getMembership,
    listMembers,
    putMembership,
    deleteMembership,
    getWorkspaceRow,
    saveWorkspace,
    getWorkspaceRevision,
    listWorkspaceRevisions,
    createSession,
    getSession,
    deleteSession,
    saveOauthState,
    takeOauthState,
    createApiToken,
    listTokens,
    deleteToken,
    findToken,
    audit,
    listAudit
  };
}

module.exports = { openDatabase, createStore, newId };
