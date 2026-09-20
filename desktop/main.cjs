'use strict';
const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { allowedPath, portableUserData } = require('./serve.cjs');
const { createWorkspaceStore } = require('./store.cjs');
const { scanLegacyProfiles } = require('./recover.cjs');
const { createDocuments } = require('./documents.cjs');
const { createUpdates } = require('./updates.cjs');

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
    if (url !== 'orgflow://app/app.html') {
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

function trustedRenderer(event) {
  return event.sender === mainWindow?.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === 'orgflow://app/app.html';
}

function registerStore() {
  store = createWorkspaceStore([app.getPath('userData'), defaultUserData]);
  ipcMain.handle('workspace:load', event => {
    if (!trustedRenderer(event)) throw new Error('Untrusted document.');
    const found = store.load();
    return found ? found.text : null;
  });
  // Save is synchronous so a quit immediately after commit still hits disk.
  ipcMain.on('workspace:save', (event, text) => {
    if (!trustedRenderer(event)) { event.returnValue = { error: 'Untrusted document.' }; return; }
    try { event.returnValue = store.save(text); }
    catch (error) { event.returnValue = { error: String(error?.message || error) }; }
  });
  ipcMain.on('workspace:paths', event => {
    if (!trustedRenderer(event)) { event.returnValue = null; return; }
    event.returnValue = store.paths().join(' · ');
  });
  ipcMain.on('workspace:legacy', event => {
    if (!trustedRenderer(event)) { event.returnValue = null; return; }
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
    if (!trustedRenderer(event)) { event.returnValue = null; return; }
    const row = legacyCopies[Number(index)];
    event.returnValue = row ? { planning: row.planning, branding: row.branding } : null;
  });
}

function registerDocumentsAndUpdates() {
  const documents = createDocuments(defaultUserData);
  const updates = createUpdates({
    updater: require('electron-updater').autoUpdater,
    version: app.getVersion(),
    supported: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR && (process.platform !== 'linux' || Boolean(process.env.APPIMAGE))
  });
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
    if (!trustedRenderer(event)) throw new Error('Untrusted document.');
    return fn(...args);
  });
  const filters = [{ name: 'OrgFlow workspace', extensions: ['json', 'orgflow'] }];
  handle('document:open', async () => {
    const picked = await dialog.showOpenDialog(mainWindow, { title: 'Open org chart', filters, properties: ['openFile'] });
    return picked.canceled ? null : documents.grant(picked.filePaths[0]);
  });
  handle('document:saveAs', async () => {
    const picked = await dialog.showSaveDialog(mainWindow, { title: 'Save org chart as', defaultPath: 'OrgFlow-workspace.orgflow', filters });
    return picked.canceled ? null : documents.grant(picked.filePath, false);
  });
  handle('document:save', (token, text) => documents.save(token, text));
  handle('document:read', token => documents.read(token));
  handle('document:remember', token => documents.remember(token));
  handle('document:recent', () => documents.list());
  handle('document:openRecent', index => documents.openRecent(index));
  handle('update:state', () => updates.state());
  handle('update:run', () => updates.run());
  handle('update:install', () => updates.install());
  handle('update:releases', () => shell.openExternal('https://github.com/ferax564/OrgFlow/releases/latest'));
}

app.whenReady().then(async () => {
  registerProtocol();
  registerStore();
  registerDocumentsAndUpdates();
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
