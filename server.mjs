import http from 'node:http';
import { BackgroundStore, createBackgroundWorker } from './background-jobs.mjs';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OAUTH = 'https://apis.roblox.com/oauth/v1';
const ASSETS = 'https://apis.roblox.com/assets/v1';
const ASSET_DELIVERY = 'https://apis.roblox.com/asset-delivery-api/v1/assetId';
const PASSES = ['2037861333', '2037927296', '2040560797'];
const PASS_NAMES = ['Creator', 'Pro', 'Ultra'];
const OWNER_IDS = new Set(['9140908042', '10290256654']);
const DEFAULT_GROUP = '548271796';
const MAX_FILE = 20 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 512 * 1024;
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const MIME = {
  Animation: { rbxm: 'model/x-rbxm', rbxmx: 'model/x-rbxm' },
  Audio: { mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' },
  Decal: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp', tga: 'image/tga' },
  Image: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp', tga: 'image/tga' },
  Model: { fbx: 'model/fbx', gltf: 'model/gltf+json', glb: 'model/gltf-binary', rbxm: 'model/x-rbxm', rbxmx: 'model/x-rbxm' },
};
const LIMITS = [5, 20, 50, 100]; // App-side daily limits, not Roblox upload quotas.

export function validateId(input) {
  const id = String(input ?? '').trim();
  if (!/^\d{1,20}$/.test(id) || id === '0') throw new HttpError(400, 'Enter a valid positive Roblox ID.');
  return id;
}

export function mediaType(type, name) {
  return MIME[type]?.[String(name).split('.').pop().toLowerCase()] ?? null;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}
function redirect(res, location, cookie) {
  res.writeHead(302, { location, ...(cookie ? { 'set-cookie': cookie } : {}), 'cache-control': 'no-store' });
  res.end();
}
function token() { return randomBytes(32).toString('base64url'); }
function cookieFor(value, secure, clear = false) {
  return `alex_sid=${clear ? '' : value}; HttpOnly; SameSite=Lax; Path=/; ${secure ? 'Secure; ' : ''}${clear ? 'Max-Age=0' : 'Max-Age=604800'}`;
}
function parseCookie(raw) {
  const value = (raw ?? '').split(';').map(x => x.trim()).find(x => x.startsWith('alex_sid='));
  return value?.slice('alex_sid='.length) ?? null;
}
function readNamedCookie(raw, name) {
  const pair = (raw || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : null;
}
async function bodyBuffer(req) {
  const buffers = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY) throw new HttpError(413, 'File too large. Maximum asset size is 20 MB.');
    buffers.push(chunk);
  }
  return Buffer.concat(buffers);
}
async function getMultipart(req) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.startsWith('multipart/form-data;')) throw new HttpError(415, 'Expected a multipart form upload.');
  const raw = await bodyBuffer(req);
  try {
    const request = new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': contentType }, body: raw });
    return await request.formData();
  } catch { throw new HttpError(400, 'Could not read file upload.'); }
}
async function remoteJson(response) {
  const str = await response.text();
  try { return JSON.parse(str); } catch { return { error: str.slice(0, 350) }; }
}

async function bulkJobBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 6 * 1024 * 1024) throw new HttpError(413, 'Asset queue exceeds the 6 MB request limit.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid asset queue JSON.'); }
}

async function smallJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new HttpError(413, 'Automatic reupload request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid automatic reupload request.'); }
}

