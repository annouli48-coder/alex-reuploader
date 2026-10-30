import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.PUBLIC_BASE_URL='http://localhost:3000';
process.env.ROBLOX_OAUTH_CLIENT_ID='test-client';
process.env.ROBLOX_OAUTH_CLIENT_SECRET='test-secret';
process.env.ALEX_OWNER_ROBLOX_IDS='10290256654,9140908042';
const tmp=await mkdtemp(join(tmpdir(),'alex-test-'));
process.env.ALEX_DATA_DIR=tmp;
const {createApp}=await import('../server/app.mjs');
const realFetch=globalThis.fetch;
let nextUser='10290256654';
let app=null;
async function request(path,options={}) {
  return realFetch(`http://127.0.0.1:${app.address().port}${path}`, {redirect:'manual',...options});
}
async function login() {
  const start=await request('/auth/login');
  assert.equal(start.status,302);
  const state=new URL(start.headers.get('location')).searchParams.get('state');
  const oauthCookie=start.headers.get('set-cookie').split(';')[0];
  const callback=await request(`/auth/callback?state=${encodeURIComponent(state)}&code=mock`,{headers:{cookie:oauthCookie}});
  assert.equal(callback.status,302);
  const sessionCookie=callback.headers.get('set-cookie').split(/, (?=alex_sid=)/).find(x=>x.startsWith('alex_sid='))?.split(';')[0];
  assert.ok(sessionCookie,'OAuth session cookie missing');
  const who=await request('/api/me',{headers:{cookie:sessionCookie}});
  return {cookie:sessionCookie,me:await who.json()};
}

test('private code is available only to two verified Roblox IDs; no anonymous source leakage',async()=>{
  globalThis.fetch=async(url,opts)=>{
    if(String(url).endsWith('/token'))return Response.json({access_token:'mock-access'});
    if(String(url).endsWith('/userinfo'))return Response.json({sub:nextUser,preferred_username:'TestCreator'});
    throw Error('Unexpected outbound request');
  };
  app=createApp();await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  try{
    const guest=await request('/api/owner/scripts');assert.equal(guest.status,401);
    const first=await login();assert.equal(first.me.role,'owner');
    const doc='return(function() print("ALEX") end)()';
    const saved=await request('/api/owner/scripts',{method:'POST',headers:{cookie:first.cookie,'origin':'http://localhost:3000','x-alex-csrf':first.me.csrf,'content-type':'application/json'},body:JSON.stringify({title:'ALEX V4',source:doc})});
    assert.equal(saved.status,201);
    const fetched=await request('/api/owner/scripts',{headers:{cookie:first.cookie}});
    const data=await fetched.json();assert.equal(data.scripts[0].source,doc);
    nextUser='9140908042';const second=await login();assert.equal(second.me.role,'owner');
    const share=await request('/api/owner/scripts',{headers:{cookie:second.cookie}});assert.equal((await share.json()).scripts[0].source,doc);
    nextUser='123456';const outsider=await login();assert.equal(outsider.me.role,'member');
    const forbidden=await request('/api/owner/scripts',{headers:{cookie:outsider.cookie}});assert.equal(forbidden.status,403);
    const otherPost=await request('/api/owner/scripts',{method:'POST',headers:{cookie:outsider.cookie,'content-type':'application/json','x-alex-csrf':outsider.me.csrf},body:JSON.stringify({title:'Injected',source:'print(1)'})});assert.equal(otherPost.status,403);
    const noCsrf=await request('/api/owner/scripts',{method:'POST',headers:{cookie:first.cookie,'content-type':'application/json'},body:JSON.stringify({title:'Bad',source:'print(1)'})});assert.equal(noCsrf.status,403);
    const home=await request('/');assert.equal(home.status,200);assert.ok(!(await home.text()).includes(doc));
    const staticPrivate=await request('/server/app.mjs');assert.equal(staticPrivate.status,404);
  } finally {
    await new Promise(resolve=>app.close(resolve));globalThis.fetch=realFetch;await rm(tmp,{recursive:true,force:true});
  }
});
