// Reference-only imports. No file content or asset media leaves this browser.
const MEDIA_PROPERTIES = {
  Animation: ['AnimationId'],
  Sound: ['SoundId'],
  AudioPlayer: ['Asset', 'AssetId'],
};

export function extractMediaReferencesFromScript(source) {
  const references = [];
  const explicit = /(SoundId|AnimationId)\s*=\s*['"]?(?:rbxassetid:\/\/|https?:\/\/www\.roblox\.com\/asset\/\?id=)(\d{1,20})/gi;
  for (const match of String(source).matchAll(explicit)) {
    references.push({ className: match[1].toLowerCase() === 'soundid' ? 'Sound' : 'Animation', assetId: match[2] });
  }
  return references;
}

function assetId(value) {
  const source = String(value ?? '').trim();
  const match = source.match(/^rbxassetid:\/\/(\d{1,20})$/i)
    || source.match(/^\d{1,20}$/)
    || source.match(/[?&]id=(\d{1,20})(?:\D|$)/i);
  return match ? (match[1] || match[0]) : null;
}

function parseCsvRows(source) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quotation mark.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvToManifest(raw) {
  const rows = parseCsvRows(raw);
  if (!rows.length) throw new Error('CSV is empty.');
  const headers = rows.shift().map(x => x.replace(/^\uFEFF/, '').toLowerCase().replace(/[\s_-]+/g, ''));
  const index = (...names) => headers.findIndex(x => names.includes(x));
  const idColumn = index('assetid', 'id', 'robloxid');
  const typeColumn = index('type', 'assettype', 'classname', 'class');
  const nameColumn = index('name', 'assetname', 'displayname', 'filename');
  const pathColumn = index('path', 'fullpath');
  if (idColumn < 0 || typeColumn < 0) throw new Error('CSV needs assetId and type columns (Animation or Sound/Audio).');
  const items = rows.map((row, i) => ({
    assetId: assetId(row[idColumn]),
    className: String(row[typeColumn] || '').trim(),
    name: row[nameColumn] || `Imported asset ${i + 1}`,
    path: row[pathColumn] || row[nameColumn] || `CSV row ${i + 2}`,
  })).filter(x => x.assetId);
  return { items };
}

function xmlToManifest(raw) {
  if (typeof DOMParser === 'undefined') throw new Error('Roblox XML files can only be imported in a browser.');
  const xml = new DOMParser().parseFromString(raw, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length || xml.documentElement?.localName !== 'roblox') {
    throw new Error('This is not a valid Roblox XML model/place (.rbxmx or .rbxlx).');
  }
  const items = [];
  const ownProperties = item => [...item.children].find(x => x.localName === 'Properties');
  const propertyText = (props, key) => [...(props?.children || [])].find(x => x.getAttribute('name') === key)?.textContent?.trim() || '';
  const fullPath = item => {
    const sections = [];
    let current = item;
    while (current && current.localName === 'Item') {
      const props = ownProperties(current);
      sections.unshift(propertyText(props, 'Name') || current.getAttribute('class') || 'Item');
      let parent = current.parentElement;
      while (parent && parent.localName !== 'Item') parent = parent.parentElement;
      current = parent;
    }
    return sections.join('.');
  };
  for (const item of xml.getElementsByTagName('Item')) {
    const className = item.getAttribute('class');
    const keys = MEDIA_PROPERTIES[className];
    const script = ['Script', 'LocalScript', 'ModuleScript'].includes(className);
    const valueObject = ['StringValue', 'IntValue', 'NumberValue'].includes(className);
    if (!keys && !script && !valueObject) continue;
    const props = ownProperties(item);
    if (!props) continue;
    const name = propertyText(props, 'Name') || className;
    const path = fullPath(item);
    if (keys) {
      for (const prop of props.children) {
        const property = prop.getAttribute('name');
        if (!keys.includes(property)) continue;
        const id = assetId(prop.textContent);
        if (!id) continue;
        items.push({ className, name, property, assetId: id, path, source: 'Instance' });
      }
    } else if (script) {
      const source = propertyText(props, 'Source');
      for (const ref of extractMediaReferencesFromScript(source)) {
        items.push({ ...ref, name, property: 'Source (read only)', path, source: 'Script' });
      }
    } else if (valueObject) {
      const id = assetId(propertyText(props, 'Value'));
      const location = path.toLowerCase();
      const type = /sound|audio/.test(location) ? 'Sound' : /anim/.test(location) ? 'Animation' : null;
      if (id && type) items.push({ className: type, name, property: 'Value (read only)', assetId: id, path, source: 'Value' });
    }
  }
  return { items };
}

export function parseImport(raw, filename = '') {
  const name = String(filename).toLowerCase();
  const source = String(raw).trim();
  if (!source) throw new Error('The scan file is empty.');
  if (/\.(rbxmx|rbxlx)$/.test(name) || /^<\?xml\b|^<roblox\b/i.test(source)) return xmlToManifest(source);
  if (/\.csv$/.test(name)) return csvToManifest(source);
  let doc;
  try { doc = JSON.parse(source); }
  catch { throw new Error('Use Studio JSON, a CSV with assetId/type columns, or a Roblox XML model/place file.'); }
  if (Array.isArray(doc)) return { items: doc };
  if (doc && Array.isArray(doc.assets) && !Array.isArray(doc.items)) return { ...doc, items: doc.assets };
  return doc;
}

export function normalizeReferenceId(value) { return assetId(value); }
