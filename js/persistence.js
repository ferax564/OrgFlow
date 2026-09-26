/** Serialized, revision-aware file persistence. No DOM or browser globals required. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OrgFlowPersistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class FilePersistence {
    constructor({ readPayload, onState = () => {}, delay = 900 }) {
      if (typeof readPayload !== 'function') throw new TypeError('readPayload is required.');
      this.readPayload = readPayload;
      this.onState = onState;
      this.delay = delay;
      this.handle = null;
      this.enabled = false;
      this.revision = 0;
      this.savedRevision = -1;
      this.generation = 0;
      this.pending = 0;
      this.writing = false;
      this.error = '';
      this.timer = null;
      this.chain = Promise.resolve();
    }
    get dirty() { return Boolean(this.handle && this.revision !== this.savedRevision); }
    state() {
      return { target: this.handle?.name || '', linked: Boolean(this.handle), enabled: this.enabled,
        revision: this.revision, savedRevision: this.savedRevision, dirty: this.dirty,
        pending: this.pending + (this.timer ? 1 : 0), writing: this.writing, error: this.error };
    }
    notify() { this.onState(this.state()); }
    cancelPending() {
      clearTimeout(this.timer);
      this.timer = null;
      this.generation++;
    }
    setTarget(handle, { saved = false } = {}) {
      if (handle && typeof handle.createWritable !== 'function') throw new TypeError('A writable file handle is required.');
      this.cancelPending();
      this.handle = handle || null;
      this.savedRevision = saved ? this.revision : -1;
      this.error = '';
      if (!handle) this.enabled = false;
      this.notify();
    }
    setEnabled(enabled) {
      this.cancelPending();
      this.enabled = Boolean(enabled && this.handle);
      this.notify();
      if (this.enabled && this.dirty) this.schedule();
    }
    changed() {
      this.revision++;
      this.error = '';
      this.notify();
      this.schedule();
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = null;
      if (!this.enabled || !this.handle) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.save({ automatic: true }).catch(() => {}); // Error remains in persistent status.
      }, this.delay);
      this.notify();
    }
    save({ automatic = false, handle = this.handle } = {}) {
      if (!handle) return Promise.reject(new Error('Choose a workspace file first.'));
      if (automatic && (!this.enabled || handle !== this.handle)) return Promise.resolve(false);
      clearTimeout(this.timer);
      this.timer = null;
      const generation = this.generation, revision = this.revision;
      let serialized;
      try { serialized = JSON.stringify(this.readPayload(), null, 2); }
      catch (error) { this.error = error.message; this.notify(); return Promise.reject(error); }
      const valid = () => !automatic || (this.enabled && generation === this.generation && handle === this.handle);
      this.pending++;
      this.notify();
      const run = async () => {
        let writer = null;
        try {
          if (!valid()) return false;
          this.writing = true;
          this.notify();
          writer = await handle.createWritable();
          if (!valid()) { await writer.abort?.(); writer = null; return false; }
          await writer.write(new Blob([serialized], { type: 'application/json' }));
          if (!valid()) { await writer.abort?.(); writer = null; return false; }
          await writer.close();
          writer = null;
          if (handle === this.handle) {
            this.savedRevision = revision;
            this.error = '';
          }
          return true;
        } catch (error) {
          if (writer) { try { await writer.abort?.(); } catch {} }
          if (handle === this.handle) this.error = error?.message || 'Could not save this file.';
          throw error;
        } finally {
          this.pending--;
          this.writing = false;
          this.notify();
        }
      };
      const result = this.chain.then(run);
      this.chain = result.catch(() => {});
      return result;
    }
    async flush() {
      if (this.enabled && this.dirty) await this.save({ automatic: true });
      await this.chain;
    }
    async idle() { await this.chain; }
    dispose() { this.cancelPending(); this.enabled = false; }
  }
  return { FilePersistence };
});
