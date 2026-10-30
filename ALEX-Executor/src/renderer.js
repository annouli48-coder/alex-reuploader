const code = document.getElementById('code');
const lines = document.getElementById('lines');
const output = document.getElementById('output');
const filenameLabel = document.getElementById('filename');
const unsaved = document.getElementById('unsaved');
let filename = null;

function renderLines() {
  lines.textContent = Array.from({ length: code.value.split('\n').length }, (_, i) => i + 1).join('\n');
  lines.scrollTop = code.scrollTop;
}
function setDirty(dirty) { unsaved.style.visibility = dirty ? 'visible' : 'hidden'; }
function log(msg) {
  if (output.textContent.startsWith('Editor is ready')) output.textContent = '';
  output.textContent += '[' + new Date().toLocaleTimeString() + '] ' + msg + '\n';
  output.scrollTop = output.scrollHeight;
}
function newScript(value = '-- New ALEX script\n') {
  filename = null;
  filenameLabel.textContent = 'untitled.luau';
  code.value = value;
  setDirty(true); renderLines(); code.focus();
}
document.getElementById('newScript').addEventListener('click', () => newScript());
document.querySelectorAll('.example').forEach(btn => btn.addEventListener('click', () => newScript(btn.dataset.code)));
code.addEventListener('input', () => { setDirty(true); renderLines(); });
code.addEventListener('scroll', renderLines);
code.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  e.preventDefault(); code.setRangeText('    ', code.selectionStart, code.selectionEnd, 'end');
  setDirty(true); renderLines();
});
document.getElementById('clear').addEventListener('click', () => { code.value = ''; setDirty(true); renderLines(); });
document.getElementById('clearLog').addEventListener('click', () => { output.textContent = ''; });
document.getElementById('open').addEventListener('click', async () => {
  try {
    const result = await window.alexDesktop.openScript();
    if (!result) return;
    code.value = result.content; filename = result.filename;
    filenameLabel.textContent = filename.split(/[\\/]/).pop();
    setDirty(false); renderLines(); log('Opened ' + filenameLabel.textContent);
  } catch(e) { log('Open failed: ' + e.message); }
});
document.getElementById('save').addEventListener('click', async () => {
  try {
    const result = await window.alexDesktop.saveScript({ content: code.value, filename });
    if (!result) return;
    filename = result; filenameLabel.textContent = filename.split(/[\\/]/).pop();
    setDirty(false); log('Saved ' + filenameLabel.textContent);
  } catch(e) { log('Save failed: ' + e.message); }
});
document.getElementById('attach').addEventListener('click', () => log('No Roblox Player attach/injection engine is installed.'));
document.getElementById('execute').addEventListener('click', () => log('Execution is unavailable: ALEX V1 is a local Luau editor, not a Roblox Player executor.'));
setDirty(false); renderLines();
