import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp, mediaType, validateId } from '../server.mjs';
import { parseImport, normalizeReferenceId, extractMediaReferencesFromScript } from '../public/scan-import.js';

test('validates Roblox asset IDs and extension/type combinations', () => {
  assert.equal(validateId('123456789'), '123456789');
  assert.throws(() => validateId('abc'));
  assert.throws(() => validateId('../etc/passwd'));
  assert.equal(mediaType('Audio', 'example.MP3'), 'audio/mpeg');
  assert.equal(mediaType('Animation', 'dance.rbxmx'), 'model/x-rbxm');
  assert.equal(mediaType('Audio', 'dance.rbxmx'), null);
  assert.equal(mediaType('Mesh', 'file.fbx'), null);
});

test('reads JSON and CSV audio/animation manifests without media downloads', () => {
  const json = parseImport(JSON.stringify({ items: [{ className: 'Sound', assetId: 'rbxassetid://12345' }] }), 'scan.json');
  assert.equal(normalizeReferenceId(json.items[0].assetId), '12345');
  const csv = parseImport('type,name,assetId\nAnimation,"Run, Fast",987654\nAudio,Theme,rbxassetid://43210', 'assets.csv');
  assert.equal(csv.items.length, 2);
  assert.deepEqual(csv.items.map(x => [x.className, x.name, x.assetId]), [
    ['Animation', 'Run, Fast', '987654'], ['Audio', 'Theme', '43210'],
  ]);
  assert.throws(() => parseImport('name,url\nSound,123', 'scan.csv'), /assetId and type/);
  assert.throws(() => parseImport('not json', 'scan.txt'), /Use Studio JSON/);
});

test('only extracts context-identified sound and animation IDs from scripts', () => {
  const refs = extractMediaReferencesFromScript(`
    someSound.SoundId = "rbxassetid://123456"
    run.AnimationId = 'https://www.roblox.com/asset/?id=987654'
    local unrelated = 333333
    print("rbxassetid://777777")
  `);
  assert.deepEqual(refs, [
    { className: 'Sound', assetId: '123456' },
    { className: 'Animation', assetId: '987654' },
  ]);
});

async function withApp(fn, fetcher = async () => { throw new Error('Unexpected outbound request'); }) {
  const app = createApp({ env: { PUBLIC_BASE_URL: 'http://localhost:3000', ROBLOX_OAUTH_CLIENT_ID: 'test-client', ROBLOX_OAUTH_CLIENT_SECRET: 'test-secret' }, fetcher });
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('serves dashboard but protects upload from unsigned visitors', async () => {
  await withApp(async url => {
    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /ALEX — Asset Reuploader/);
    assert.equal((await fetch(`${url}/scan-import.js`)).status, 200);
    assert.equal((await fetch(`${url}/rbxl-reader.js`)).status, 200);
    const zstdModule = await fetch(`${url}/node_modules/fzstd/esm/index.mjs`);
    assert.equal(zstdModule.status, 200);
    assert.match(zstdModule.headers.get('content-type'), /text\/javascript/);
    assert.match(await zstdModule.text(), /export function decompress/);
    assert.equal((await fetch(`${url}/node_modules/fzstd/package.json`)).status, 404);
    const config = await (await fetch(`${url}/api/config`)).json();
    assert.equal(config.groupId, '548271796');
    assert.deepEqual(config.passes.map(x => x.id), ['2037861333','2037927296','2040560797']);
    const response = await fetch(`${url}/api/upload`, { method: 'POST' });
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /Sign in/);
    assert.equal((await fetch(`${url}/x-does-not-exist`)).status, 404);
  });
});

