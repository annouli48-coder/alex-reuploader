import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const BASE = String(process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CLIENT = String(process.env.ROBLOX_OAUTH_CLIENT_ID || '').trim();
const SECRET = String(process.env.ROBLOX_OAUTH_CLIENT_SECRET || '').trim();
const ADMINS = new Set((process.env.ALEX_OWNER_ROBLOX_IDS || '10290256654,9140908042').split(',').map(s => s.trim()).filter(Boolean));
const DATA_DIR = resolve(process.env.ALEX_DATA_DIR || join(ROOT, '.runtime-data'));
const STORE = join(DATA_DIR, 'owner-scripts.json');
const ROBLOX = 'https://apis.roblox.com/oauth/v1';
const REDIRECT = `${BASE}/auth/callback`;
const IS_SECURE = BASE.startsWith('https://');
const CLIENT_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const SESSIONS = new Map();
const PENDING = new Map();
let mutation = Promise.resolve();
const rand = (size = 32) => randomBytes(size).toString('base64url');
const cookie = (name, value, maxAge = 43200) => `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${IS_SECURE ? '; Secure' : ''}`;
const clientOk = Boolean(CLIENT && SECRET && /^https?:\/\//.test(BASE));
const authStatus = () => ({ configured: clientOk, requiresRobloxOAuth: true });

function json(res, status, value, extra = {}) {
  res.writeHead(status, { ...CLIENT_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(value));
}
function redirect(res, path, cookies = []) {
  res.writeHead(302, { ...CLIENT_HEADERS, Location: path, ...(cookies.length ? {'Set-Cookie': cookies} : {}) });
  res.end();
}
function cookies(req) {
  const parts = {};
  for (const cookiePart of (req.headers.cookie || '').split(';')) {
    const i = cookiePart.indexOf('=');
    if (i >= 0) parts[cookiePart.slice(0,i).trim()] = cookiePart.slice(i+1).trim();
  }
  return parts;
}
function constEqual(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
function session(req) {
  const sid = cookies(req).alex_sid;
  const s = sid && SESSIONS.get(sid);
  if (!s) return null;
  if (s.expires < Date.now()) { SESSIONS.delete(sid); return null; }
  return s;
}
function role(s) { return s && ADMINS.has(s.userId) ? 'owner' : 'member'; }
function security(req) {
  // OAuth's external GET callback is exempt, but mutation endpoints are not.
  const origin = req.headers.origin;
  if (origin && origin !== BASE) return false;
  if (!origin && req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}
async function bodyJson(req, limit = 3200000) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new Error('Expected JSON request.');
  let size = 0; const pieces = [];
  for await (const buf of req) {
    size += buf.length;
    if (size > limit) throw new Error('Request too large.');
    pieces.push(buf);
  }
  return JSON.parse(Buffer.concat(pieces).toString('utf8'));
}
function requireSession(req,res,owner = false) {
  const s = session(req);
  if (!s) {json(res,401,{error:'Connect your Roblox account first.'});return null;}
  if (owner && role(s)!=='owner') {json(res,403,{error:'This tool is restricted to two owner Roblox accounts.'});return null;}
  return s;
}
function csrf(req,res,s) {
  if (!security(req) || !constEqual(req.headers['x-alex-csrf'], s.csrf)) {
    json(res,403,{error:'Request verification failed.'}); return false;
  }
  return true;
}
async function loadStore() {
  try { const value = JSON.parse(await readFile(STORE,'utf8')); return Array.isArray(value) ? value : []; }
  catch(e) { if(e.code==='ENOENT')return []; throw e; }
}
async function saveStore(value) {
  await mkdir(DATA_DIR,{recursive:true,mode:0o700});
  const tmp = STORE + '.' + rand(8) + '.tmp';
  await writeFile(tmp,JSON.stringify(value),{mode:0o600});
  await rename(tmp,STORE);
}
function mutate(callback) {
  const op = mutation.catch(()=>{}).then(async()=>callback(await loadStore()));
  mutation = op.then(()=>{},()=>{});
  return op;
}
function parseItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected script details.');
  const title=String(value.title || '').trim().slice(0,90);
  const source=value.source;
  if(!title || typeof source!=='string' || !source.trim() || Buffer.byteLength(source,'utf8')>1500000)
    throw new Error('Provide a title and script source smaller than 1.5 MB.');
  return {title,source};
}
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8', '.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
async function staticFile(path,res) {
  const pathname=path==='/' ? '/index.html':path;
  if (!/^\/[\w.\-/]+$/.test(pathname) || pathname.includes('..')) return json(res,404,{error:'Not found'});
  const filepath=resolve(PUBLIC,'.'+pathname);
  if(!filepath.startsWith(PUBLIC+'/'))return json(res,404,{error:'Not found'});
  try{
    const info=await stat(filepath);
    if(!info.isFile()||info.size>1000000)throw new Error('Not static');
    const data=await readFile(filepath);
    res.writeHead(200,{
      'Content-Type':mime[extname(filepath)] || 'application/octet-stream',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer',
      'Cross-Origin-Opener-Policy':'same-origin',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' https://apis.roblox.com; frame-ancestors 'none'",
      'Cache-Control':pathname==='/sw.js'?'no-cache':'public, max-age=600',
    });res.end(data);
  } catch {json(res,404,{error:'Static file not found.'});}
}
export function createApp() {
return http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url || '/',BASE);
    const path=url.pathname;
    if(req.method==='GET' && path==='/health')return json(res,200,{ok:true,robloxLoginConfigured:clientOk});
    if(req.method==='GET' && path==='/api/config')return json(res,200,authStatus());
    if(req.method==='GET' && path==='/api/me') {
      const s=session(req);
      return json(res,200,s?{connected:true,username:s.username,userId:s.userId,role:role(s),csrf:s.csrf}:{connected:false,role:'guest'});
    }
    if(req.method==='GET' && path==='/auth/login') {
      if(!clientOk) return json(res,503,{error:'Roblox OAuth is not configured on this server.'});
      const state=rand(), verifier=rand(48), challenge=createHash('sha256').update(verifier).digest('base64url');
      for (const [key, value] of PENDING) if (value.expires < Date.now()) PENDING.delete(key);
      if (PENDING.size > 1000) return json(res,429,{error:'Too many login attempts.'});
      PENDING.set(state,{verifier,expires:Date.now()+5*60_000});
      const params=new URLSearchParams({client_id:CLIENT,redirect_uri:REDIRECT,scope:'openid profile',response_type:'code',state,code_challenge:challenge,code_challenge_method:'S256'});
      return redirect(res,`${ROBLOX}/authorize?${params}`,[cookie('alex_oauth_state',state,300)]);
    }
    if(req.method==='GET' && path==='/auth/callback') {
      const state=url.searchParams.get('state') || '';
      const expected=cookies(req).alex_oauth_state;
      const pending=PENDING.get(state);
      PENDING.delete(state);
      const clearState=cookie('alex_oauth_state','',0);
      if(!pending || !constEqual(state,expected) || pending.expires<Date.now() || !url.searchParams.has('code'))
        return redirect(res,'/?auth=failed',[clearState]);
      const form=new URLSearchParams({grant_type:'authorization_code',code:url.searchParams.get('code'),client_id:CLIENT,client_secret:SECRET,redirect_uri:REDIRECT,code_verifier:pending.verifier});
      const token=await fetch(`${ROBLOX}/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(12000)});
      if(!token.ok)throw new Error(`Roblox OAuth token exchange returned ${token.status}`);
      const value=await token.json();
      if(!value.access_token)throw new Error('Missing Roblox access token');
      const info=await fetch(`${ROBLOX}/userinfo`,{headers:{Authorization:`Bearer ${value.access_token}`},signal:AbortSignal.timeout(12000)});
      if(!info.ok)throw new Error(`Roblox user info returned ${info.status}`);
      const who=await info.json();
      const userId=String(who.sub || '');
      if(!/^\d{1,24}$/.test(userId))throw new Error('Roblox did not provide a valid user ID.');
      const sid=rand();
      SESSIONS.set(sid,{userId,username:String(who.preferred_username || who.name || userId).slice(0,80),csrf:rand(),expires:Date.now()+12*3600_000});
      return redirect(res,'/?auth=connected',[clearState,cookie('alex_sid',sid)]);
    }
    if(req.method==='POST' && path==='/api/logout') {
      const s=requireSession(req,res);if(!s)return;
      if(!csrf(req,res,s))return;
      const sid=cookies(req).alex_sid;
      SESSIONS.delete(sid);
      return json(res,200,{ok:true},{'Set-Cookie':cookie('alex_sid','',0)});
    }
    if(path==='/api/owner/scripts' && req.method==='GET') {
      if(!requireSession(req,res,true))return;
      await mutation;
      return json(res,200,{scripts:await loadStore()});
    }
    if(path==='/api/owner/scripts' && req.method==='POST') {
      const s=requireSession(req,res,true);if(!s || !csrf(req,res,s))return;
      let data;try{data=parseItem(await bodyJson(req));}catch(e){return json(res,400,{error:e.message});}
      const added=await mutate(async list=>{
        if(list.length>=60)throw new Error('Owner code library is full (60 scripts).');
        const item={id:rand(12),title:data.title,source:data.source,by:s.userId,updatedAt:new Date().toISOString()};
        list.unshift(item);await saveStore(list);return item;
      });
      return json(res,201,{script:added});
    }
    const match=/^\/api\/owner\/scripts\/([A-Za-z0-9_-]+)$/.exec(path);
    if(match && req.method==='DELETE') {
      const s=requireSession(req,res,true);if(!s || !csrf(req,res,s))return;
      const removed=await mutate(async list=>{
        const next=list.filter(x=>x.id!==match[1]);
        if(next.length===list.length)return false;
        await saveStore(next);return true;
      });
      return json(res,removed?200:404,removed?{ok:true}:{error:'Script not found.'});
    }
    if(req.method==='GET')return staticFile(path,res);
    json(res,404,{error:'Not found.'});
  } catch(e) {
    // Never leak credential or script content in errors.
    console.error('ALEX server error:',e?.message || 'unknown');
    json(res,500,{error:'Server request failed.'});
  }
});
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw new Error('Invalid PORT');
  const server=createApp();
  server.listen(PORT,'0.0.0.0',()=>console.log('ALEX Decompiler Connect listening on port '+PORT));
}
