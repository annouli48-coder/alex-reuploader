const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('alexDesktop', {
  openScript: () => ipcRenderer.invoke('alex:open'),
  saveScript: (data) => ipcRenderer.invoke('alex:save', data)
});
