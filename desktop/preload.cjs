'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orgflowDesktop', {
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: text => ipcRenderer.sendSync('workspace:save', String(text ?? '')),
  storagePath: () => ipcRenderer.sendSync('workspace:paths'),
  legacyProfiles: () => ipcRenderer.sendSync('workspace:legacy'),
  loadLegacyProfile: index => ipcRenderer.sendSync('workspace:legacyLoad', index),
  platform: process.platform
});