async function limitedAssetBytes(response) {
  if (Number(response.headers.get('content-length')) > MAX_FILE) throw new HttpError(413, 'The source asset is larger than 20 MB.');
  let size = 0;
  const chunks = [];
  for await (const piece of response.body) {
    const bytes = Buffer.from(piece);
    size += bytes.length;
    if (size > MAX_FILE) throw new HttpError(413, 'The source asset is larger than 20 MB.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function recognizedAssetFile(type, bytes) {
  const leading = bytes.subarray(0, 32).toString('ascii');
  if (type === 'Audio') {
    if (bytes.subarray(0, 4).toString('ascii') === 'OggS') return ['source.ogg', 'audio/ogg'];
    if (bytes.subarray(0, 3).toString('ascii') === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return ['source.mp3', 'audio/mpeg'];
    if (bytes.subarray(0, 4).toString('ascii') === 'fLaC') return ['source.flac', 'audio/flac'];
    if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE') return ['source.wav', 'audio/wav'];
  }
  if (type === 'Animation') {
    if (bytes.subarray(0, 8).toString('ascii') === '<roblox!') return ['source.rbxm', 'model/x-rbxm'];
    if (bytes.subarray(0, 200).toString('utf8').match(/^\s*(?:<\?xml[^>]*>\s*)?<roblox\b/)) return ['source.rbxmx', 'model/x-rbxm'];
  }
  if (type === 'Image' || type === 'Decal') {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ['source.png', 'image/png'];
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['source.jpeg', 'image/jpeg'];
    if (leading.startsWith('BM')) return ['source.bmp', 'image/bmp'];
    if (bytes.length >= 18 && [2, 3, 10, 11].includes(bytes[2]) && [8, 16, 24, 32].includes(bytes[16])) return ['source.tga', 'image/tga'];
  }
  if (type === 'Mesh' && /^version [1-9]\.[0-9]{2}/.test(leading)) return ['source.mesh', 'model/x-file-mesh-data'];
  if (type === 'Model') {
    if (leading.startsWith('<roblox!')) return ['source.rbxm', 'model/x-rbxm'];
    if (bytes.subarray(0, 200).toString('utf8').match(/^\s*(?:<\?xml[^>]*>\s*)?<roblox\b/)) return ['source.rbxmx', 'model/x-rbxm'];
    if (leading.startsWith('Kaydara FBX Binary') || /^\s*; FBX/.test(leading)) return ['source.fbx', 'model/fbx'];
    if (leading.startsWith('glTF')) return ['source.glb', 'model/gltf-binary'];
    if (bytes[0] === 123) {
      try { if (JSON.parse(bytes.toString('utf8')).asset?.version) return ['source.gltf', 'model/gltf+json']; }
      catch { /* Not glTF JSON. */ }
    }
  }
  if (type === 'Video' && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    return bytes.subarray(8, 12).toString('ascii') === 'qt  ' ? ['source.mov', 'video/mov'] : ['source.mp4', 'video/mp4'];
  }
  throw new HttpError(422, 'Roblox returned asset content in a format this reuploader cannot safely upload.');
}

const AUTO_TYPES = new Set(['Audio', 'Animation', 'Image', 'Decal', 'Mesh', 'Model', 'Video']);
function normalizedAssetType(value) {
  const cleaned = String(value || '').replace(/^ASSET_TYPE_/i, '').toLowerCase();
  return [...AUTO_TYPES].find(type => type.toLowerCase() === cleaned) || null;
}

function trustedDownloadUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'rbxcdn.com' || parsed.hostname.endsWith('.rbxcdn.com'))) return parsed.href;
  } catch { /* Untrusted or malformed URL. */ }
  throw new HttpError(502, 'Roblox returned an untrusted asset download location.');
}

