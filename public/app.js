import { parseImport, normalizeReferenceId } from './scan-import.js';

const $ = id => document.getElementById(id);
const STORE = 'alex-reuploader-v1';
const state = { items: [], mapping: {}, scanCount: 0, insights: null, user: null, config: null };

function loadSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (Array.isArray(data.items)) state.items = data.items.filter(x => /^\d+$/.test(x.id)).slice(0, 10000);
    if (data.mapping && typeof data.mapping === 'object') {
      for (const [oldId, newId] of Object.entries(data.mapping)) if (/^\d+$/.test(oldId) && /^\d+$/.test(String(newId))) state.mapping[oldId] = String(newId);
    }
    state.scanCount = Number(data.scanCount) || 0;
    if (data.insights && typeof data.insights === 'object') state.insights = data.insights;
  } catch { /* Browser storage may be empty or inaccessible. */ }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ items: state.items, mapping: state.mapping, scanCount: state.scanCount, insights: state.insights })); } catch { toast('Could not save to this browser. Export your map now.'); }
}
function toast(message) {
  const target = $('toast'); target.textContent = message; target.classList.add('visible');
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => target.classList.remove('visible'), 4800);
}
function typeOf(item) {
  const kind = String(item.className || item.assetType || item.type || '').toLowerCase();
  if (kind === 'animation') return 'Animation';
  if (kind === 'sound' || kind === 'audio' || kind === 'audioplayer') return 'Audio';
  if (['MeshPart', 'SpecialMesh'].includes(item.className) && /mesh/i.test(item.property)) return 'Manual';
  if (['MeshPart', 'SpecialMesh'].includes(item.className)) return 'Decal';
  if (item.className === 'VideoFrame') return 'Manual';
  if (item.className === 'SurfaceAppearance' || /image/i.test(item.className)) return 'Image';
  return 'Decal';
}
function parseScan(raw, filename = '') {
  const doc = parseImport(raw, filename);
  if (!doc || !Array.isArray(doc.items)) throw new Error('Expected a scan with an "items" array.');
  if (doc.items.length > 30000) throw new Error('Scan is too large (maximum 30,000 references). Select a smaller section in Studio.');
  const byId = new Map();
  const byLocation = new Map();
  const insights = { audio: 0, animation: 0, scripts: 0, values: 0, locations: [] };
  for (const rawItem of doc.items) {
    if (!rawItem) continue;
    const id = normalizeReferenceId(rawItem.assetId ?? rawItem.id ?? rawItem.asset_id);
    if (!id || id === '0') continue;
    const name = String(rawItem.name || 'Unnamed asset').slice(0, 150);
    const path = String(rawItem.path || name).slice(0, 500);
    const type = typeOf(rawItem);
    if (type === 'Audio') insights.audio++;
    if (type === 'Animation') insights.animation++;
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
    if (byId.get(id).type === 'Manual' && type !== 'Manual') byId.get(id).type = type;
  }
  if (doc.items.length && byId.size === 0) throw new Error('The scan has no valid Roblox asset IDs.');
  insights.locations = [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 350);
  state.items = [...byId.values()]; state.scanCount = doc.items.length; state.insights = insights;
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
function selectedType() {
  const selected = state.items.find(x => x.id === $('targetAsset').value);
  if (selected && selected.type !== 'Manual') $('uploadType').value = selected.type;
  if (selected) $('displayName').value = `${selected.name}`.slice(0, 50);
}
function renderAssets() {
  const filter = $('filterAsset').value.trim().toLowerCase();
  const type = $('typeFilter').value;
  const listed = state.items.filter(item => (type === 'all' || item.type === type || (type === 'Decal' && item.type === 'Image')) && (item.id.includes(filter) || item.name.toLowerCase().includes(filter) || item.path.toLowerCase().includes(filter)));
  const tbody = $('assetTable'); tbody.replaceChildren();
  $('assetsEmpty').classList.toggle('hidden', listed.length > 0);
  for (const item of listed) {
    const tr = node('tr');
    const name = node('td'); name.append(node('strong', '', item.name), node('small', '', `${item.path} • ${item.id}`));
    const kind = node('td'); kind.append(node('span', `type-tag ${item.type.toLowerCase()}`, item.type === 'Manual' ? 'Manual only' : item.type));
    const refs = node('td', '', String(item.refs));
    const newId = node('td'); const mapped = state.mapping[item.id]; newId.append(node('code', '', mapped || '—'));
    const actions = node('td');
    const button = node('button', 'link-action', item.type === 'Manual' ? 'Studio only' : mapped ? 'Reupload ↗' : 'Upload ↗');
    button.disabled = item.type === 'Manual';
    button.addEventListener('click', () => { $('targetAsset').value = item.id; selectedType(); show('uploads'); });
    actions.append(button); tr.append(name, kind, refs, newId, actions); tbody.append(tr);
  }
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
  const selection = $('targetAsset').value;
  $('targetAsset').replaceChildren(node('option', '', state.items.length ? 'Select one detected ID…' : 'Import a Studio scan first'));
  $('targetAsset').firstChild.value = '';
  for (const item of state.items.filter(x => x.type !== 'Manual')) {
    const opt = node('option', '', `${item.name} • ${item.id}`); opt.value = item.id; $('targetAsset').append(opt);
  }
  if (state.items.some(x => x.id === selection && x.type !== 'Manual')) $('targetAsset').value = selection;
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
    $('uploadFeedback').textContent = 'Ready to upload original media you have rights to.';
  } else {
    $('description').disabled = true;
    $('statTier').textContent = 'Guest';
    $('statAllowance').textContent = 'Sign in to unlock uploads';
    $('oauthStatus').textContent = state.config?.ready ? 'Configured — waiting for your Roblox sign-in' : 'Add Roblox OAuth credentials to your Railway service';
    $('oauthPill').textContent = state.config?.ready ? 'READY' : 'SETUP NEEDED';
    $('oauthPill').classList.toggle('online', !!state.config?.ready);
    $('loginBtn').addEventListener('click', event => { if (!state.config?.ready) { event.preventDefault(); toast('First add ROBLOX_OAUTH_CLIENT_ID, ROBLOX_OAUTH_CLIENT_SECRET and PUBLIC_BASE_URL to Railway Variables.'); } });
    $('uploadFeedback').textContent = 'Connect Roblox to start reuploading.';
  }
}
async function api(path, options) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function mapText() { return Object.entries(state.mapping).filter(([a, b]) => /^\d+$/.test(a) && /^\d+$/.test(b)).map(([a, b]) => `${a}=${b}`).join('\n'); }
async function copyMap() {
  const content = mapText();
  if (!content) return toast('No ID replacements yet. Upload at least one asset.');
  try { await navigator.clipboard.writeText(content); toast('Copied! Paste the old=new mapping into the Studio plugin.'); }
  catch {
    const field = node('textarea'); field.value = content; document.body.append(field); field.select();
    const done = document.execCommand('copy'); field.remove(); toast(done ? 'Copied the ID map.' : 'Clipboard unavailable in this browser.');
  }
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
async function upload(event) {
  event.preventDefault();
  if (!state.user?.loggedIn) return toast('Sign in with Roblox first.');
  const id = $('targetAsset').value;
  const file = $('assetFile').files[0];
  if (!id || !file) return toast('Select an asset and choose its original media file.');
  if (!$('confirmRights').checked) return toast('Please confirm you have permission to upload the file.');
  if (file.size > 20 * 1024 * 1024) return toast('File must be 20 MB or smaller.');
  const submit = $('uploadSubmit');
  submit.disabled = true; submit.textContent = 'Uploading…';
  const feedback = $('uploadFeedback'); feedback.className = 'inline-hint'; feedback.textContent = `Uploading ${file.name} to Roblox…`;
  try {
    const form = new FormData();
    form.set('file', file); form.set('oldId', id); form.set('assetType', $('uploadType').value); form.set('displayName', $('displayName').value);
    form.set('description', $('description').value);
    if ($('publishGroup').checked) form.set('groupId', $('groupId').value);
    const response = await api('/api/upload', { method: 'POST', headers: { 'x-alex-csrf': state.user.csrf }, body: form });
    feedback.textContent = 'Upload accepted! Waiting for Roblox asset processing…';
    const newId = await pollOperation(response.operation);
    state.mapping[id] = newId; save(); render();
    feedback.className = 'inline-hint success'; feedback.textContent = `Success! Roblox created asset ${newId}. Copy your map into Studio.`;
    $('assetFile').value = ''; $('fileTitle').textContent = 'Click to select an original file';
    toast(`Reuploaded! ${id} → ${newId}`);
    state.user = await api('/api/me'); renderAuth();
  } catch (error) { feedback.className = 'inline-hint error'; feedback.textContent = error.message; toast(error.message); }
  finally { submit.disabled = false; submit.textContent = 'Upload to Roblox ↗'; }
}

document.querySelectorAll('[data-screen]').forEach(b => b.addEventListener('click', () => show(b.dataset.screen)));
document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => show(b.dataset.goto)));
$('parseManifest').addEventListener('click', () => { try { toast(parseScan($('manifestInput').value)); } catch (e) { toast(e.message); } });
$('manifestFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 6_000_000) return toast('Scan is over 6 MB. Export a smaller selection.');
  try { const input = await file.text(); $('manifestInput').value = input; toast(parseScan(input, file.name)); } catch (e) { toast(e.message); }
  finally { event.target.value = ''; }
});
$('demoBtn').addEventListener('click', () => {
  const demo = { groupId: 548271796, items: [
    { path: 'Workspace.Music.MainTheme', name: 'MainTheme', className: 'Sound', property: 'SoundId', assetId: '123456789' },
    { path: 'Workspace.Music.Speaker', name: 'Speaker', className: 'Sound', property: 'SoundId', assetId: '123456789' },
    { path: 'ReplicatedStorage.Animations.Dance', name: 'Dance', className: 'Animation', property: 'AnimationId', assetId: '234567890' },
    { path: 'Workspace.Sign.Decal', name: 'Sign', className: 'Decal', property: 'Texture', assetId: '345678901' },
  ] };
  $('manifestInput').value = JSON.stringify(demo, null, 2); toast(parseScan($('manifestInput').value));
});
$('filterAsset').addEventListener('input', renderAssets); $('typeFilter').addEventListener('change', renderAssets);
$('targetAsset').addEventListener('change', selectedType);
$('publishGroup').addEventListener('change', () => $('groupField').classList.toggle('hidden', !$('publishGroup').checked));
$('assetFile').addEventListener('change', () => { const file = $('assetFile').files[0]; if (file) $('fileTitle').textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`; });
$('uploadForm').addEventListener('submit', upload);
$('copyMapping').addEventListener('click', copyMap); $('copyMappingTop').addEventListener('click', copyMap);

loadSaved(); render();
Promise.all([api('/api/config'), api('/api/me')]).then(([config, me]) => {
  state.config = config; state.user = me; renderAuth();
}).catch(err => { $('oauthStatus').textContent = `Service unavailable: ${err.message}`; $('oauthPill').textContent = 'OFFLINE'; toast('Could not contact the ALEX backend.'); });
