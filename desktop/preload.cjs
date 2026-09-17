'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orgflowDesktop', {
  loadWorkspace: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspace: text => ipcRenderer.sendSync('workspace:save', String(text ?? '')),
  storagePath: () => ipcRenderer.sendSync('workspace:paths'),
  platform: process.platform
});