export function createApp({ env = process.env, fetcher = globalThis.fetch } = {}) {
  const clientId = env.ROBLOX_OAUTH_CLIENT_ID || '';
  const clientSecret = env.ROBLOX_OAUTH_CLIENT_SECRET || '';
  const origin = (env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectUri = env.ROBLOX_OAUTH_REDIRECT_URI || `${origin}/auth/callback`;
  const secure = origin.startsWith('https://');
  const configured = !!(clientId && clientSecret && env.PUBLIC_BASE_URL);
  // A sealed, HttpOnly cookie can be recovered after a Railway restart or by
  // another replica. The key is derived from the server-only OAuth secret unless
  // a dedicated persistent ALEX_SESSION_SECRET is configured.
  const sessionKey = createHash('sha256').update('alex-reuploader/session/v1\0').update(env.ALEX_SESSION_SECRET || clientSecret).digest();
  const revokedSessions = new Map();
  const states = new Map();
  const daily = new Map();
  const autoPending = new Map();
  const jobPath = env.ALEX_JOB_DB_PATH ||
    (env.RAILWAY_VOLUME_MOUNT_PATH ? join(env.RAILWAY_VOLUME_MOUNT_PATH, 'alex-reuploader-jobs.sqlite') : '');
  const backgroundStore = jobPath ? new BackgroundStore(jobPath) : null;


  function sealSession(session) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sessionKey, nonce);
    const bytes = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), bytes]).toString('base64url');
  }
  function sessionOf(req) {
    const value = parseCookie(req.headers.cookie);
    if (!value || value.length > 4096) return null;
    try {
      const bytes = Buffer.from(value, 'base64url');
      if (bytes.length < 29) return null;
      const decipher = createDecipheriv('aes-256-gcm', sessionKey, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      let session = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      // Worker refreshes can rotate OAuth tokens while a browser is closed.
      // Reconcile an already-valid browser session with its newer persisted copy.
      const current = backgroundStore?.latestSession(session.userId,session.sid);
      if (current && current.sealed_cookie !== value) {
        try {
          const fresh = Buffer.from(current.sealed_cookie,'base64url');
          const dec = createDecipheriv('aes-256-gcm', sessionKey, fresh.subarray(0,12));
          dec.setAuthTag(fresh.subarray(12,28));
          session = JSON.parse(Buffer.concat([dec.update(fresh.subarray(28)), dec.final()]).toString('utf8'));
        } catch { /* original cookie still undergoes normal validation */ }
      }
      if (!session || typeof session !== 'object' || !/^[0-9]+$/.test(session.userId) ||
          typeof session.sid !== 'string' || !session.sid || typeof session.csrf !== 'string' ||
          !Number.isFinite(session.validUntil) || session.validUntil < Date.now() ||
          revokedSessions.has(session.sid)) return null;
      return session;
    } catch { return null; }
  }
  function writeSession(res, session) {
    const sealed = sealSession(session);
    backgroundStore?.rememberSession(session,sealed);
    res.setHeader('set-cookie', cookieFor(sealed, secure));
  }
  function requireUser(req) {
    const session = sessionOf(req);
    if (!session) throw new HttpError(401, 'Sign in with Roblox first.');
    return session;
  }
  function checkOrigin(req) {
    const originHeader = req.headers.origin;
    // Browsers send Origin on these forms. If missing, require CSRF header anyway.
    if (originHeader && originHeader !== origin) throw new HttpError(403, 'Origin mismatch.');
    const session = requireUser(req);
    if (req.headers['x-alex-csrf'] !== session.csrf) throw new HttpError(403, 'Session validation failed. Refresh the page.');
    return session;
  }
  async function accessToken(session, res) {
    if (session.expiresAt > Date.now() + 35_000) return session.access;
    if (!session.refresh) throw new HttpError(401, 'Roblox session expired; sign in again.');
    const r = await fetcher(`${OAUTH}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: session.refresh }),
    });
    const result = await remoteJson(r);
    if (!r.ok || !result.access_token) throw new HttpError(401, 'Roblox session expired; sign in again.');
    session.access = result.access_token;
    session.refresh = result.refresh_token || session.refresh;
    session.expiresAt = Date.now() + (Number(result.expires_in) || 900) * 1000;
    session.validUntil = Date.now() + SESSION_LIFETIME;
    // Roblox can rotate refresh tokens: persist each new token in the cookie.
    writeSession(res, session);
    return session.access;
  }
  async function checkTier(session) {
    if (OWNER_IDS.has(session.userId)) return 3;
    if (session.tierValidUntil > Date.now()) return session.tier;
    let tier = 0;
    // Inventory checks are server-side and fail closed on hidden inventory or upstream errors.
    for (let i = PASSES.length - 1; i >= 0; i--) {
      try {
        const r = await fetcher(`https://inventory.roblox.com/v1/users/${session.userId}/items/GamePass/${PASSES[i]}`);
        if (!r.ok) continue;
        const value = await remoteJson(r);
        if (value.owned === true) { tier = i + 1; break; }
      } catch { /* No verified entitlement. */ }
    }
    session.tier = tier;
    session.tierValidUntil = Date.now() + 120_000;
    return tier;
  }
  function available(session, tier) {
    const day = new Date().toISOString().slice(0, 10);
    const tally = daily.get(session.userId);
    const used = backgroundStore ? backgroundStore.used(session.userId,day) : (tally?.day === day ? tally.used : 0);
    return { used, limit: LIMITS[tier], day };
  }

  function chargeUsage(session, quota, tier) {
    if (backgroundStore) {
      if (!backgroundStore.charge(session.userId, quota.day, LIMITS[tier]))
        throw new HttpError(429, 'Daily ALEX upload allowance reached.');
    } else {
      daily.set(session.userId, { day: quota.day, used: quota.used + 1 });
    }
  }

  const app = async function app(req, res) {
    const pathname = new URL(req.url || '/', origin).pathname;
    try {
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' https://*.rbxcdn.com data:; connect-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
      if (pathname === '/healthz') return json(res, 200, { ok: true });
      if (pathname === '/api/config') return json(res, 200, { backgroundReady: !!backgroundStore, ready: configured, groupId: DEFAULT_GROUP, passes: PASSES.map((id, i) => ({ id, name: PASS_NAMES[i] })), maxFileMiB: 20 });
      if (pathname === '/api/me') {
        const session = sessionOf(req);
        if (!session) return json(res, 200, { loggedIn: false });
        try { await accessToken(session, res); }
        catch (error) {
          if (!(error instanceof HttpError) || error.status !== 401) throw error;
          res.setHeader('set-cookie', cookieFor('', secure, true));
          return json(res, 200, { loggedIn: false });
        }
        const tier = await checkTier(session);
        return json(res, 200, { loggedIn: true, user: { id: session.userId, name: session.name, avatar: session.picture }, tier, plan: tier ? PASS_NAMES[tier - 1] : 'Free', allowance: available(session, tier), csrf: session.csrf });
      }
      if (pathname === '/auth/start' && req.method === 'GET') {
        if (!configured) throw new HttpError(503, 'Roblox sign-in needs OAuth environment variables on the server.');
        const state = token(), verifier = token() + token().slice(0, 6);
        states.set(state, { verifier, created: Date.now() });
        if (states.size > 2000) for (const [k, v] of states) if (Date.now() - v.created > 600_000) states.delete(k);
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        const url = new URL(`${OAUTH}/authorize`);
        for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirectUri, scope: 'openid profile asset:read asset:write', response_type: 'code', state, code_challenge: challenge, code_challenge_method: 'S256' })) url.searchParams.set(k, v);
        return redirect(res, url.href, `alex_oauth=${state}; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=600; ${secure ? 'Secure' : ''}`);
      }
      if (pathname === '/auth/callback' && req.method === 'GET') {
        const query = new URL(req.url, origin).searchParams;
        const state = query.get('state');
        const flow = states.get(state);
        states.delete(state);
        if (!flow || Date.now() - flow.created > 600_000 || !query.get('code') || state !== readNamedCookie(req.headers.cookie, 'alex_oauth')) throw new HttpError(400, 'Sign-in could not be verified. Try again.');
        const r = await fetcher(`${OAUTH}/token`, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code: query.get('code'), code_verifier: flow.verifier, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
        });
        const result = await remoteJson(r);
        if (!r.ok || !result.access_token) throw new HttpError(502, 'Roblox rejected sign-in. Check your OAuth redirect URL and scopes.');
        const profileResponse = await fetcher(`${OAUTH}/userinfo`, { headers: { authorization: `Bearer ${result.access_token}` } });
        const profile = await remoteJson(profileResponse);
        if (!profileResponse.ok || !/^\d+$/.test(String(profile.sub))) throw new HttpError(502, 'Could not verify the Roblox account.');
        const session = { sid: token(), userId: String(profile.sub), name: String(profile.preferred_username || profile.name || 'Creator'), picture: typeof profile.picture === 'string' ? profile.picture : '', access: result.access_token, refresh: result.refresh_token || '', expiresAt: Date.now() + (Number(result.expires_in) || 900) * 1000, csrf: token(), tier: 0, tierValidUntil: 0, validUntil: Date.now() + SESSION_LIFETIME };
        const sealed = sealSession(session);
        backgroundStore?.rememberSession(session,sealed);
        res.setHeader('set-cookie', [`alex_oauth=; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=0; ${secure ? 'Secure' : ''}`, cookieFor(sealed, secure)]);
        return redirect(res, '/');
      }
      if (pathname === '/auth/logout' && req.method === 'POST') {
        const session = checkOrigin(req);
        revokedSessions.set(session.sid, session.validUntil);
        backgroundStore?.revokeSession(session.userId);
        if (revokedSessions.size > 1000) for (const [sid, expiry] of revokedSessions) if (expiry < Date.now()) revokedSessions.delete(sid);
        res.setHeader('set-cookie', cookieFor('', secure, true));
        return json(res, 200, { ok: true });
      }
      // Background queue: verified CSRF + account ownership, no .rbxl upload.
      if (pathname === '/api/background/jobs' && req.method === 'GET') {
        const session = requireUser(req);
        return json(res,200,{jobs: backgroundStore?.list(session.userId)||[],enabled:!!backgroundStore});
      }
      if (pathname === '/api/background/jobs' && req.method === 'POST') {
        if (!backgroundStore) throw new HttpError(503,'Background jobs require a Railway volume and Node.js 22+. See README.');
        const session=checkOrigin(req);
        const options=await bulkJobBody(req);
        if (!options || options.rightsConfirmed!==true || !Array.isArray(options.items))
          throw new HttpError(403,'Confirm you own or have explicit rights to republish these assets.');
        const tier=await checkTier(session);
        const groupId=String(options.groupId||'').trim();
        if (groupId) validateId(groupId);
        const description=String(options.description||'').trim();
        if (description.length>1000 || (description && tier<3))
          throw new HttpError(403,'Description requires Ultra tier and must be <=1000 characters.');
        if (options.items.length<1 || options.items.length>30000)
          throw new HttpError(413,'Choose 1 to 30,000 unique asset IDs for this job.');
        const seen=new Set();
        const items=[];
        for(const raw of options.items){
          const oldId=validateId(raw.oldId);
          if(seen.has(oldId)) continue;
          seen.add(oldId);
          const assetType=String(raw.assetType||'Auto');
          if(assetType!=='Auto'&&!AUTO_TYPES.has(assetType)) throw new HttpError(400,'Unsupported asset type in queue.');
          const displayName=String(raw.displayName||`${assetType} ${oldId}`).trim().slice(0,50);
          items.push({oldId,assetType,displayName:displayName||`Asset ${oldId}`});
        }
        const id=backgroundStore.create(session.userId,{items,groupId,description,
          fileFingerprint:String(options.fileFingerprint||'').slice(0,256)});
        return json(res,202,{id,total:items.length,status:'running'});
      }
      const bgMatch=pathname.match(/^\/api\/background\/jobs\/([a-f0-9]{32})(?:\/(cancel|resume))?$/);
      if (bgMatch) {
        if (!backgroundStore) throw new HttpError(503,'Background jobs are not configured.');
        const id=bgMatch[1],action=bgMatch[2];
        if (!action && req.method==='GET'){
          const session=requireUser(req),job=backgroundStore.view(session.userId,id);
          if(!job)throw new HttpError(404,'Background job not found.');
          return json(res,200,job);
        }
        if (action && req.method==='POST'){
          const session=checkOrigin(req);
          const changed=action==='cancel'?backgroundStore.stop(session.userId,id):backgroundStore.resume(session.userId,id);
          if (!changed)throw new HttpError(409,'Job was not found or cannot change state.');
          return json(res,200,{ok:true});
        }
        throw new HttpError(405,'Method not allowed.');
      }
      if (pathname === '/api/auto-reupload' && req.method === 'POST') {
        const session = checkOrigin(req);
        const options = await smallJsonBody(req);
        if (!options || typeof options !== 'object' || options.rightsConfirmed !== true) throw new HttpError(403, 'Confirm you own or have explicit rights to republish these assets.');
        const oldId = validateId(options.oldId);
        const assetType = String(options.assetType || '');
        if (assetType !== 'Auto' && !AUTO_TYPES.has(assetType)) throw new HttpError(400, 'Unsupported automatic asset category.');
        const groupId = String(options.groupId || '').trim();
        const creator = groupId ? { groupId: validateId(groupId) } : { userId: session.userId };
        const name = String(options.displayName || `${assetType} ${oldId}`).trim().slice(0, 50);
        if (!name) throw new HttpError(400, 'An asset name is required.');
        const tier = await checkTier(session);
        const description = String(options.description || '').trim();
        if (description.length > 0 && tier < 3) throw new HttpError(403, 'Custom descriptions require the Ultra tier.');
        if (description.length > 1000) throw new HttpError(400, 'Description is too long.');
        const quota = available(session, tier);
        const dedupeKey = `${session.userId}:${oldId}:${groupId}`;
        if (autoPending.has(dedupeKey)) return json(res, 202, { oldId, operation: autoPending.get(dedupeKey), status: 'processing' });
        if (quota.used >= quota.limit) throw new HttpError(429, 'Daily ALEX upload allowance reached.');
        const bearer = { authorization: `Bearer ${await accessToken(session, res)}` };

        // Verify the original asset is owned by this signed-in account. An
        // RBXL reference or a public download is not proof of redistribution rights.
        const metadataResponse = await fetcher(`${ASSETS}/assets/${oldId}`, { headers: bearer, redirect: 'manual' });
        if (!metadataResponse.ok) throw new HttpError(403, 'Roblox did not authorize reading this source asset.');
        const metadata = await remoteJson(metadataResponse);
        const sourceOwner = metadata.creationContext?.creator || {};
        const ownedByAccount = String(sourceOwner.userId || '') === session.userId;
        const ownedByDestinationGroup = groupId && String(sourceOwner.groupId || '') === groupId;
        if (!ownedByAccount && !ownedByDestinationGroup) {
          throw new HttpError(403, 'The source asset is not owned by your account or the chosen destination group.');
        }
        const verifiedType = normalizedAssetType(metadata.assetType);
        if (!verifiedType) throw new HttpError(422, 'This source asset category cannot be reuploaded with the supported Roblox Assets API.');
        if (assetType !== 'Auto' && assetType !== verifiedType) {
          throw new HttpError(422, 'Roblox asset type does not match the file reference.');
        }

        let content = await fetcher(`${ASSET_DELIVERY}/${oldId}`, { headers: bearer, redirect: 'manual' });
        if (!content.ok && content.status !== 302 && content.status !== 307) throw new HttpError(403, 'Roblox did not provide downloadable original media for this asset.');
        let location = content.headers.get('location');
        if (!location && String(content.headers.get('content-type') || '').includes('application/json')) {
          const result = await remoteJson(content);
          location = result.location || result.locations?.[0]?.location || result.locations?.[0]?.url || null;
          if (!location) throw new HttpError(422, 'Roblox returned no downloadable original media.');
        }
        if (location) {
          content = await fetcher(trustedDownloadUrl(location), { redirect: 'manual' });
          if (!content.ok) throw new HttpError(403, 'Roblox denied access to the original media bytes.');
        }
        const media = await limitedAssetBytes(content);
        if (!media.length) throw new HttpError(422, 'The original asset data was empty.');
        const [fileName, mime] = recognizedAssetFile(verifiedType, media);
        const multipart = new FormData();
        multipart.set('request', JSON.stringify({ assetType: verifiedType, displayName: name, description: description || 'Reuploaded with ALEX Reuploader', creationContext: { creator } }));
        multipart.set('fileContent', new Blob([media], { type: mime }), fileName);
        const upload = await fetcher(`${ASSETS}/assets`, { method: 'POST', headers: bearer, body: multipart });
        const result = await remoteJson(upload);
        if (!upload.ok) throw new HttpError(upload.status >= 500 ? 502 : 400, `Roblox rejected this authorized reupload: ${String(result.message || result.error || 'Check asset permissions and quotas.').slice(0, 160)}`);
        const path = String(result.path || '');
        if (!/^operations\/[A-Za-z0-9_-]+$/.test(path)) throw new HttpError(502, 'Roblox returned no operation ID.');
        chargeUsage(session,quota,tier);
        autoPending.set(dedupeKey, path.split('/')[1]);
        return json(res, 202, { oldId, operation: path.split('/')[1], status: 'processing' });
      }
      if (pathname === '/api/upload' && req.method === 'POST') {
        const session = checkOrigin(req);
        const tier = await checkTier(session);
        const quota = available(session, tier);
        if (quota.used >= quota.limit) throw new HttpError(429, 'Your ALEX daily upload allowance is used. Try again tomorrow or upgrade.');
        const form = await getMultipart(req);
        const file = form.get('file');
        const oldId = validateId(form.get('oldId'));
        const assetType = String(form.get('assetType') || '');
        const description = String(form.get('description') || '').trim();
        const creatorGroup = String(form.get('groupId') || '').trim();
        if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0 || file.size > MAX_FILE) throw new HttpError(400, 'Choose one file up to 20 MB.');
        const contentType = mediaType(assetType, file.name);
        if (!contentType) throw new HttpError(400, 'This file extension is not supported for the selected asset type.');
        if (description.length > 0 && tier < 3) throw new HttpError(403, 'Custom descriptions require the Ultra tier.');
        if (description.length > 1000) throw new HttpError(400, 'Description is too long.');
        const creator = creatorGroup ? { groupId: validateId(creatorGroup) } : { userId: session.userId };
        const name = String(form.get('displayName') || file.name.replace(/\.[^.]+$/, '')).trim().slice(0, 50);
        if (!name) throw new HttpError(400, 'Asset name cannot be empty.');

        const tokenValue = await accessToken(session, res);
        const upload = new FormData();
        upload.set('request', JSON.stringify({ assetType, displayName: name, description: description || 'Uploaded with ALEX Reuploader', creationContext: { creator } }));
        upload.set('fileContent', new Blob([await file.arrayBuffer()], { type: contentType }), file.name);
        const upstream = await fetcher(`${ASSETS}/assets`, { method: 'POST', headers: { authorization: `Bearer ${tokenValue}` }, body: upload });
        const output = await remoteJson(upstream);
        if (!upstream.ok) throw new HttpError(upstream.status >= 500 ? 502 : 400, `Roblox upload failed: ${String(output.message || output.error?.message || output.error || 'Check file format and creator permissions.').slice(0, 250)}`);
        const path = String(output.path || '');
        if (!/^operations\/[A-Za-z0-9_-]+$/.test(path)) throw new HttpError(502, 'Roblox returned no operation ID for the upload.');
        chargeUsage(session,quota,tier);
        return json(res, 202, { oldId, operation: path.split('/')[1], status: 'processing' });
      }
      if (pathname.startsWith('/api/operations/') && req.method === 'GET') {
        const session = requireUser(req);
        const id = pathname.slice('/api/operations/'.length);
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new HttpError(400, 'Invalid operation ID.');
        const upstream = await fetcher(`${ASSETS}/operations/${id}`, { headers: { authorization: `Bearer ${await accessToken(session, res)}` } });
        const output = await remoteJson(upstream);
        if (!upstream.ok) throw new HttpError(502, 'Could not check the Roblox upload status.');
        const moderationRejected = output.response?.moderationResult?.moderationState === 'MODERATION_STATE_REJECTED';
        if (output.done && (output.error || moderationRejected)) {
          for (const [key, operationId] of autoPending) {
            if (operationId === id && key.startsWith(`${session.userId}:`)) autoPending.delete(key);
          }
        }
        return json(res, 200, { done: output.done === true, assetId: output.done ? String(output.response?.assetId || '') : '', error: String(output.error?.message || (moderationRejected ? 'Roblox moderation rejected the asset.' : '')) });
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      if (pathname === '/node_modules/fzstd/esm/index.mjs') {
        const decoder = await readFile(join(ROOT, 'node_modules', 'fzstd', 'esm', 'index.mjs'));
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
        return res.end(decoder);
      }
      const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/scan-import.js': ['scan-import.js', 'text/javascript'], '/rbxl-reader.js': ['rbxl-reader.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      const file = files[pathname];
      if (!file) throw new HttpError(404, 'Page not found.');
      const data = await readFile(join(ROOT, 'public', file[0]));
      res.writeHead(200, { 'content-type': `${file[1]}; charset=utf-8`, 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' });
      res.end(data);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error('ALEX server error:', error?.message);
      json(res, status, { error: status >= 500 && !(error instanceof HttpError) ? 'Server error. Check the Railway logs.' : error.message });
    }
  };
  app.backgroundStore=backgroundStore;
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  const app=createApp();
  const server = http.createServer(app);
  server.listen(port, '0.0.0.0', () => {
    console.log(`ALEX REUPLOADER listening on ${port}`);
    if(app.backgroundStore) {
      const worker=createBackgroundWorker(app.backgroundStore,{port});
      console.log('ALEX persistent background worker running on mounted volume');
      process.once('SIGTERM',()=>{worker.stop(); server.close();});
    }
  });
}
