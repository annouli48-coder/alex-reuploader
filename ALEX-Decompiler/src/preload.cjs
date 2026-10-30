'use strict';
const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('alex',Object.freeze({
  choose:()=>ipcRenderer.invoke('alex:choose'),
  execute:authorized=>ipcRenderer.invoke('alex:execute',authorized),
  export:()=>ipcRenderer.invoke('alex:export'),
  docs:()=>ipcRenderer.invoke('alex:openDoc'),
  onProgress:callback=>{
    if(typeof callback!=='function')return;
    ipcRenderer.on('alex:progress',(_event,percent)=>callback(percent));
  }
}));
