import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OAUTH = 'https://apis.roblox.com/oauth/v1';
const ASSETS = 'https://apis.roblox.com/assets/v1';
const PASSES = ['2037861333', '2037927296', '2040560797'];
const PASS_NAMES = ['Creator', 'Pro', 'Ultra'];
const OWNER_IDS = new Set(['9140908042', '10290256654']);
const DEFAULT_GROUP = '548271796';
const MAX_FILE = 20 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 512 * 1024;
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

export function createApp({ env = process.env, fetcher = globalThis.fetch } = {}) {
  const clientId = env.ROBLOX_OAUTH_CLIENT_ID || '';
  const clientSecret = env.ROBLOX_OAUTH_CLIENT_SECRET || '';
  const origin = (env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const redirectUri = env.ROBLOX_OAUTH_REDIRECT_URI || `${origin}/auth/callback`;
  const secure = origin.startsWith('https://');
  const configured = !!(clientId && clientSecret && env.PUBLIC_BASE_URL);
  const sessions = new Map();
  const states = new Map();
  const daily = new Map();

  function sessionOf(req) { return sessions.get(parseCookie(req.headers.cookie)) || null; }
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
  async function accessToken(session) {
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
    const used = tally?.day === day ? tally.used : 0;
    return { used, limit: LIMITS[tier], day };
  }

  return async function app(req, res) {
    const pathname = new URL(req.url || '/', origin).pathname;
    try {
      res.setHeader('x-frame-options', 'DENY');
      res.setHeader('referrer-policy', 'no-referrer');
      res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' https://*.rbxcdn.com data:; connect-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
      if (pathname === '/healthz') return json(res, 200, { ok: true });
      if (pathname === '/api/config') return json(res, 200, { ready: configured, groupId: DEFAULT_GROUP, passes: PASSES.map((id, i) => ({ id, name: PASS_NAMES[i] })), maxFileMiB: 20 });
      if (pathname === '/api/me') {
        const session = sessionOf(req);
        if (!session) return json(res, 200, { loggedIn: false });
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
        const sid = token();
        sessions.set(sid, { userId: String(profile.sub), name: String(profile.preferred_username || profile.name || 'Creator'), picture: typeof profile.picture === 'string' ? profile.picture : '', access: result.access_token, refresh: result.refresh_token || '', expiresAt: Date.now() + (Number(result.expires_in) || 900) * 1000, csrf: token(), tier: 0, tierValidUntil: 0 });
        res.setHeader('set-cookie', [`alex_oauth=; HttpOnly; SameSite=Lax; Path=/auth/callback; Max-Age=0; ${secure ? 'Secure' : ''}`, cookieFor(sid, secure)]);
        return redirect(res, '/');
      }
      if (pathname === '/auth/logout' && req.method === 'POST') {
        checkOrigin(req);
        sessions.delete(parseCookie(req.headers.cookie));
        res.setHeader('set-cookie', cookieFor('', secure, true));
        return json(res, 200, { ok: true });
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

        const tokenValue = await accessToken(session);
        const upload = new FormData();
        upload.set('request', JSON.stringify({ assetType, displayName: name, description: description || 'Uploaded with ALEX Reuploader', creationContext: { creator } }));
        upload.set('fileContent', new Blob([await file.arrayBuffer()], { type: contentType }), file.name);
        const upstream = await fetcher(`${ASSETS}/assets`, { method: 'POST', headers: { authorization: `Bearer ${tokenValue}` }, body: upload });
        const output = await remoteJson(upstream);
        if (!upstream.ok) throw new HttpError(upstream.status >= 500 ? 502 : 400, `Roblox upload failed: ${String(output.message || output.error?.message || output.error || 'Check file format and creator permissions.').slice(0, 250)}`);
        const path = String(output.path || '');
        if (!/^operations\/[A-Za-z0-9_-]+$/.test(path)) throw new HttpError(502, 'Roblox returned no operation ID for the upload.');
        daily.set(session.userId, { day: quota.day, used: quota.used + 1 });
        return json(res, 202, { oldId, operation: path.split('/')[1], status: 'processing' });
      }
      if (pathname.startsWith('/api/operations/') && req.method === 'GET') {
        const session = requireUser(req);
        const id = pathname.slice('/api/operations/'.length);
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new HttpError(400, 'Invalid operation ID.');
        const upstream = await fetcher(`${ASSETS}/operations/${id}`, { headers: { authorization: `Bearer ${await accessToken(session)}` } });
        const output = await remoteJson(upstream);
        if (!upstream.ok) throw new HttpError(502, 'Could not check the Roblox upload status.');
        const moderationRejected = output.response?.moderationResult?.moderationState === 'MODERATION_STATE_REJECTED';
        return json(res, 200, { done: output.done === true, assetId: output.done ? String(output.response?.assetId || '') : '', error: String(output.error?.message || (moderationRejected ? 'Roblox moderation rejected the asset.' : '')) });
      }
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
      const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/scan-import.js': ['scan-import.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
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
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer(createApp());
  server.listen(port, '0.0.0.0', () => console.log(`ALEX REUPLOADER listening on ${port}`));
}
