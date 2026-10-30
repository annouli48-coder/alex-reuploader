import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const dir=dirname(fileURLToPath(import.meta.url));
const js=readFileSync(join(dir,'../public/engine.js'),'utf8');
function analyze(source) {return runInNewContext(`${js}\nanalyzeXml(${JSON.stringify(source)})`,{});}
test('local Roblox XML analyzer extracts saved script and counts without running it',()=>{
 const xml=`<?xml version="1.0" encoding="utf-8"?><roblox version="4"><Item class="Folder"><Properties><string name="Name">Code</string></Properties><Item class="ModuleScript"><Properties><string name="Name">TestModule</string><ProtectedString name="Source"><![CDATA[print('Hello Roblox')]]></ProtectedString></Properties></Item></Item></roblox>`;
 const result=analyze(xml);
 assert.equal(result.objects,2);
 assert.equal(result.readableScripts,1);
 assert.equal(result.scripts[0].source,"print('Hello Roblox')");
 assert.equal(result.scripts[0].path,'Code/TestModule');
});
test('reject unrelated arbitrary Lua as XML input',()=>{
 assert.throws(()=>analyze('loadstring("print(1)")()'),/Roblox XML/);
});
