'use strict';
const $ = id => document.getElementById(id);
let selected = null, result = null, processing = false;
let activeWorker = null;
const MAX = 120*1024*1024;
function addLog(line){const el=$('log');el.textContent+=(el.textContent?'\n':'')+'['+new Date().toLocaleTimeString()+'] '+line;el.scrollTop=el.scrollHeight;}
function update(){ $('execute').disabled=!(selected&&$('authorized').checked&&!processing);$('export').disabled=processing||!result;$('choose').disabled=processing;}
function progress(n){const value=Math.round(Number(n)||0);$('percent').textContent=value+'%';$('fill').style.width=value+'%';}
$('choose').addEventListener('click',()=>$('fileinput').click());
$('fileinput').addEventListener('change',ev=>{
 const file=ev.target.files&&ev.target.files[0];
 if(!file)return;
 if(!/\.(rbxlx|rbxmx)$/i.test(file.name)||file.size>MAX){addLog('Choose an XML .rbxlx/.rbxmx file no bigger than 120 MB.');return;}
 selected=file;result=null;$('filename').textContent=file.name;
 $('fileType').textContent=(file.name.split('.').at(-1)||'').toUpperCase()+' · ready';
 $('objects').textContent='—';$('scripts').textContent='—';$('readable').textContent='—';
 $('status').textContent='Ready to analyze selected XML place.';
 progress(0);addLog('Selected '+file.name);update();
});
$('authorized').addEventListener('change',update);
$('execute').addEventListener('click',async()=>{
 if(!selected||processing||!$('authorized').checked)return;
 processing=true;result=null;update();progress(0);$('status').textContent='Analyzing local XML...';
 addLog('Running fixed local XML analyzer. No Roblox Player interaction.');
 try{
   const source=await selected.text();
   progress(5);
   // file:// macOS Safari supports classic scripts without requiring a local server.
   await new Promise(done=>requestAnimationFrame(()=>setTimeout(done,0)));
   result=analyzeXml(source,()=>{});
   progress(100);
   $('objects').textContent=result.objects.toLocaleString();
   $('scripts').textContent=result.scriptContainers.toLocaleString();
   $('readable').textContent=result.readableScripts.toLocaleString();
   $('status').textContent='Analysis completed; export report now.';
   addLog('Found '+result.objects+' objects, '+result.scriptContainers+' script instances, '+result.readableScripts+' readable scripts.');
   processing=false;update();
 }catch(e){addLog('Failed to read file: '+e.message);processing=false;update();}
});
$('export').addEventListener('click',()=>{
 if(!result)return;
 const report={generated:new Date().toISOString(),sourceFile:selected.name,objects:result.objects,classes:result.classes,
 scriptContainers:result.scriptContainers,readableScripts:result.readableScripts,
 note:result.note,scripts:result.scripts.map(s=>({name:s.name,path:s.path,className:s.className,source:s.source,sourceTruncated:s.sourceTruncated}))};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ALEX_Decompiled_'+Date.now()+'.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 addLog('Export requested: '+a.download+'. Check Safari Downloads.');
});
$('docs').addEventListener('click',()=>window.open('https://create.roblox.com/docs/projects/place-files','_blank','noopener'));
update();
