import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(directory, 'ALEX_Studio_Exporter.plugin.luau'), 'utf8');
const guide = readFileSync(join(directory, 'README.md'), 'utf8');

const required = [
  'assert(plugin,', 'CreateToolbar(', 'CreateDockWidgetPluginGuiAsync(',
  'StudioService:GetUserId()', 'Selection:Get()', 'PromptSaveSelectionAsync(',
  'SCAN PLACE', 'EXPORT SELECTED MODELS / SCRIPTS',
  'FULL PLACE EXPORT (.RBXLX) GUIDE', 'GetChildren()',
  'progressInner.Size', 'counts.Text', 'logMessage(', 'plugin.Unloading',
];
for (const fragment of required) {
  assert.ok(source.includes(fragment), 'Missing expected exporter capability: '+fragment);
}
for (const call of ['request(', 'HttpService:RequestAsync', 'HttpService:GetAsync',
                    'getgc(', 'hookfunction(', 'getrawmetatable(', 'loadstring(',
                    'writefile(', 'readfile(']) {
  assert.ok(!source.includes(call), 'Unexpected unsafe/out-of-scope capability: '+call);
}
assert.match(guide, /Save as Local Plugin/);
assert.match(guide, /Roblox XML Place/);
assert.match(guide, /permission to edit/);
assert.ok(source.length>9000, 'Plugin source appears incomplete');
assert.ok(source.length<80000, 'Unexpectedly large plugin source');
console.log('ALEX Studio Exporter source smoke check passed.');
console.log('NOTE: smoke checks do not compile or execute Luau in Roblox Studio.');
