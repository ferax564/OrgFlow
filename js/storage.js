/** Authoritative IndexedDB documents with atomic outbox writes and per-account
 * checkpoints/file links. localStorage is an optional UI cache and preferences.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'orgflow.store';
  const DB_VERSION = 1;
  const MAX_CHECKPOINTS = 25;
  let dbPromise = null;
  let scopeKey = 'local';
  let loadedToken;
  let commitChain = Promise.resolve();
  const clone = value => structuredClone(value);
  const scoped = key => scopeKey === 'local' ? key : scopeKey + ':' + key;
  let pendingKey = 'unsynced';

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents');
        if (!db.objectStoreNames.contains('checkpoints')) db.createObjectStore('checkpoints', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending');
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  function tx(db, store, mode, run) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      try {
        const t = db.transaction(store, mode);
        const out = run(t.objectStore(store));
        t.oncomplete = () => done(out?.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error || new Error('Storage transaction failed.'));
        t.onabort = () => reject(t.error || new Error('Storage transaction aborted.'));
      } catch (error) { reject(error); }
    });
  }

  async function withStore(store, mode, run) {
    const db = await open();
    if (!db) throw new Error('Durable storage is unavailable. Export a backup before closing.');
    return tx(db, store, mode, run);
  }

  function requestToPromise(req) {
    return new Promise(resolve => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  const api = {
    supported: typeof indexedDB !== 'undefined',

    configureScope(scope) {
      scopeKey = scope ? 'account:' + JSON.stringify(scope) : 'local';
      pendingKey = scoped('unsynced'); loadedToken = undefined;
    },
    scope: () => scopeKey,
    async readDocument() {
      const key = scoped('workspace');
      const row = await withStore('documents', 'readonly', os => requestToPromise(os.get(key)));
      loadedToken = row?.storageToken || null;
      return row;
    },
    // One atomic transaction stores the active document, its identity-indexed
    // copy, and any pending server edit. CAS rejects concurrent tab writes.
    writeDocument(doc, options = {}) {
      const payload = clone(doc), key = scoped('workspace'), outboxKey = pendingKey;
      const task = commitChain.catch(() => {}).then(async () => {
        const db = await open();
        if (!db) throw new Error('Durable storage is unavailable.');
        const token = crypto.randomUUID();
        await new Promise((resolve, reject) => {
          const t = db.transaction(['documents', 'pending'], 'readwrite');
          const documents = t.objectStore('documents');
          let error;
          t.oncomplete = resolve;
          t.onabort = () => reject(error || t.error || new Error('Document save aborted.'));
          t.onerror = () => reject(t.error || new Error('Document save failed.'));
          const read = documents.get(key);
          read.onsuccess = () => {
            if (!options.force && loadedToken !== undefined && (read.result?.storageToken || null) !== loadedToken) {
              error = new Error('Another tab saved this workspace. Export your unsaved copy before reloading.'); t.abort(); return;
            }
            const row = {...payload, savedAt:new Date().toISOString(), storageToken:token};
            documents.put(row,key);
            documents.put(row,key + ':' + payload.planning.workspaceId);
            if (options.pending) t.objectStore('pending').put({...clone(options.pending),savedAt:row.savedAt},outboxKey);
          };
        });
        loadedToken = token;
        return token;
      });
      commitChain = task;
      return task;
    },
    flush: () => commitChain,

    async deleteDocument() {
      return withStore('documents', 'readwrite', os => os.delete(scoped('workspace')));
    },

    checkpointSummary(planning) {
      const s = planning?.scenarios || [];
      const active = s.find(x => x.id === planning.activeScenarioId) || s[0];
      return {
        scenarios: s.length,
        scenarioNames: s.map(x => x.name).slice(0, 12),
        positions: active?.positions?.length || 0,
        people: active?.employees?.length || 0,
        activeScenario: active?.name || '',
        revision: Number.isInteger(planning?.revision) ? planning.revision : 0,
        workspaceId: planning?.workspaceId || ''
      };
    },
    async addCheckpoint(planning, note = '', extras = {}) {
      const entry = {
        id: 'ck-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        at: new Date().toISOString(),
        scope: scopeKey,
        view: extras.view || null,
        theme: extras.theme || '',
        palette: extras.palette || '',
        note: String(note || 'Checkpoint').slice(0, 120),
        summary: api.checkpointSummary(planning),
        planning,
        branding: extras.branding || null
      };
      await withStore('checkpoints', 'readwrite', os => {
        os.put(entry);
        const trim = os.getAll();
        trim.onsuccess = () => {
          const all = trim.result.filter(row => (row.scope || 'local') === entry.scope);
          if (Array.isArray(all) && all.length > MAX_CHECKPOINTS) {
            all.sort((a, b) => String(a.at).localeCompare(String(b.at)));
            for (const old of all.slice(0, all.length - MAX_CHECKPOINTS)) os.delete(old.id);
          }
        };
      });
      return entry.id;
    },
    async listCheckpoints() {
      const all = await withStore('checkpoints', 'readonly', os => requestToPromise(os.getAll()));
      if (!Array.isArray(all)) return [];
      return all
        .filter(row => (row.scope || 'local') === scopeKey)
        .map(({ id, at, note, summary }) => ({ id, at, note, summary }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },
    async readCheckpoint(id) {
      const row = await withStore('checkpoints', 'readonly', os => requestToPromise(os.get(String(id))));
      return row && (row.scope || 'local') === scopeKey ? row : null;
    },
    async deleteCheckpoint(id) {
      if (!await api.readCheckpoint(id)) throw new Error('Checkpoint does not belong to this account.');
      return withStore('checkpoints', 'readwrite', os => os.delete(String(id)));
    },

    setPendingScope(scope) { pendingKey = 'unsynced:' + JSON.stringify(scope); },
    async putPending(record) {
      const key = pendingKey;
      return withStore('pending', 'readwrite', os => os.put({ ...record, savedAt: record.savedAt || new Date().toISOString() }, key));
    },
    async getPending() {
      const key = pendingKey;
      return withStore('pending', 'readonly', os => requestToPromise(os.get(key)));
    },
    async clearPending() {
      const key = pendingKey;
      return withStore('pending', 'readwrite', os => os.delete(key));
    },

    async putHandle(handle, name = '', workspaceId = '') {
      return withStore('handles', 'readwrite', os => os.put({ handle, name, workspaceId, savedAt: new Date().toISOString() }, scoped('workspace-file')));
    },
    async getHandle() {
      return withStore('handles', 'readonly', os => requestToPromise(os.get(scoped('workspace-file'))));
    },
    async clearHandle() {
      return withStore('handles', 'readwrite', os => os.delete(scoped('workspace-file')));
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrgFlowStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
