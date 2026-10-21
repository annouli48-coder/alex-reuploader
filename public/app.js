import { normalizeReferenceId } from './scan-import.js';
import { scanBinaryPlace, rewriteBinaryPlace } from './rbxl-reader.js';

const $ = id => document.getElementById(id);
const STORE = 'alex-reuploader-v1';
const ASSET_PAGE_SIZE = 250;
const LAST_BG = 'alex-reuploader-latest-background-job';
function savedBackgroundId(){try{return localStorage.getItem(LAST_BG)||'';}catch{return '';}}
function rememberBackgroundId(id){try{localStorage.setItem(LAST_BG,id);}catch{/* Optional browser storage unavailable. */}}
const state = { items: [], mapping: {}, scanCount: 0, insights: null, user: null, config: null, placeBuffer: null, placeName: '', placeFingerprint: '', autoBusy: false, stopRequested: false, visibleAssetRows: ASSET_PAGE_SIZE, snapshotNotSaved: false, backgroundJob: savedBackgroundId() };

function loadSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (data.scanFormat === 'rbxl' && Array.isArray(data.items)) state.items = data.items.filter(x => /^\d+$/.test(x.id));
    if (data.mapping && typeof data.mapping === 'object') {
      for (const [oldId, newId] of Object.entries(data.mapping)) if (/^\d+$/.test(oldId) && /^\d+$/.test(String(newId))) state.mapping[oldId] = String(newId);
    }
    if (data.scanFormat === 'rbxl') {
      state.snapshotNotSaved = data.savedWithoutItems === true;
      state.scanCount = state.snapshotNotSaved ? 0 : Number(data.scanCount) || 0;
      if (!state.snapshotNotSaved && data.insights && typeof data.insights === 'object') state.insights = data.insights;
      state.placeFingerprint = String(data.placeFingerprint || '');
    }
  } catch { /* Browser storage may be empty or inaccessible. */ }
}
function save() {
  const summary = { scanFormat: 'rbxl', mapping: state.mapping, scanCount: state.scanCount, insights: state.insights, placeFingerprint: state.placeFingerprint };
  try {
    // Browser localStorage is usually only a few MB. Keep huge scans in this
    // tab instead of silently truncating them to a misleading partial list.
    if (state.items.length <= 5000) {
      const snapshot = JSON.stringify({ ...summary, items: state.items, savedWithoutItems: false });
      if (snapshot.length < 3_000_000) {
        localStorage.setItem(STORE, snapshot);
        state.snapshotNotSaved = false;
        return true;
      }
    }
    localStorage.setItem(STORE, JSON.stringify({ ...summary, items: [], savedWithoutItems: true }));
    state.snapshotNotSaved = true;
    return false;
  } catch {
    state.snapshotNotSaved = true;
    try { localStorage.setItem(STORE, JSON.stringify({ ...summary, items: [], savedWithoutItems: true })); }
    catch { /* Storage disabled or full; the in-memory scan still works. */ }
    return false;
  }
}
function toast(message) {
  const target = $('toast'); target.textContent = message; target.classList.add('visible');
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => target.classList.remove('visible'), 4800);
}
function typeOf(item) {
  const kind = String(item.className || item.assetType || item.type || '').toLowerCase();
  if (kind === 'animation') return 'Animation';
  if (kind === 'sound' || kind === 'audio' || kind === 'audioplayer') return 'Audio';
  if (['MeshPart', 'SpecialMesh'].includes(item.className) && /mesh/i.test(item.property)) return 'Mesh';
  if (['MeshPart', 'SpecialMesh'].includes(item.className)) return 'Image';
  if (item.className === 'VideoFrame') return 'Video';
  if (item.className === 'SurfaceAppearance' || /image/i.test(item.className)) return 'Image';
  if (item.className === 'UnknownAsset') return 'Unknown';
  if (item.className === 'Decal' || /Texture|Map|Skybox|Graphic|Face/i.test(item.property)) return 'Image';
  return 'Unknown';
}
function parseScan(doc) {
  if (!doc || !Array.isArray(doc.items)) throw new Error('Expected a scan with an "items" array.');
  const byId = new Map();
  const byLocation = new Map();
  const insights = { audio: 0, animation: 0, other: 0, scripts: 0, values: 0, locations: [] };
  for (const rawItem of doc.items) {
    if (!rawItem) continue;
    const id = normalizeReferenceId(rawItem.assetId ?? rawItem.id ?? rawItem.asset_id);
    if (!id || id === '0') continue;
    const name = String(rawItem.name || 'Unnamed asset').slice(0, 150);
    const path = String(rawItem.path || name).slice(0, 500);
    const type = typeOf(rawItem);
    if (type === 'Audio') insights.audio++;
    if (type === 'Animation') insights.animation++;
    if (type !== 'Audio' && type !== 'Animation') insights.other++;
    if (rawItem.source === 'Script' || String(rawItem.property).includes('Source (read only)')) insights.scripts++;
    if (rawItem.source === 'Value' || String(rawItem.property).includes('Value (read only)')) insights.values++;
    const parts = path.split(/[./]/).map(x => x.trim()).filter(Boolean).slice(0, 5);
    for (let i = 1; i <= parts.length; i++) {
      const location = parts.slice(0, i).join('.');
      if (!byLocation.has(location) && byLocation.size >= 350) break;
      byLocation.set(location, (byLocation.get(location) || 0) + 1);
    }
    if (!byId.has(id)) byId.set(id, { id, name, path, type, refs: 0 });
    byId.get(id).refs++;
    if (byId.get(id).type === 'Unknown' && type !== 'Unknown') byId.get(id).type = type;
  }
  if (doc.items.length && byId.size === 0) throw new Error('The scan has no valid Roblox asset IDs.');
  insights.locations = [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 350);
  state.items = [...byId.values()]; state.scanCount = doc.items.length; state.insights = insights; state.visibleAssetRows = ASSET_PAGE_SIZE;
  if (doc.groupId && /^\d+$/.test(String(doc.groupId))) $('groupId').value = String(doc.groupId);
  save(); render();
  return `Imported ${state.scanCount} references across ${state.items.length} unique IDs.`;
}
function node(tag, className, content) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (content !== undefined) n.textContent = content;
  return n;
}
function show(screen) {
  document.querySelectorAll('[data-screen]').forEach(x => x.classList.toggle('active', x.dataset.screen === screen));
  document.querySelectorAll('.screen').forEach(x => x.classList.toggle('hidden', x.id !== `screen-${screen}`));
  $('pageCrumb').textContent = ({ dashboard: 'Overview', assets: 'Asset scanner', uploads: 'Reupload queue', plans: 'Memberships' })[screen] || 'Overview';
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderAssets() {
  const filter = $('filterAsset').value.trim().toLowerCase();
  const type = $('typeFilter').value;
  const listed = state.items.filter(item => (type === 'all' || item.type === type || (type === 'Decal' && item.type === 'Image')) && (item.id.includes(filter) || item.name.toLowerCase().includes(filter) || item.path.toLowerCase().includes(filter)));
  const tbody = $('assetTable'); tbody.replaceChildren();
  $('assetsEmpty').classList.toggle('hidden', listed.length > 0);
  const showing = Math.min(listed.length, state.visibleAssetRows);
  $('assetListSummary').textContent = `Showing ${showing.toLocaleString()} of ${listed.length.toLocaleString()} matching asset IDs. Every detected ID is included in the scan.`;
  $('moreAssets').classList.toggle('hidden', showing === listed.length);
  const fragment = document.createDocumentFragment();
  for (const item of listed.slice(0, showing)) {
    const tr = node('tr');
    const name = node('td'); name.append(node('strong', '', item.name), node('small', '', `${item.path} • ${item.id}`));
    const kind = node('td'); kind.append(node('span', `type-tag ${item.type.toLowerCase()}`, item.type === 'Manual' ? 'Manual only' : item.type));
    const refs = node('td', '', String(item.refs));
    const newId = node('td'); const mapped = state.mapping[item.id]; newId.append(node('code', '', mapped || '—'));
    const actions = node('td');
    actions.append(node('span', 'quiet', mapped ? 'Ready' : 'Check ownership'));
    tr.append(name, kind, refs, newId, actions); fragment.append(tr);
  }
  tbody.append(fragment);
}
function renderQueue() {
  const list = $('mappingList'); list.replaceChildren();
  const pairs = Object.entries(state.mapping).filter(([a, b]) => /^\d+$/.test(a) && /^\d+$/.test(b));
  $('mappedCount').textContent = String(pairs.length);
  if (!pairs.length) list.append(node('div', 'mini-empty', 'No completed reuploads yet.'));
  for (const [oldId, newId] of pairs) {
    const row = node('div', 'map-row'); row.append(node('span', 'from', oldId), node('span', '', '→'), node('span', 'to', newId)); list.append(row);
  }
}
function renderInsights() {
  const insights = state.insights;
  $('insightsPanel').classList.toggle('hidden', !insights || !state.scanCount);
  if (!insights) return;
  $('animationReferences').textContent = String(insights.animation || 0);
  $('soundReferences').textContent = String(insights.audio || 0);
  $('otherReferences').textContent = String(insights.other || 0);
  $('scriptReferences').textContent = String(insights.scripts || 0);
  $('valueReferences').textContent = String(insights.values || 0);
  const container = $('locationList'); container.replaceChildren();
  const tree = { children: new Map(), count: 0 };
  for (const [path, count] of insights.locations || []) {
    let branch = tree;
    for (const name of path.split('.')) {
      if (!branch.children.has(name)) branch.children.set(name, { name, count: 0, children: new Map() });
      branch = branch.children.get(name);
    }
    branch.count = count;
  }
  function showBranch(branch, target, depth) {
    const children = [...branch.children.values()].sort((a, b) => b.count - a.count);
    for (const child of children) {
      if (child.children.size) {
        const details = node('details', 'location-branch');
        if (depth === 0) details.open = true;
        const summary = node('summary', 'location-row');
        summary.append(node('span', '', child.name), node('strong', '', String(child.count)));
        details.append(summary);
        const nested = node('div', 'location-children'); details.append(nested);
        target.append(details); showBranch(child, nested, depth + 1);
      } else {
        const row = node('div', 'location-row location-leaf');
        row.append(node('span', '', child.name), node('strong', '', String(child.count)));
        target.append(row);
      }
    }
  }
  showBranch(tree, container, 0);
}
function render() {
  $('navCount').textContent = String(state.items.length);
  $('statReferences').textContent = String(state.scanCount);
  $('statUnique').textContent = String(state.items.length);
  $('statRemaps').textContent = String(Object.keys(state.mapping).length);
  $('assetCount').textContent = String(state.items.length);
  $('scannerPill').textContent = state.items.length ? 'SCAN IMPORTED' : 'AWAITING SCAN';
  $('scannerPill').classList.toggle('online', state.items.length > 0);
  $('downloadFixed').disabled = !state.placeBuffer || !state.items.some(x => state.mapping[x.id]);
  renderAssets(); renderQueue(); renderInsights();
}
function renderAuth() {
  const me = state.user;
  if (me?.loggedIn) {
    $('authArea').replaceChildren();
    const name = node('span', 'account-name', `@${me.user.name}`);
    const logout = node('button', 'btn btn-small btn-outline', 'Sign out');
    logout.onclick = async () => {
      try { await api('/auth/logout', { method: 'POST', headers: { 'x-alex-csrf': me.csrf } }); location.reload(); } catch (e) { toast(e.message); }
    };
    $('authArea').append(name, logout); $('authArea').style.display = 'flex'; $('authArea').style.gap = '13px'; $('authArea').style.alignItems = 'center';
    $('connection').innerHTML = '<i></i> Roblox connected'; $('connection').classList.add('live');
    $('statTier').textContent = me.plan;
    $('statAllowance').textContent = `${me.allowance.used}/${me.allowance.limit} app uploads today`;
    $('oauthPill').textContent = 'CONNECTED'; $('oauthPill').classList.add('online');
    $('oauthStatus').textContent = `Connected as @${me.user.name}`;
    $('description').disabled = me.tier < 3;
    $('description').placeholder = me.tier < 3 ? 'Ultra tier required for custom descriptions' : 'Optional description for your new upload';
  } else {
    const login = node('a', 'btn btn-small btn-primary', 'Connect Roblox ↗');
    login.href = '/auth/start'; login.id = 'loginBtn';
    login.addEventListener('click', event => { if (!state.config?.ready) { event.preventDefault(); toast('First add ROBLOX_OAUTH_CLIENT_ID, ROBLOX_OAUTH_CLIENT_SECRET and PUBLIC_BASE_URL to Railway Variables.'); } });
    $('authArea').replaceChildren(login);
    $('connection').innerHTML = '<i></i> Roblox not connected';
    $('connection').classList.remove('live');
    $('description').disabled = true;
    $('statTier').textContent = 'Guest';
    $('statAllowance').textContent = 'Sign in to unlock uploads';
    $('oauthStatus').textContent = state.config?.ready ? 'Configured — waiting for your Roblox sign-in' : 'Add Roblox OAuth credentials to your Railway service';
    $('oauthPill').textContent = state.config?.ready ? 'READY' : 'SETUP NEEDED';
    $('oauthPill').classList.toggle('online', !!state.config?.ready);
  }
}
async function api(path, options) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function downloadFixedPlace() {
  if (!state.placeBuffer) return toast('Choose the original .rbxl file again before downloading the rebuilt copy.');
  try {
    const rebuilt = rewriteBinaryPlace(state.placeBuffer, state.mapping);
    if (!rebuilt.replacedReferences) return toast('No matching IDs have been reuploaded yet. Your original file is unchanged.');
    // Verify the structure is still parseable before offering the output.
    const checked = scanBinaryPlace(rebuilt.buffer);
    if (checked.totalInstances !== state.totalInstances) throw new Error('Rebuilt game did not pass structure validation. No file was downloaded.');
    const cleanName = (state.placeName.replace(/\.rbxl$/i, '') || 'Game').replace(/[^a-z0-9 _.-]/gi, '_').slice(0, 90);
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([rebuilt.buffer], { type: 'application/octet-stream' }));
    link.href = url;
    link.download = `${cleanName}_ALEX_REUPLOADED.rbxl`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Downloaded rebuilt RBXL with ${rebuilt.replacedReferences} updated references. Your original was preserved.`);
  } catch (error) { toast(`Could not rebuild the RBXL: ${error.message}`); }
}

async function startBackgroundScanned() {
  if (!state.user?.loggedIn) return toast('Sign in with Roblox to start a background job.');
  if (!state.config?.backgroundReady) return toast('Attach a Railway persistent volume before using background jobs.');
  const items = state.items.filter(x => !state.mapping[x.id]).map(x => ({
    oldId: x.id, assetType: 'Auto', displayName: String(x.name || `Asset ${x.id}`).slice(0, 50)
  }));
  if (!items.length) return toast('No unmapped asset IDs remain in this scan.');
  if (items.length > 30000) return toast('Background queue is capped at 30,000 unique IDs per job. Filter or split your place.');
  $('autoProgress').textContent = `Sending ${items.length.toLocaleString()} IDs to Railway (no RBXL file)…`;
  try {
    const job = await api('/api/background/jobs',{
      method:'POST',headers:{'content-type':'application/json','x-alex-csrf':state.user.csrf},
      body:JSON.stringify({rightsConfirmed:true,items,
        fileFingerprint:state.placeFingerprint,
        groupId:$('publishGroup').checked?$('groupId').value.trim():'',
        description:$('description').value.trim()})
    });
    state.backgroundJob = job.id;
    rememberBackgroundId(job.id);
    $('autoProgress').textContent = `Background job accepted: ${job.total.toLocaleString()} asset IDs. You may close this tab now.`;
    show('uploads');
    await refreshBackground();
  } catch(e) {
    $('autoProgress').textContent=`Background job NOT started: ${e.message}`;
    toast(e.message);
  }
}

async function refreshBackground() {
  if(!state.user?.loggedIn || !state.config?.backgroundReady) return;
  try {
    if(!state.backgroundJob) {
      const list=await api('/api/background/jobs');
      state.backgroundJob=list.jobs?.[0]?.id||'';
      if(state.backgroundJob)rememberBackgroundId(state.backgroundJob);
    }
    if(!state.backgroundJob)return;
    const job=await api(`/api/background/jobs/${encodeURIComponent(state.backgroundJob)}`);
    const good=job.counts.succeeded||0;
    const skipped=job.counts.skipped||0;
    const review=job.counts.review||0;
    $('backgroundPill').textContent=job.status.toUpperCase();
    $('backgroundBar').max=Math.max(1,job.total);
    $('backgroundBar').value=job.complete;
    $('backgroundSummary').textContent=`${job.status}: ${job.complete.toLocaleString()}/${job.total.toLocaleString()} handled · ${good} reuploaded · ${skipped} skipped · ${review} need review.`;
    $('cancelBackground').classList.toggle('hidden',job.status!=='running' && job.status!=='paused');
    $('resumeBackground').classList.toggle('hidden',job.status!=='paused');
    // Do not apply mappings to an unrelated .rbxl.
    if(job.fingerprint && state.placeFingerprint===job.fingerprint) {
      let changed=false;
      for(const pair of job.mapped||[]) {
        if(state.mapping[pair.oldId]!==pair.newId){state.mapping[pair.oldId]=pair.newId;changed=true;}
      }
      if(changed){save();render();}
    } else if(good) {
      $('backgroundSummary').textContent+=' Reselect the original .rbxl to apply these mappings.';
    }
  }catch(e){$('backgroundSummary').textContent=`Could not refresh background job: ${e.message}`;}
}

async function autoReuploadScanned() {
  if (state.autoBusy) return;
  if (!state.user?.loggedIn) return toast('Sign in with Roblox before enabling automatic reuploads.');
  const eligible = state.items.filter(item => !state.mapping[item.id]);
  if (!eligible.length) return toast('There are no new asset references to reupload.');
  const progress = $('autoProgress');
  state.autoBusy = true;
  state.stopRequested = false;
  $('manifestFile').disabled = true;
  $('stopAuto').classList.remove('hidden');
  let completed = 0, skipped = 0;
  try {
    for (const [index, item] of eligible.entries()) {
      if (state.stopRequested) {
        skipped += eligible.length - index;
        break;
      }
      progress.textContent = `Processing ${index + 1}/${eligible.length}: ${item.name} (${item.id})…`;
      try {
        const accepted = await api('/api/auto-reupload', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-alex-csrf': state.user.csrf },
          body: JSON.stringify({ oldId: item.id, assetType: 'Auto', displayName: item.name, rightsConfirmed: true,
            groupId: $('publishGroup').checked ? $('groupId').value.trim() : '', description: $('description').value.trim() }),
        });
        const newId = await pollOperation(accepted.operation);
        state.mapping[item.id] = newId;
        completed++; save(); render();
      } catch (error) {
        skipped++;
        progress.textContent = `Skipped ${item.id}: ${error.message}`;
        if (/daily .*allowance|rate limit/i.test(error.message)) {
          skipped += eligible.length - index - 1;
          progress.textContent = `Stopped at daily allowance: ${completed} reuploaded, ${skipped} left unchanged.`;
          break;
        }
      }
    }
    progress.textContent = `${state.stopRequested ? 'Stopped' : 'Finished'}: ${completed} reuploaded, ${skipped} unchanged. Only authorized source files were reuploaded.`;
    if (completed) downloadFixedPlace();
    try { state.user = await api('/api/me'); renderAuth(); } catch { /* Upload results remain available. */ }
  } finally { state.autoBusy = false; $('manifestFile').disabled = false; $('stopAuto').classList.add('hidden'); }
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function pollOperation(operation) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await wait(1800);
    const status = await api(`/api/operations/${encodeURIComponent(operation)}`);
    if (status.error) throw new Error(status.error);
    if (status.done) {
      if (!/^\d+$/.test(status.assetId)) throw new Error('Roblox finished the operation without returning an asset ID. Check your Creator Dashboard.');
      return status.assetId;
    }
  }
  throw new Error('Roblox is still processing. Check the Creator Dashboard before retrying to avoid duplicate uploads.');
}
document.querySelectorAll('[data-screen]').forEach(b => b.addEventListener('click', () => show(b.dataset.screen)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => show(b.dataset.goto)));
$('manifestFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!/\.rbxl$/i.test(file.name)) return toast('Choose a Roblox place file ending in .rbxl.');
  if (file.size > 150_000_000) return toast('RBXL is over 150 MB. Save or scan a smaller place.');
  $('scanStatus').textContent = `Reading ${file.name} locally…`;
  try {
    const buffer = await file.arrayBuffer();
    const result = scanBinaryPlace(buffer);
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    if (fingerprint !== state.placeFingerprint) state.mapping = {};
    state.placeBuffer = buffer;
    state.placeName = file.name;
    state.placeFingerprint = fingerprint;
    state.totalInstances = result.totalInstances;
    const message = parseScan(result);
    $('scanStatus').textContent = `${result.totalInstances.toLocaleString()} instances examined. ${message}${state.snapshotNotSaved ? ' This large scan stays in this tab; choose the file again after a refresh.' : ''}`;
    toast(message);
    if ($('autoMode').checked) {
      if ($('backgroundMode').checked) await startBackgroundScanned();
      else await autoReuploadScanned();
    } else if(state.backgroundJob) await refreshBackground();
  } catch (e) { $('scanStatus').textContent = e.message; toast(e.message); }
  finally { event.target.value = ''; }
});
function resetAssetPage() { state.visibleAssetRows = ASSET_PAGE_SIZE; renderAssets(); }
$('filterAsset').addEventListener('input', resetAssetPage); $('typeFilter').addEventListener('change', resetAssetPage);
$('moreAssets').addEventListener('click', () => { state.visibleAssetRows += ASSET_PAGE_SIZE; renderAssets(); });
$('publishGroup').addEventListener('change', () => $('groupField').classList.toggle('hidden', !$('publishGroup').checked));
$('stopAuto').addEventListener('click', () => { state.stopRequested = true; $('autoProgress').textContent = 'Stopping after the current asset request…'; });
$('refreshBackground').addEventListener('click', refreshBackground);
$('cancelBackground').addEventListener('click', async()=>{
  if(!state.backgroundJob||!state.user?.loggedIn)return;
  if(!confirm('Cancel remaining queued uploads? Already submitted Roblox operations may still complete.'))return;
  try{await api(`/api/background/jobs/${state.backgroundJob}/cancel`,{method:'POST',headers:{'x-alex-csrf':state.user.csrf}});await refreshBackground();}
  catch(e){toast(e.message);}
});
$('resumeBackground').addEventListener('click', async()=>{
  if(!state.backgroundJob||!state.user?.loggedIn)return;
  try{await api(`/api/background/jobs/${state.backgroundJob}/resume`,{method:'POST',headers:{'x-alex-csrf':state.user.csrf}});await refreshBackground();}
  catch(e){toast(e.message);}
});
setInterval(()=>{if(state.backgroundJob && state.user?.loggedIn)refreshBackground();},12000);

$('copyMapping').addEventListener('click', downloadFixedPlace); $('copyMappingTop').addEventListener('click', downloadFixedPlace); $('downloadFixed').addEventListener('click', downloadFixedPlace);

// Restore authentication independently from saved scan rendering. If a local
// scan is malformed, it must not prevent the Roblox login UI from initializing.
Promise.all([api('/api/config'), api('/api/me')]).then(([config, me]) => {
  state.config = config; state.user = me; renderAuth();
  $('backgroundMode').disabled = !config.backgroundReady;
  $('backgroundAvailability').textContent = config.backgroundReady
    ? 'Railway worker ready. Your browser can close after a job is accepted.'
    : 'Background unavailable: attach a Railway Volume to this service, then redeploy Node 22+.';
  if(me.loggedIn) refreshBackground();
}).catch(err => { $('oauthStatus').textContent = `Service unavailable: ${err.message}`; $('oauthPill').textContent = 'OFFLINE'; toast('Could not contact the ALEX backend.'); });
loadSaved();
try { render(); }
catch (error) { console.error('ALEX saved-scan display failed:', error); toast('Could not display the saved scan. Sign-in is still available.'); }
if (state.snapshotNotSaved) $('scanStatus').textContent = 'Your last scan was too large to keep in browser storage. Choose the same .rbxl again to restore the full asset list.';
