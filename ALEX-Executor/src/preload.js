const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('alexDesktop', {
  openScript: () => ipcRenderer.invoke('alex:open'),
  saveScript: data => ipcRenderer.invoke('alex:save', data),
  copyText: text => ipcRenderer.invoke('alex:copy', text),
  openResource: name => ipcRenderer.invoke('alex:resource', name)
});
