import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(root,file),'utf8');
const html = read('src/index.html');
const renderer = read('src/renderer.js');
const preload = read('src/preload.js');
const main = read('src/main.js');
const css = read('src/app.css');
const pkg = JSON.parse(read('package.json'));
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
const required = [...renderer.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]);
for(const id of required) assert.ok(ids.has(id), 'Missing HTML id: '+id);
for(const id of ['editorPanel','testLabPanel','updatesPanel','editorStats','execute','copy','open','save','tabs','settingsDialog']) {
  assert.ok(ids.has(id),'Missing critical interface id: '+id);
}
assert.equal(pkg.version,'0.3.0');
assert.ok(!ids.has('attach'),'Roblox Player attach button must be absent');
assert.match(html,/ROBLOX · LUAU/,'Missing Roblox-only branding');
assert.match(html,/Test in Studio/,'Missing owned Studio testing action');
for(const id of ['alex:open','alex:save','alex:copy','alex:resource']) {
  assert.ok(main.includes(id),'Missing main process IPC '+id);
  const method=id.split(':')[1];
  assert.ok(preload.includes('alex:'+method),'Missing preload bridge '+id);
}
for(const resource of ['docs','updates','releases','notes743']) {
  assert.ok(main.includes(resource+':'),'Missing vetted Roblox resource '+resource);
}
assert.match(main,/MAX_SCRIPT_BYTES\s*=\s*8 \* 1024 \* 1024/);
assert.match(css,/--alex-accent/);
assert.match(read('install/install-macos.sh'),/alex-executor-v0\.3\.0/);
assert.match(read('install/install-windows.ps1'),/alex-executor-v0\.3\.0/);
console.log('ALEX desktop V3 smoke checks passed:',ids.size,'HTML ids;',required.length,'renderer references');
