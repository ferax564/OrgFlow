'use strict';
const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { allowedPath, portableUserData } = require('./serve.cjs');
const { createWorkspaceStore } = require('./store.cjs');
const { scanLegacyProfiles } = require('./recover.cjs');

// A standard custom scheme gives the planner a stable origin
// (orgflow://app) on every launch. localStorage/IndexedDB are keyed by
// origin, so a fixed scheme — unlike a random localhost port — keeps the
// workspace in the same storage area across restarts and updates.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'orgflow',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]);

// Capture the OS-default userData before the portable redirect so the
// workspace journal can keep a recovery copy in a location that does not
// move with the executable folder.
const defaultUserData = app.getPath('userData');
const dataDir = portableUserData();
if (dataDir) app.setPath('userData', dataDir);

const appRoot = path.join(__dirname, '..');
let mainWindow = null;
let store = null;
let legacyCopies = [];

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function createMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'OrgFlow on GitHub',
          click: () => { shell.openExternal('https://github.com/ferax564/OrgFlow'); }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isExternal(url) {
  return /^https?:/i.test(url);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 800,
    minHeight: 560,
    show: false,
    autoHideMenuBar: process.platform === 'win32',
    title: 'OrgFlow',
    backgroundColor: '#f4f2ee',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('orgflow://')) {
      event.preventDefault();
      if (isExternal(url)) shell.openExternal(url);
    }
  });
  await mainWindow.loadURL('orgflow://app/app.html');
}

function registerProtocol() {
  protocol.handle('orgflow', request => {
    let pathname = '/';
    try { pathname = new URL(request.url).pathname; } catch { /* fall through to 404 */ }
    const file = allowedPath(appRoot, pathname);
    if (!file) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return net.fetch(pathToFileURL(file).toString(), { bypassCustomProtocolHandlers: true });
  });
}

function registerStore() {
  store = createWorkspaceStore([app.getPath('userData'), defaultUserData]);
  ipcMain.handle('workspace:load', () => {
    const found = store.load();
    return found ? found.text : null;
  });
  // Save is synchronous so a quit immediately after commit still hits disk.
  ipcMain.on('workspace:save', (event, text) => {
    try { event.returnValue = store.save(text); }
    catch (error) { event.returnValue = { error: String(error?.message || error) }; }
  });
  ipcMain.on('workspace:paths', event => {
    event.returnValue = store.paths().join(' · ');
  });
  ipcMain.on('workspace:legacy', event => {
    try {
      const scan = scanLegacyProfiles(store.paths());
      legacyCopies = scan.recovered;
      event.returnValue = {
        origins: scan.origins.map(o => ({ origin: o.origin, profile: o.profile })),
        recovered: scan.recovered.map((r, i) => ({
          index: i,
          workspaceId: r.workspaceId,
          revision: r.revision,
          lastCommittedAt: r.lastCommittedAt,
          scenarios: r.scenarios
        }))
      };
    } catch (error) {
      legacyCopies = [];
      event.returnValue = { origins: [], recovered: [], error: String(error?.message || error) };
    }
  });
  ipcMain.on('workspace:legacyLoad', (event, index) => {
    const row = legacyCopies[Number(index)];
    event.returnValue = row ? { planning: row.planning, branding: row.branding } : null;
  });
}

app.whenReady().then(async () => {
  registerProtocol();
  registerStore();
  createMenu();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
