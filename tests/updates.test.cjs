'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates } = require('../desktop/updates.cjs');

test('updates check, download, and install only through explicit actions', async () => {
  const updater = new EventEmitter();
  let installed = false;
  updater.checkForUpdates = async () => updater.emit('update-available', { version: '2.4.0' });
  updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '2.4.0' });
  updater.quitAndInstall = () => { installed = true; };
  const updates = createUpdates({ updater, supported: true, version: '2.3.0' });
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.autoDownload, false);
  assert.throws(() => updates.install(), /No downloaded/);
  assert.equal((await updates.run()).phase, 'available');
  assert.equal(installed, false);
  assert.equal((await updates.run()).phase, 'ready');
  updates.install();
  assert.equal(installed, true);
});
test('update failures are retryable and unsupported builds never fetch', async () => {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => { throw new Error('Offline'); };
  const updates = createUpdates({ updater, supported: true, version: '2.3.0' });
  assert.equal((await updates.run()).phase, 'error');
  updater.checkForUpdates = async () => updater.emit('update-not-available');
  assert.equal((await updates.run()).phase, 'current');
  const unsupported = createUpdates({ updater: new EventEmitter(), supported: false, version: '2.3.0' });
  assert.equal((await unsupported.run()).phase, 'unsupported');
});
