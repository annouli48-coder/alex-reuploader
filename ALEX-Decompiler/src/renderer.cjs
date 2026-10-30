'use strict';
const $ = id => document.getElementById(id);
let ready = false;
let running = false;
let hasResult = false;
function log(message) {
  const el=$('log');
  const line='['+new Date().toLocaleTimeString()+'] '+message;
  el.textContent+=(el.textContent?'\n':'')+line;
  if(el.textContent.length>30000)el.textContent=el.textContent.slice(-20000);
  el.scrollTop=el.scrollHeight;
}
function update(){
  $('execute').disabled=!(ready&&$('authorized').checked&&!running);
  $('choose').disabled=running;
  $('export').disabled=running||!hasResult;
}
function setProgress(n){
  const pct=Math.max(0,Math.min(100,Number(n)||0));
  $('fill').style.width=pct+'%';
  $('percent').textContent=pct+'%';
}
$('choose').addEventListener('click',async()=>{
  try{
    const file=await window.alex.choose();
    if(!file)return;
    ready=true;hasResult=false;
    $('filename').textContent=file.name;
    $('fileType').textContent=file.extension.toUpperCase()+' · ready for analysis';
    $('status').textContent='Ready to execute local XML analysis.';
    $('objects').textContent='—';$('scripts').textContent='—';$('readable').textContent='—';
    setProgress(0);update();log('Selected '+file.name+'.');
  }catch(err){log('Error choosing file: '+err.message);}
});
$('authorized').addEventListener('change',update);
$('execute').addEventListener('click',async()=>{
  if(!ready||running||!$('authorized').checked)return;
  running=true;hasResult=false;setProgress(0);update();
  $('status').textContent='Executing fixed XML analyzer...';
  log('Scanning local XML place. No scripts are being executed in Roblox.');
  try{
    const r=await window.alex.execute(true);
    setProgress(100);
    $('objects').textContent=r.objects.toLocaleString();
    $('scripts').textContent=r.scriptContainers.toLocaleString();
    $('readable').textContent=r.readableScripts.toLocaleString();
    $('status').textContent='Analysis completed. Export is available.';
    log('Done: '+r.objects+' objects, '+r.scriptContainers+' scripts, '+r.readableScripts+' readable saved source files.');
    hasResult=true;
  }catch(err){
    $('status').textContent='Could not analyze selected file.';
    log('Error: '+err.message);
  }finally{running=false;update();}
});
$('export').addEventListener('click',async()=>{
  try{
    const out=await window.alex.export();
    if(out)log('Exported '+out.files+' scripts + report to '+out.folder);
    else log('Export cancelled.');
  }catch(err){log('Export error: '+err.message);}
});
$('docs').addEventListener('click',async()=>{try{await window.alex.docs();}catch(e){log('Could not open documentation: '+e.message);}});
window.alex.onProgress(percent=>setProgress(percent));
update();