test('OAuth login, original file upload, operation status and CSRF protection', async () => {
  const calls = [];
  const mock = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'token-test', refresh_token: 'refresh-test', expires_in: 900 }), { status: 200 });
    if (url.endsWith('/userinfo')) return new Response(JSON.stringify({ sub: '9140908042', preferred_username: 'Alex' }), { status: 200 });
    if (url.endsWith('/assets/v1/assets')) {
      const details = JSON.parse(options.body.get('request'));
      assert.equal(details.creationContext.creator.groupId, '548271796');
      assert.equal(details.assetType, 'Audio');
      assert.equal(details.description, 'custom description');
      return new Response(JSON.stringify({ path: 'operations/operation_123' }), { status: 200 });
    }
    if (url.endsWith('/operations/operation_123')) return new Response(JSON.stringify({ done: true, response: { assetId: '987654321' } }), { status: 200 });
    throw new Error(`Unexpected fetch: ${url}`);
  };
  await withApp(async url => {
    const begin = await fetch(`${url}/auth/start`, { redirect: 'manual' });
    assert.equal(begin.status, 302);
    const authorize = new URL(begin.headers.get('location'));
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    const state = authorize.searchParams.get('state');
    const oauthCookie = begin.headers.get('set-cookie').split(';')[0];
    const bad = await fetch(`${url}/auth/callback?code=code&state=${state}`, { redirect: 'manual' });
    assert.equal(bad.status, 400, 'OAuth state must be tied to browser flow cookie');

    // Start again; a consumed failed state must not be reused.
    const retry = await fetch(`${url}/auth/start`, { redirect: 'manual' });
    const retryState = new URL(retry.headers.get('location')).searchParams.get('state');
    const valid = await fetch(`${url}/auth/callback?code=code&state=${retryState}`, { redirect: 'manual', headers: { cookie: retry.headers.get('set-cookie').split(';')[0] } });
    assert.equal(valid.status, 302);
    const sidCookie = valid.headers.get('set-cookie').match(/alex_sid=[^;]+/)[0];
    const me = await (await fetch(`${url}/api/me`, { headers: { cookie: sidCookie } })).json();
    assert.equal(me.loggedIn, true);
    assert.equal(me.tier, 3, 'Owner receives Ultra without requiring game pass purchase');

    const form = new FormData();
    form.set('file', new Blob(['ID3hello'], { type: 'audio/mpeg' }), 'audio.mp3');
    form.set('oldId', '123456789');
    form.set('assetType', 'Audio');
    form.set('groupId', '548271796');
    form.set('description', 'custom description');
    form.set('displayName', 'Music');
    const rejected = await fetch(`${url}/api/upload`, { method: 'POST', headers: { cookie: sidCookie }, body: form });
    assert.equal(rejected.status, 403, 'Upload requires CSRF header');
    const accepted = await fetch(`${url}/api/upload`, { method: 'POST', headers: { cookie: sidCookie, 'x-alex-csrf': me.csrf }, body: form });
    assert.equal(accepted.status, 202);
    assert.equal((await accepted.json()).operation, 'operation_123');
    const result = await (await fetch(`${url}/api/operations/operation_123`, { headers: { cookie: sidCookie } })).json();
    assert.equal(result.assetId, '987654321');
    assert.equal(calls.filter(x => x.url.endsWith('/assets/v1/assets')).length, 1);
  }, mock);
});

test('second owner account receives Ultra without a game pass', async () => {
  const mock = async url => {
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'second-owner-token', expires_in: 900 }), { status: 200 });
    if (url.endsWith('/userinfo')) return new Response(JSON.stringify({ sub: '10290256654', preferred_username: 'SecondOwner' }), { status: 200 });
    throw new Error(`Unexpected external request: ${url}`);
  };
  await withApp(async url => {
    const start = await fetch(`${url}/auth/start`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const flowCookie = start.headers.get('set-cookie').split(';')[0];
    const callback = await fetch(`${url}/auth/callback?code=code&state=${state}`, { redirect: 'manual', headers: { cookie: flowCookie } });
    assert.equal(callback.status, 302);
    const cookie = callback.headers.get('set-cookie').match(/alex_sid=[^;]+/)[0];
    const me = await (await fetch(`${url}/api/me`, { headers: { cookie } })).json();
    assert.equal(me.user.id, '10290256654');
    assert.equal(me.plan, 'Ultra');
    assert.equal(me.tier, 3);
    assert.equal(me.allowance.limit, 100);
  }, mock);
});

