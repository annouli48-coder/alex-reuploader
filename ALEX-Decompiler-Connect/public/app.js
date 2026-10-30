'use strict';
const $=id=>document.getElementById(id);
let me={connected:false,role:'guest'},selected=null,result=null,running=false,activeWorker=null,ownerScripts=[];
const MAX_FILE=120*1024*1024;
function log(message){const el=$('log');el.textContent+='\n['+new Date().toLocaleTimeString()+'] '+message;el.scrollTop=el.scrollHeight;}
function update(){
 $('connect').hidden=me.connected;
 $('logout').hidden=!me.connected;
 $('who').textContent=me.connected?`✓ ${me.username} (Roblox ${me.userId})`:'Not connected';
 $('loginTitle').textContent=me.connected?`Welcome, ${me.username}`:'Connect your Roblox account';
 $('loginText').textContent=me.connected?me.role==='owner'?'Owner access verified — you can manage the private code vault.':'Roblox sign-in verified — local place analysis is available.':'Only authenticated Roblox accounts can use ALEX. Two approved IDs get private owner tools.';
 $('ownerArea').hidden=me.role!=='owner';$('ownerLink').hidden=me.role!=='owner';
 $('choose').disabled=running||!me.connected;
 $('execute').disabled=running||!me.connected||!selected||!$('authorized').checked;
 $('export').disabled=running||!me.connected||!result;
 $('addOwner').disabled=running||me.role!=='owner';
}
async function api(path,options={}){
 const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.method&&options.method!=='GET'?{'X-ALEX-CSRF':me.csrf||''}:{})};
 const response=await fetch(path,{credentials:'same-origin',...options,headers:{...headers,...options.headers}});
 let value;try{value=await response.json();}catch{throw new Error('Server returned an invalid response.');}
 if(!response.ok)throw new Error(value.error||`Request failed (${response.status})`);
 return value;
}
async function init(){
 try{me=await api('/api/me');update();if(me.role==='owner')await refreshOwner();}
 catch(error){log('Login status unavailable: '+error.message);update();}
 const query=new URLSearchParams(location.search);
 if(query.has('auth')){log(query.get('auth')==='connected'?'Roblox account connected.':'Roblox sign-in was cancelled or failed.');history.replaceState(null,'','/');}
}
$('file').addEventListener('change',ev=>{
 const file=ev.target.files?.[0];if(!file)return;
 if(!/\.(rbxlx|rbxmx)$/i.test(file.name)||file.size>MAX_FILE){log('Choose a .rbxlx or .rbxmx file under 120 MB.');selected=null;result=null;update();return;}
 selected=file;result=null;$('filename').textContent=`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`;
 ['objects','scripts','readable'].forEach(id=>$(id).textContent='—');$('fill').style.width='0%';$('status').textContent='Ready to analyze local Roblox XML.';
 log('Selected a local file; it will not be uploaded to the server.');update();
});
$('choose').addEventListener('click',()=>$('file').click());
$('authorized').addEventListener('change',update);
$('execute').addEventListener('click',async()=>{
 if(!me.connected||!selected||running||!$('authorized').checked)return;
 running=true;result=null;update();$('fill').style.width='2%';$('status').textContent='Reading local file...';
 try{
  const source=await selected.text();
  await new Promise((resolve,reject)=>{
   activeWorker=new Worker('/worker.js');
   const timeout=setTimeout(()=>{activeWorker?.terminate();reject(new Error('Analysis timed out. Try a smaller XML file.'));},120000);
   activeWorker.onmessage=event=>{
    const packet=event.data;
    if(packet.type==='progress'){$('fill').style.width=Math.min(98,Math.max(2,Number(packet.value)))+'%';return;}
    clearTimeout(timeout);
    if(packet.type==='error')reject(new Error(packet.message));
    else if(packet.type==='done'){result=packet.result;resolve();}
    activeWorker.terminate();activeWorker=null;
   };
   activeWorker.onerror=()=>{clearTimeout(timeout);activeWorker?.terminate();activeWorker=null;reject(new Error('XML worker failed.'));};
   activeWorker.postMessage({type:'run',source});
  });
  $('fill').style.width='100%';$('status').textContent='Analysis complete — export available.';
  $('objects').textContent=result.objects.toLocaleString();$('scripts').textContent=result.scriptContainers.toLocaleString();$('readable').textContent=result.readableScripts.toLocaleString();
  log(`Found ${result.objects} objects and ${result.readableScripts} readable script sources.`);
 }catch(error){$('status').textContent='Analysis failed';log('Error: '+error.message);}
 finally{running=false;update();}
});
function download(name,text,type='application/json'){
 const blob=new Blob([text],{type});const link=document.createElement('a');const url=URL.createObjectURL(blob);
 link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
$('export').addEventListener('click',()=>{
 if(!me.connected||!result)return;
 download(`ALEX_Decompiled_${Date.now()}.json`,JSON.stringify({sourceFile:selected.name,generatedAt:new Date().toISOString(),...result},null,2));
 log('Export requested; check your device Downloads.');
});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout',{method:'POST'});me={connected:false,role:'guest'};selected=null;result=null;ownerScripts=[];$('file').value='';$('filename').textContent='No place selected';update();log('Signed out.');}catch(e){log('Sign out failed: '+e.message);}});
function ownerItem(item){
 const div=document.createElement('div');div.className='saved-item';
 const title=document.createElement('strong');title.textContent=item.title;
 const detail=document.createElement('small');detail.textContent=`By Roblox ${item.by} · ${new Date(item.updatedAt).toLocaleString()}`;
 const controls=document.createElement('div');
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copy code';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(item.source);log(`Copied owner code: ${item.title}`);}catch(error){log('Clipboard unavailable; use a secure browser context.');}});
 const view=document.createElement('button');view.type='button';view.textContent='Edit / view';view.addEventListener('click',()=>{$('ownerTitle').value=item.title;$('ownerSource').value=item.source;$('ownerSource').focus();window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});});
 const del=document.createElement('button');del.type='button';del.textContent='Delete';del.addEventListener('click',async()=>{if(!confirm(`Delete ${item.title}?`))return;try{await api('/api/owner/scripts/'+encodeURIComponent(item.id),{method:'DELETE'});await refreshOwner();log('Owner code deleted.');}catch(e){log('Could not delete: '+e.message);}});
 controls.append(copy,view,del);div.append(title,detail,controls);return div;
}
async function refreshOwner(){
 if(me.role!=='owner')return;
 try{const data=await api('/api/owner/scripts');ownerScripts=data.scripts;const list=$('ownerScripts');list.replaceChildren();if(!ownerScripts.length){list.textContent='No saved scripts yet — paste your V4 code to save it privately.';return;}for(const entry of ownerScripts)list.append(ownerItem(entry));}
 catch(e){log('Owner vault unavailable: '+e.message);}
}
$('addOwner').addEventListener('click',async()=>{
 if(me.role!=='owner')return;
 const title=$('ownerTitle').value.trim(),source=$('ownerSource').value;
 try{await api('/api/owner/scripts',{method:'POST',body:JSON.stringify({title,source})});$('ownerTitle').value='';$('ownerSource').value='';await refreshOwner();log('Private owner script saved on the server.');}
 catch(e){log('Private script not saved: '+e.message);}
});
$('ownerLink').addEventListener('click',()=>$('ownerArea').scrollIntoView({behavior:'smooth'}));
$('installHelp').addEventListener('click',()=>alert('iPhone / iPad: open the hosted HTTPS site in Safari → Share → Add to Home Screen.\nAndroid tablet / phone: open in Chrome → ⋮ → Install app.\nMac and Windows: download the install scripts from the project ZIP; they create a launcher for the hosted website.\nThe Roblox OAuth service must first be configured and deployed by the app owner.'));
if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('/sw.js').catch(()=>{});
init();
