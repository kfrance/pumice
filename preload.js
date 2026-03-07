const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pumice', {
  files: {
    list: () => ipcRenderer.invoke('files:list'),
    read: (path) => ipcRenderer.invoke('files:read', path),
    write: (path, content) => ipcRenderer.invoke('files:write', path, content),
    create: (path) => ipcRenderer.invoke('files:create', path),
    getBacklinks: (path) => ipcRenderer.invoke('files:getBacklinks', path),
    getScanTime: () => ipcRenderer.invoke('files:getScanTime'),
    onChanged: (callback) => {
      ipcRenderer.on('file:changed', (event, path) => callback(path));
    },
    onAdded: (callback) => {
      ipcRenderer.on('file:added', (event, path) => callback(path));
    },
    onRemoved: (callback) => {
      ipcRenderer.on('file:removed', (event, path) => callback(path));
    },
  },
  app: {
    getRoot: () => ipcRenderer.invoke('app:getRoot'),
    getInitialFile: () => ipcRenderer.invoke('app:getInitialFile'),
    getMode: () => ipcRenderer.invoke('app:getMode'),
    getSession: () => ipcRenderer.invoke('app:getSession'),
  },
  session: {
    save: (sessionData) => ipcRenderer.invoke('session:save', sessionData),
  },
  preferences: {
    load: () => ipcRenderer.invoke('preferences:load'),
    update: (key, value) => ipcRenderer.invoke('preferences:update', key, value),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
});
