/**
 * Optional enterprise adapter. On GitHub Pages, /api/meta is missing
 * and the planner stays fully local. On the Node host it uses session cookies.
 */
(function () {
  'use strict';

  const api = {
    enabled: false,
    canWrite: true,
    canExport: true,
    isAdmin: false,
    version: null,
    session: null,
    takeOver,
    queueSave,
    recordExport
  };
  window.OrgFlowEnterprise = api;

  let saveTimer = null;
  let saveChain = Promise.resolve();

  async function takeOver() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const meta = await fetch('/api/meta', { headers: { accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(timer);
      if (!meta.ok) throw new Error('not-enterprise');
      const info = await meta.json();
      if (!info.enterprise) throw new Error('not-enterprise');
    } catch {
      clearTimeout(timer);
      startLocalPlanner();
      return;
    }
    const sessionRes = await fetch('/api/session', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
    if (sessionRes.status === 401) {
      location.href = '/auth/login';
      return;
    }
    if (sessionRes.status === 403) {
      location.href = '/login.html?error=not_member';
      return;
    }
    if (!sessionRes.ok) {
      startLocalPlanner();
      return;
    }
    const loaded = await fetch('/api/workspace', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
    if (loaded.status === 401) {
      location.href = '/auth/login';
      return;
    }
    const body = await loaded.json();
    api.enabled = true;
    api.session = body.session;
    api.version = body.version;
    api.canWrite = Boolean(body.session?.canWrite);
    api.canExport = Boolean(body.session?.canExport);
    api.isAdmin = Boolean(body.session?.isAdmin);
    // Flush edits that never reached the server before its document replaces
    // the local copy. A failed retry leaves the pending record recoverable.
    try {
      const pending = await window.OrgFlowStore?.getPending?.();
      if (pending?.payload) {
        const resent = await fetch('/api/workspace', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'if-match': String(pending.baseVersion ?? api.version) },
          body: JSON.stringify({ workspace: pending.payload, version: pending.baseVersion ?? api.version })
        });
        if (resent.ok) {
          const rb = await resent.json().catch(() => ({}));
          api.version = rb.version;
          body.workspace = { ...body.workspace, planning: pending.planning };
          await window.OrgFlowStore.clearPending();
        }
      }
    } catch { /* the pending record stays recoverable */ }
    applyEnterpriseWorkspace(body.workspace);
    applyChrome(body.session);
  }

  function applyChrome(session) {
    document.body.classList.add('enterprise-on');
    document.body.classList.toggle('enterprise-readonly', !session.canWrite);
    document.body.classList.toggle('enterprise-no-export', !session.canExport);
    const bar = document.getElementById('enterpriseBar');
    if (bar) {
      bar.hidden = false;
      bar.classList.remove('hidden');
      const scope = session.scopePositionId ? ` · subtree ${session.scopePositionId}` : '';
      bar.innerHTML = `<span>${escapeHtml(session.user?.email || '')} · ${escapeHtml(session.role)}${escapeHtml(scope)}</span>` +
        (session.isAdmin ? ' <a href="admin.html">Admin</a>' : '') +
        ' <a href="/auth/logout">Sign out</a>';
    }
    if (!session.canWrite) {
      ['addBtn', 'importBtn', 'sideImportBtn', 'brandingBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      });
    }
    if (!session.canExport) {
      const exportBtn = document.getElementById('exportBtn');
      if (exportBtn) exportBtn.hidden = true;
    }
    if (!session.isAdmin) {
      ['exampleHarborBtn', 'exampleNorthstarBtn', 'exampleEmptyBtn', 'exampleFirstLightBtn', 'exampleLumenBtn', 'exampleCedarBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      });
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function queueSave() {
    if (!api.enabled || !api.canWrite) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveChain = saveChain.then(saveNow).catch(err => toast(err.message || 'Could not save to the server.'));
    }, 250);
  }

  async function saveNow() {
    const payload = window.enterpriseWorkspacePayload();
    let res;
    try {
      res = await fetch('/api/workspace', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'if-match': String(api.version) },
        body: JSON.stringify({ workspace: payload, version: api.version })
      });
    } catch (error) {
      await persistPending(payload, 'network');
      throw new Error('Could not reach the server — your changes are kept under Recovery & backups.');
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) {
      // Keep the losing copy recoverable instead of reloading over it.
      await persistPending(payload, 'conflict');
      toast('Someone else saved first. Your copy is kept under Recovery & backups.');
      location.reload();
      return;
    }
    if (!res.ok) {
      await persistPending(payload, 'error');
      throw new Error(body.error || 'Save failed — your changes are kept under Recovery & backups.');
    }
    api.version = body.version;
    await window.OrgFlowStore?.clearPending?.();
  }

  async function persistPending(payload, reason) {
    try {
      await window.OrgFlowStore?.putPending?.({ planning: payload.planning, payload, baseVersion: api.version, reason });
    } catch { /* pending recovery is best-effort */ }
  }

  async function recordExport(kind) {
    if (!api.enabled) return true;
    if (!api.canExport) {
      toast('You are not allowed to export this organization.');
      return false;
    }
    const res = await fetch('/api/exports', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error || 'Export was not permitted.');
      return false;
    }
    return true;
  }

  api.takeOver();
})();
