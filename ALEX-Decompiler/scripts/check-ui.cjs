'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(dir,'src/index.html'),'utf8');
const renderer=fs.readFileSync(path.join(dir,'src/renderer.cjs'),'utf8');
const main=fs.readFileSync(path.join(dir,'src/main.cjs'),'utf8');
const preload=fs.readFileSync(path.join(dir,'src/preload.cjs'),'utf8');
assert.ok(!/<textarea|contenteditable|id="code"|id="copy"|id="paste"|id="attach"/i.test(html),'No editable or exposed scripts in app UI');
for(const id of ['choose','execute','export','log','filename','authorized','fill','status','objects','scripts','readable']){
 assert.ok(html.includes('id="'+id+'"'), 'Missing UI element: '+id);
}
for(const channel of ['alex:choose','alex:execute','alex:export','alex:openDoc']){
 assert.ok(main.includes(channel),'Missing secure main IPC '+channel);
 assert.ok(preload.includes(channel),'Missing preload IPC '+channel);
}
assert.ok(!/loadstring\(|eval\(|nodeIntegration:\s*true/.test(main),'No arbitrary script execution hooks in main');
assert.match(html,/Execute Decompiler/);
console.log('ALEX Decompiler GUI and IPC smoke checks passed.');
