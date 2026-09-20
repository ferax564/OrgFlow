'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orgflowDesktop', {
  openDocument: () => ipcRenderer.invoke('document:open'),
  saveDocumentAs: () => ipcRenderer.invoke('document:saveAs'),
  writeDocument: (token, text) => ipcRenderer.invoke('document:save', token, text),
  readDocument: token => ipcRenderer.invoke('document:read', token),
  rememberDocument: token => ipcRenderer.invoke('document:remember', token),
  recentDocuments: () => ipcRenderer.invoke('document:recent'),
  openRecentDocument: index => ipcRenderer.invoke('document:openRecent', index),
  updateState: () => ipcRenderer.invoke('update:state'),
  runUpdate: () => ipcRenderer.invoke('update:run'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openReleases: () => ipcRenderer.invoke('update:releases'),
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: text => ipcRenderer.sendSync('workspace:save', String(text ?? '')),
  storagePath: () => ipcRenderer.sendSync('workspace:paths'),
  legacyProfiles: () => ipcRenderer.sendSync('workspace:legacy'),
  loadLegacyProfile: index => ipcRenderer.sendSync('workspace:legacyLoad', index),
  platform: process.platform
});