test('automatic account-owned audio reupload retrieves permitted content and creates an operation', async () => {
  let uploads = 0;
  const mock = async (url, options = {}) => {
    if (url.endsWith('/token')) return new Response(JSON.stringify({ access_token: 'owned-asset-token', expires_in: 900 }), { status: 200 });
    if (url.endsWith('/userinfo')) return new Response(JSON.stringify({ sub: '9140908042', preferred_username: 'Alex' }), { status: 200 });
    if (url.endsWith('/assets/v1/assets/123456')) return Response.json({ assetType: 'ASSET_TYPE_AUDIO', creationContext: { creator: { userId: '9140908042' } } });
    if (url.endsWith('/asset-delivery-api/v1/assetId/123456')) return Response.json({ location: 'https://cdn.rbxcdn.com/owned-original' });
    if (url === 'https://cdn.rbxcdn.com/owned-original') return new Response(Buffer.from('OggSauthorized original audio'));
    if (url.endsWith('/assets/v1/assets') && options.method === 'POST') {
      uploads++;
      const form = options.body;
      const info = JSON.parse(form.get('request'));
      assert.equal(info.creationContext.creator.userId, '9140908042');
      assert.equal(info.assetType, 'Audio');
      assert.equal(form.get('fileContent').type, 'audio/ogg');
      return Response.json({ path: 'operations/auto_123' });
    }
    if (url.endsWith('/operations/auto_123')) return Response.json({ done: true, response: { assetId: '999999' } });
    throw new Error(`Unexpected upstream call: ${url}`);
  };
  await withApp(async url => {
    const start = await fetch(`${url}/auth/start`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const callback = await fetch(`${url}/auth/callback?code=code&state=${state}`, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie').split(';')[0] } });
    const cookie = callback.headers.get('set-cookie').match(/alex_sid=[^;]+/)[0];
    const me = await (await fetch(`${url}/api/me`, { headers: { cookie } })).json();
    const payload = { oldId: '123456', assetType: 'Audio', displayName: 'Theme', rightsConfirmed: true };
    const auto = await fetch(`${url}/api/auto-reupload`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-alex-csrf': me.csrf }, body: JSON.stringify(payload) });
    assert.equal(auto.status, 202);
    assert.equal((await auto.json()).operation, 'auto_123');
    assert.equal(uploads, 1);
    const repeated = await fetch(`${url}/api/auto-reupload`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-alex-csrf': me.csrf }, body: JSON.stringify(payload) });
    assert.equal(repeated.status, 202);
    assert.equal(uploads, 1, 'automatic retries should not duplicate Roblox uploads');
  }, mock);
});

test('automatic reupload refuses assets not verified as owned by the signed-in account', async () => {
  let contentRequested = false;
  const mock = async url => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'only-owner-content', expires_in: 900 });
    if (url.endsWith('/userinfo')) return Response.json({ sub: '9140908042', preferred_username: 'Alex' });
    if (url.endsWith('/assets/v1/assets/456789')) return Response.json({ assetType: 'ASSET_TYPE_ANIMATION', creationContext: { creator: { userId: '87654321' } } });
    contentRequested = true;
    throw new Error(`Should never fetch unowned source: ${url}`);
  };
  await withApp(async url => {
    const start = await fetch(`${url}/auth/start`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const callback = await fetch(`${url}/auth/callback?code=code&state=${state}`, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie').split(';')[0] } });
    const cookie = callback.headers.get('set-cookie').match(/alex_sid=[^;]+/)[0];
    const me = await (await fetch(`${url}/api/me`, { headers: { cookie } })).json();
    const denied = await fetch(`${url}/api/auto-reupload`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-alex-csrf': me.csrf }, body: JSON.stringify({ oldId: '456789', assetType: 'Animation', rightsConfirmed: true }) });
    assert.equal(denied.status, 403);
    assert.equal(contentRequested, false);
  }, mock);
});
