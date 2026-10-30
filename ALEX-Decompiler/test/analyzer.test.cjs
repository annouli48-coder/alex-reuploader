'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {analyzeXml,analyzeFile,exportReport,safeName} = require('../src/analyzer.cjs');
const xml = `<?xml version="1.0" encoding="utf-8"?><roblox version="4"><External>null</External>
<Item class="Workspace" referent="RBX0"><Properties><string name="Name">Workspace</string></Properties>
<Item class="Model" referent="RBX1"><Properties><string name="Name">My/Game</string></Properties>
<Item class="Script" referent="RBX2"><Properties><string name="Name">Main&lt;Script&gt;</string>
<ProtectedString name="Source"><![CDATA[print("hello")\nlocal x = 1 < 2]]></ProtectedString></Properties></Item>
<Item class="ModuleScript" referent="RBX3"><Properties><string name="Name">API</string>
<ProtectedString name="Source">return { x = &amp;quot;hi&amp;quot; }</ProtectedString></Properties></Item>
<Item class="LocalScript" referent="RBX4"><Properties><string name="Name">Hidden</string></Properties></Item>
</Item></Item></roblox>`;
test('extracts authorized local place hierarchy with CDATA and XML entities',()=>{
 const progress=[];
 const result=analyzeXml(xml,pct=>progress.push(pct));
 assert.equal(result.objects,5);
 assert.equal(result.scriptContainers,3);
 assert.equal(result.readableScripts,2);
 assert.equal(result.scripts[0].path,'Workspace/My/Game/Main<Script>');
 assert.match(result.scripts[0].source,/local x = 1 < 2/);
 assert.equal(result.scripts[1].source,'return { x = &quot;hi&quot; }');
 assert.equal(result.scripts[2].source,null);
 assert.equal(progress.at(-1),100);
});
test('rejects invalid XML input and binary format',async()=>{
 assert.throws(()=>analyzeXml('<x/>'),/Not a supported Roblox XML/);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'alex-test-'));
 try{const binary=path.join(dir,'place.rbxl');await fs.writeFile(binary,'<roblox/>');
   await assert.rejects(()=>analyzeFile(binary),/XML/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('exports only readable sources with filename sanitization',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'alex-test-'));
 try{
  const result=analyzeXml(xml);
  const out=await exportReport(dir,result,'sample.rbxlx');
  assert.equal(out.files,2);
  const report=JSON.parse(await fs.readFile(path.join(out.folder,'report.json'),'utf8'));
  assert.equal(report.exported.length,2);
  for(const item of report.exported){
    assert.ok(!item.file.includes('../'));
    assert.ok(!item.file.includes('\\'));
    assert.ok((await fs.stat(path.join(out.folder,item.file))).isFile());
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
 assert.equal(safeName('../../bad:name'),'_bad_name');
});
