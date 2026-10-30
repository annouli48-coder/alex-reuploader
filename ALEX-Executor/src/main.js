const { app, BrowserWindow, dialog, ipcMain, clipboard, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_SCRIPT_BYTES = 8 * 1024 * 1024;
const resources = Object.freeze({
  docs: 'https://create.roblox.com/docs/luau',
  updates: 'https://create.roblox.com/updates',
  releases: 'https://devforum.roblox.com/c/updates/45',
  notes743: 'https://create.roblox.com/docs/updates/2026-10-12'
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1370, height: 850, minWidth: 790, minHeight: 550,
    title: 'ALEX — Roblox Workspace',
    backgroundColor: '#0d1220',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('alex:open', async () => {
  const selection = await dialog.showOpenDialog({
    title: 'Open Roblox Luau source',
    properties: ['openFile'],
    filters: [{ name: 'Roblox Lua and Luau', extensions: ['luau','lua','txt'] }]
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  const filename = selection.filePaths[0];
  const stat = await fs.stat(filename);
  if (stat.size > MAX_SCRIPT_BYTES) throw new Error('Script exceeds 8 MB limit.');
  return { filename, content: await fs.readFile(filename, 'utf8') };
});
ipcMain.handle('alex:save', async (_event, data) => {
  if (!data || typeof data.content !== 'string' ||
      Buffer.byteLength(data.content,'utf8') > MAX_SCRIPT_BYTES) {
    throw new Error('Invalid or oversized Luau script.');
  }
  const selection = await dialog.showSaveDialog({
    title: 'Save Roblox Luau source',
    defaultPath: path.basename(String(data.filename || 'script.luau')),
    filters: [
      { name: 'Roblox Luau', extensions: ['luau'] },
      { name: 'Lua source', extensions: ['lua'] },
      { name: 'Text file', extensions: ['txt'] }
    ]
  });
  if (selection.canceled || !selection.filePath) return null;
  await fs.writeFile(selection.filePath, data.content, 'utf8');
  return selection.filePath;
});
ipcMain.handle('alex:copy', (_event, value) => {
  if (typeof value !== 'string' || Buffer.byteLength(value,'utf8') > MAX_SCRIPT_BYTES) {
    throw new Error('Invalid or oversized clipboard content.');
  }
  clipboard.writeText(value);
  return true;
});
ipcMain.handle('alex:resource', async (_event, name) => {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(resources,name)) {
    throw new Error('Unrecognized documentation resource.');
  }
  await shell.openExternal(resources[name]);
  return true;
});
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
