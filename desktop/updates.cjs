'use strict';

function createUpdates({ updater, supported, version }) {
  let state = { phase: supported ? 'idle' : 'unsupported', version, message: supported ? 'Check for a newer version.' : 'Use an installed Windows build, signed Mac build, or Linux AppImage to update automatically.' };
  let busy = false;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  const set = (phase, message, extra = {}) => { state = { ...state, phase, message, ...extra }; };
  updater.on('error', error => set('error', error.message || 'Update failed. Try again later.'));
  updater.on('update-available', info => set('available', `Version ${info.version} is available.`, { availableVersion: info.version }));
  updater.on('update-not-available', () => set('current', 'You have the latest released version.'));
  updater.on('download-progress', progress => set('downloading', `Downloading update… ${Math.round(progress.percent)}%`));
  updater.on('update-downloaded', info => set('ready', `Version ${info.version} is ready. Save and restart to install.`));
  return {
    state: () => ({ ...state }),
    async run() {
      if (!supported || busy || state.phase === 'ready') return { ...state };
      busy = true;
      try {
        if (state.phase === 'available') {
          set('downloading', 'Downloading update…');
          await updater.downloadUpdate();
        } else {
          set('checking', 'Checking for updates…');
          await updater.checkForUpdates();
        }
      } catch (error) { set('error', error.message || 'Update failed. Try again later.'); }
      finally { busy = false; }
      return { ...state };
    },
    install() {
      if (state.phase !== 'ready' || busy) throw new Error('No downloaded update is ready.');
      updater.quitAndInstall(false, true);
    }
  };
}
module.exports = { createUpdates };
