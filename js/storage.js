/**
 * Durable browser storage for OrgFlow. localStorage stays the synchronous
 * primary copy (it powers the stale-tab check); IndexedDB holds a redundant
 * document, full checkpoints, pending (unsynchronized) changes and the picked
 * file handle so recovery does not depend on a single storage area.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'orgflow.store';
  const DB_VERSION = 1;
  const MAX_CHECKPOINTS = 25;
  let dbPromise = null;

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
    return new Promise(resolve => {
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      try {
        const t = db.transaction(store, mode);
        const out = run(t.objectStore(store));
        t.oncomplete = () => done(out?.result !== undefined ? out.result : out);
        t.onerror = () => done(null);
        t.onabort = () => done(null);
      } catch { done(null); }
    });
  }

  async function withStore(store, mode, run) {
    const db = await open();
    if (!db) return null;
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

    async readDocument() {
      return withStore('documents', 'readonly', os => requestToPromise(os.get('workspace')));
    },
    async writeDocument(doc, savedAt = new Date().toISOString()) {
      // `doc` is the orgflow.workspace envelope (planning + branding + chrome)
      // so a recovered copy restores the workspace exactly as it looked.
      return withStore('documents', 'readwrite', os => os.put({ ...doc, savedAt }, 'workspace'));
    },
    async deleteDocument() {
      return withStore('documents', 'readwrite', os => os.delete('workspace'));
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
        note: String(note || 'Checkpoint').slice(0, 120),
        summary: api.checkpointSummary(planning),
        planning,
        branding: extras.branding || null
      };
      await withStore('checkpoints', 'readwrite', os => {
        os.put(entry);
        const trim = os.getAll();
        trim.onsuccess = () => {
          const all = trim.result;
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
        .map(({ id, at, note, summary }) => ({ id, at, note, summary }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
    },
    async readCheckpoint(id) {
      const row = await withStore('checkpoints', 'readonly', os => requestToPromise(os.get(String(id))));
      return row || null;
    },
    async deleteCheckpoint(id) {
      return withStore('checkpoints', 'readwrite', os => os.delete(String(id)));
    },

    async putPending(record) {
      return withStore('pending', 'readwrite', os => os.put({ ...record, savedAt: record.savedAt || new Date().toISOString() }, 'unsynced'));
    },
    async getPending() {
      return withStore('pending', 'readonly', os => requestToPromise(os.get('unsynced')));
    },
    async clearPending() {
      return withStore('pending', 'readwrite', os => os.delete('unsynced'));
    },

    async putHandle(handle, name = '') {
      return withStore('handles', 'readwrite', os => os.put({ handle, name, savedAt: new Date().toISOString() }, 'workspace-file'));
    },
    async getHandle() {
      return withStore('handles', 'readonly', os => requestToPromise(os.get('workspace-file')));
    },
    async clearHandle() {
      return withStore('handles', 'readwrite', os => os.delete('workspace-file'));
    }
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrgFlowStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
