import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BackgroundStore,createBackgroundWorker} from '../background-jobs.mjs';
import {createApp} from '../server.mjs';

function sandbox(){
 const root=mkdtempSync(join(tmpdir(),'alex-bg-'));
 return {path:join(root,'jobs.sqlite'), cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('background queue persists, enforces ownership and prevents blind resubmission after restart',()=>{
 const sb=sandbox();
 try{
   const db=new BackgroundStore(sb.path);
   db.rememberSession({userId:'101',sid:'abc',csrf:'csrf'},'encrypted-cookie-blob');
   const id=db.create('101',{items:[
     {oldId:'123',displayName:'One',assetType:'Auto'},
     {oldId:'456',displayName:'Two',assetType:'Auto'}
   ],groupId:'',description:'',fileFingerprint:'place.rbxl:100:123'});
   assert.equal(db.view('101',id).total,2);
   assert.equal(db.view('102',id),null);
   const row=db.next();
   assert.equal(row.old_id,'123');
   db.markSubmitting(row);
   db.close();
   const opened=new BackgroundStore(sb.path);
   assert.equal(opened.view('101',id).counts.review,1);
   assert.equal(opened.next().old_id,'456');
   assert.equal(opened.sessionFor('101').csrf,'csrf');
   assert.equal(opened.charge('101','2026-10-21',1),true);
   assert.equal(opened.charge('101','2026-10-21',1),false);
   assert.equal(opened.used('101','2026-10-21'),1);
   opened.revokeSession('101');
   assert.equal(opened.view('101',id).status,'paused');
   opened.close();
 }finally{sb.cleanup();}
});

test('actual HTTP background worker uploads owned asset, polls operation, persists mapping',async()=>{
 const sb=sandbox(); let uploads=0; let refreshes=0;
 const upstream=async (url,options={})=>{
   if(url.endsWith('/token')){
     if(options.body?.get('grant_type')==='refresh_token'){refreshes++;assert.equal(options.body.get('refresh_token'),'refresh1');return Response.json({access_token:'access2',refresh_token:'refresh2',expires_in:900});}
     return Response.json({access_token:'access1',refresh_token:'refresh1',expires_in:1});
   }
   if(url.endsWith('/userinfo'))return Response.json({sub:'9140908042',preferred_username:'Owner'});
   if(url.endsWith('/assets/v1/assets/123'))return Response.json({assetType:'ASSET_TYPE_AUDIO',creationContext:{creator:{userId:'9140908042'}}});
   if(url.endsWith('/asset-delivery-api/v1/assetId/123'))return Response.json({location:'https://cdn.rbxcdn.com/audio'});
   if(url==='https://cdn.rbxcdn.com/audio')return new Response(Buffer.from('OggSvalid-data'));
   if(url.endsWith('/assets/v1/assets')&&options.method==='POST'){
     uploads++;return Response.json({path:'operations/proc_123'});
   }
   if(url.endsWith('/operations/proc_123'))return Response.json({done:true,response:{assetId:'9999'}});
   throw new Error('Unexpected upstream '+url);
 };
 let app,server,worker;
 try{
   app=createApp({env:{
     PUBLIC_BASE_URL:'http://localhost:3000',
     ROBLOX_OAUTH_CLIENT_ID:'client',ROBLOX_OAUTH_CLIENT_SECRET:'secret',
     ALEX_SESSION_SECRET:'stable-test-secret',ALEX_JOB_DB_PATH:sb.path
   },fetcher:upstream});
   server=http.createServer(app);
   await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
   const url=`http://127.0.0.1:${server.address().port}`;
   const start=await fetch(url+'/auth/start',{redirect:'manual'});
   const state=new URL(start.headers.get('location')).searchParams.get('state');
   const cb=await fetch(url+`/auth/callback?code=yes&state=${state}`,{
      redirect:'manual',headers:{cookie:start.headers.get('set-cookie').split(';')[0]}
   });
   const cookie=cb.headers.get('set-cookie').match(/alex_sid=[^;]+/)[0];
   const me=await (await fetch(url+'/api/me',{headers:{cookie}})).json();
   assert.equal(me.loggedIn,true);
   const submit=await fetch(url+'/api/background/jobs',{method:'POST',headers:{
     cookie,'content-type':'application/json','x-alex-csrf':me.csrf
   },body:JSON.stringify({rightsConfirmed:true,items:[{oldId:'123',assetType:'Auto',displayName:'Test owned audio'}],fileFingerprint:'file.rbxl:5:9'})});
   const accepted=await submit.json();
   assert.equal(submit.status,202,JSON.stringify(accepted));
   const id=accepted.id;
   worker=createBackgroundWorker(app.backgroundStore,{port:server.address().port,interval:9999999});
   assert.equal(await worker.processNext(),true); // POST accepted and operation recorded
   assert.equal(uploads,1);
   assert.equal(app.backgroundStore.view('9140908042',id).counts.processing,1);
   app.backgroundStore.db.prepare("UPDATE bg_items SET next_due=0 WHERE job_id=?").run(id);
   assert.equal(await worker.processNext(),true); // poll completed operation
   const status=await fetch(url+`/api/background/jobs/${id}`,{headers:{cookie}});
   const details=await status.json();
   assert.equal(details.status,'finished');
   assert.deepEqual(details.mapped,[{oldId:'123',newId:'9999'}]);
   assert.equal(uploads,1);
   assert.equal(refreshes,1);
   const stillSignedIn=await (await fetch(url+'/api/me',{headers:{cookie}})).json();
   assert.equal(stillSignedIn.loggedIn,true,'stale browser cookie must use refreshed worker credentials');
   assert.equal(refreshes,1);
   const outsider=await fetch(url+`/api/background/jobs/${id}`);
   assert.equal(outsider.status,401);
   worker.stop();worker=null;
   await new Promise(resolve=>server.close(resolve));server=null;
   app.backgroundStore.close();app=null;
   const reopened=new BackgroundStore(sb.path);
   assert.equal(reopened.view('9140908042',id).mapped[0].newId,'9999');
   assert.equal(reopened.used('9140908042',new Date().toISOString().slice(0,10)),1);
   reopened.close();
 }finally{
   if(worker)worker.stop();
   if(server)await new Promise(resolve=>server.close(resolve));
   app?.backgroundStore?.close();
   sb.cleanup();
 }
});
