const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1120, height: 720, minWidth: 770, minHeight: 520,
    title: 'ALEX Executor',
    backgroundColor: '#0c0a16',
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
    title: 'Open Luau script', properties: ['openFile'],
    filters: [{ name: 'Luau/Lua', extensions: ['luau','lua','txt'] }]
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  const filename = selection.filePaths[0];
  const stat = await fs.stat(filename);
  if (stat.size > 2000000) throw new Error('File exceeds 2 MB limit.');
  return { filename, content: await fs.readFile(filename, 'utf8') };
});
ipcMain.handle('alex:save', async (_event, data) => {
  if (!data || typeof data.content !== 'string' || data.content.length > 2000000) {
    throw new Error('Invalid or oversized script.');
  }
  const selection = await dialog.showSaveDialog({
    title: 'Save Luau script', defaultPath: data.filename || 'script.luau',
    filters: [{ name: 'Luau', extensions: ['luau'] }, { name: 'Lua', extensions: ['lua'] }]
  });
  if (selection.canceled || !selection.filePath) return null;
  await fs.writeFile(selection.filePath, data.content, 'utf8');
  return selection.filePath;
});
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
