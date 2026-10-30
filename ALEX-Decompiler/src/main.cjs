'use strict';
const {app, BrowserWindow, dialog, ipcMain, shell} = require('electron');
const path = require('node:path');
const {Worker} = require('node:worker_threads');
const {exportReport} = require('./analyzer.cjs');
let mainWindow;
let chosenFile = null;
let completed = null;
let worker = null;
function createWindow(){
  mainWindow = new BrowserWindow({
    title:'ALEX Decompiler',width:1160,height:780,minWidth:780,minHeight:565,
    backgroundColor:'#090c17',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true}
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname,'index.html'));
  mainWindow.on('closed',()=>{mainWindow=null;if(worker)worker.terminate();});
}
ipcMain.handle('alex:choose',async()=>{
  if(worker)throw new Error('The analyzer is running.');
  const win=BrowserWindow.getFocusedWindow()||mainWindow;
  const selection=await dialog.showOpenDialog(win,{title:'Open an authorized Roblox XML place',
    filters:[{name:'Roblox XML place or model',extensions:['rbxlx','rbxmx']}],properties:['openFile']});
  if(selection.canceled||!selection.filePaths[0])return null;
  chosenFile=selection.filePaths[0];completed=null;
  return {name:path.basename(chosenFile),extension:path.extname(chosenFile)};
});
ipcMain.handle('alex:execute',async(_evt,authorized)=>{
  if(authorized!==true)throw new Error('Confirm you are allowed to analyze this local place.');
  if(!chosenFile)throw new Error('Choose a Roblox XML place first.');
  if(worker)throw new Error('Analysis is already running.');
  completed=null;
  const currentFile=chosenFile;
  const win=mainWindow;
  return new Promise((resolve,reject)=>{
    const w=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{file:currentFile}});
    worker=w;
    let settled=false;
    const finish=(err,result)=>{
      if(settled)return;
      settled=true;
      worker=null;
      if(err)reject(err);else{completed=result;resolve({objects:result.objects,scriptContainers:result.scriptContainers,
        readableScripts:result.readableScripts,topClasses:Object.entries(result.classes).sort((a,b)=>b[1]-a[1]).slice(0,8)});}
      w.terminate();
    };
    w.on('message',(message)=>{
      if(message.type==='progress'){
        if(win&&!win.isDestroyed())win.webContents.send('alex:progress',message.percent);
      }else if(message.type==='done')finish(null,message.result);
      else if(message.type==='error')finish(new Error(message.message));
    });
    w.on('error',e=>finish(e));
    w.on('exit',c=>{if(!settled)finish(new Error('Analyzer stopped unexpectedly ('+c+').'));});
  });
});
ipcMain.handle('alex:export',async()=>{
  if(!completed||!chosenFile)throw new Error('Run the analyzer before exporting.');
  const win=BrowserWindow.getFocusedWindow()||mainWindow;
  const choice=await dialog.showOpenDialog(win,{title:'Choose a destination for your extracted Studio source',properties:['openDirectory','createDirectory']});
  if(choice.canceled||!choice.filePaths[0])return null;
  return exportReport(choice.filePaths[0],completed,chosenFile);
});
ipcMain.handle('alex:openDoc',async()=>{
  await shell.openExternal('https://create.roblox.com/docs/projects/place-files');
  return true;
});
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
