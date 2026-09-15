'use strict';
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { portableUserData, startStaticServer } = require('./serve.cjs');

const dataDir = portableUserData();
if (dataDir) app.setPath('userData', dataDir);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const appRoot = path.join(__dirname, '..');
let mainWindow = null;
let server = null;

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

async function createWindow() {
  if (!server) server = await startStaticServer(appRoot);
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
      spellcheck: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = server.url.replace(/\/$/, '');
    if (!url.startsWith(allowed)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  await mainWindow.loadURL(`${server.url}/app.html`);
}

app.whenReady().then(async () => {
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

app.on('before-quit', () => {
  if (server) {
    const closing = server.close();
    server = null;
    return closing;
  }
});
