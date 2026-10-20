// Read-only Roblox binary place (.rbxl) media reference scanner.
// Decodes the instance/property/parent chunks needed to locate asset IDs.
// The original place is never changed or uploaded.

import { decompress as decompressZstd } from '../node_modules/fzstd/esm/index.mjs';

const SIGNATURE = [0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a];
const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

class Reader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      throw new Error('The RBXL file is incomplete or has invalid lengths.');
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  u8() { const n = this.take(1); return n[0]; }
  u16() { const start = this.offset; this.take(2); return this.view.getUint16(start, true); }
  u32() { const start = this.offset; this.take(4); return this.view.getUint32(start, true); }
  i32() { const start = this.offset; this.take(4); return this.view.getInt32(start, true); }
  fixedText(length) { return textDecoder.decode(this.take(length)); }
  string() { const n = this.u32(); if (n > 20_000_000) throw new Error('RBXL property string is too large.'); return this.fixedText(n); }
  integers(count, difference = false) {
    if (count > 2_000_000) throw new Error('Too many instances in this RBXL file.');
    const data = this.take(count * 4);
    const result = new Array(count);
    let previous = 0;
    for (let i = 0; i < count; i++) {
      const number = ((data[i] << 24) | (data[count + i] << 16) | (data[2 * count + i] << 8) | data[3 * count + i]) >>> 0;
      let value = (number >>> 1) ^ -(number & 1);
      if (difference) { value = (previous + value) | 0; previous = value; }
      result[i] = value;
    }
    return result;
  }
}

function decompressLz4(source, expected) {
  if (expected > 64_000_000) throw new Error('An RBXL chunk is too large to process safely.');
  const dest = new Uint8Array(expected);
  let input = 0, output = 0;
  while (input < source.length) {
    const token = source[input++];
    let literal = token >>> 4;
    if (literal === 15) {
      let add;
      do { if (input >= source.length) throw new Error('Truncated LZ4 data.'); add = source[input++]; literal += add; } while (add === 255);
    }
    if (input + literal > source.length || output + literal > expected) throw new Error('Invalid LZ4 literal length.');
    dest.set(source.subarray(input, input + literal), output);
    input += literal; output += literal;
    if (input === source.length) break;
    if (input + 2 > source.length) throw new Error('Truncated LZ4 match.');
    const offset = source[input++] | (source[input++] << 8);
    if (!offset || offset > output) throw new Error('Invalid LZ4 match offset.');
    let length = (token & 15) + 4;
    if ((token & 15) === 15) {
      let add;
      do { if (input >= source.length) throw new Error('Truncated LZ4 length.'); add = source[input++]; length += add; } while (add === 255);
    }
    if (output + length > expected) throw new Error('Invalid LZ4 match length.');
    for (let j = 0; j < length; j++) dest[output + j] = dest[output + j - offset];
    output += length;
  }
  if (output !== expected) throw new Error('RBXL chunk decompression failed.');
  return dest;
}

function decompressChunk(source, expected) {
  // Modern Studio files can mix LZ4 blocks and Zstandard frames in one RBXL.
  // The first four bytes of a Zstandard frame are its fixed magic number.
  const isZstd = source.length >= 4
    && source[0] === 0x28 && source[1] === 0xb5
    && source[2] === 0x2f && source[3] === 0xfd;
  if (!isZstd) return decompressLz4(source, expected);
  if (expected > 64_000_000) throw new Error('An RBXL chunk is too large to process safely.');
  try {
    const result = decompressZstd(source, new Uint8Array(expected));
    if (result.length !== expected) throw new Error('Unexpected decoded size.');
    return result;
  } catch {
    throw new Error('Could not decompress a Zstandard RBXL chunk. The file may be damaged or unsupported.');
  }
}

function idFromProperty(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/^rbxassetid:\/\/(\d{1,20})$/i)
    || text.match(/[?&]id=(\d{1,20})(?:\D|$)/i)
    || text.match(/^(\d{1,20})$/);
  return match ? (match[1] || match[0]) : null;
}

const ASSET_PROPERTIES = new Set([
  'SoundId', 'AnimationId', 'Asset', 'AssetId', 'MeshId', 'TextureID', 'TextureId',
  'Texture', 'Image', 'Video', 'Graphic', 'ShirtTemplate', 'PantsTemplate',
  'ColorMap', 'NormalMap', 'MetalnessMap', 'RoughnessMap', 'ColorMapContent',
  'NormalMapContent', 'MetalnessMapContent', 'RoughnessMapContent',
  'SkyboxBk', 'SkyboxDn', 'SkyboxFt', 'SkyboxLf', 'SkyboxRt', 'SkyboxUp',
  'SunTextureId', 'MoonTextureId', 'Face', 'Value', 'Source',
]);
const STRING_PROPERTIES = new Set(['Name', ...ASSET_PROPERTIES]);

function assetClass(property, className, path = '') {
  if (property === 'SoundId' || className === 'AudioPlayer') return 'Sound';
  if (property === 'AnimationId') return 'Animation';
  if (property === 'MeshId') return 'MeshPart';
  if (property === 'Video') return 'VideoFrame';
  if (property === 'Value') {
    if (/sound|audio/i.test(path)) return 'Sound';
    if (/anim/i.test(path)) return 'Animation';
    return 'UnknownAsset';
  }
  if (/Texture|Image|Map|Skybox|Graphic|Face/i.test(property)) return 'Decal';
  return className;
}

function scriptReferences(source) {
  const result = [];
  const value = String(source);
  const known = /(SoundId|AnimationId|MeshId|TextureID|Image|Video|Asset|ColorMap|NormalMap|MetalnessMap|RoughnessMap)\s*=\s*['"]?(?:rbxassetid:\/\/|https?:\/\/(?:www\.)?roblox\.com\/asset\/\?id=)(\d{1,20})/gi;
  const seen = new Set();
  for (const match of value.matchAll(known)) {
    seen.add(match[2]);
    result.push({ className: assetClass(match[1], 'UnknownAsset'), assetId: match[2] });
  }
  const urls = /rbxassetid:\/\/(\d{1,20})|https?:\/\/(?:www\.)?roblox\.com\/asset\/\?id=(\d{1,20})|Content\.fromAssetId\(\s*(\d{1,20})\s*\)/gi;
  for (const match of value.matchAll(urls)) {
    const assetId = match[1] || match[2] || match[3];
    if (!seen.has(assetId)) {
      result.push({ className: 'UnknownAsset', assetId });
      seen.add(assetId);
    }
  }
  return result;
}

export function scanBinaryPlace(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 32 || !SIGNATURE.every((b, i) => bytes[i] === b)) {
    throw new Error('This is not a binary Roblox .rbxl place. In Studio, use File → Save to File (.rbxl).');
  }
  const reader = new Reader(bytes);
  reader.take(SIGNATURE.length);
  if (reader.u16() !== 0) throw new Error('Unsupported RBXL format version.');
  const classCount = reader.u32(), instanceCount = reader.u32();
  reader.take(8);
  if (classCount > 10_000 || instanceCount > 2_000_000) throw new Error('This RBXL file exceeds the safe scanner limit.');

  const classes = new Map();
  const instances = new Map();
  let sawEnd = false;
  for (let chunkNumber = 0; reader.offset < bytes.length && chunkNumber < 500_000; chunkNumber++) {
    const kind = reader.fixedText(4);
    const compressedSize = reader.u32();
    const uncompressedSize = reader.u32();
    reader.take(4);
    if (compressedSize > 80_000_000 || uncompressedSize > 64_000_000) throw new Error('RBXL chunk is too large.');
    const chunkBytes = compressedSize
      ? decompressChunk(reader.take(compressedSize), uncompressedSize)
      : reader.take(uncompressedSize);
    if (kind === 'END\0' || kind === 'END.') { sawEnd = true; break; }
    if (kind !== 'INST' && kind !== 'PROP' && kind !== 'PRNT') continue;
    const chunk = new Reader(chunkBytes);
    if (kind === 'INST') {
      const classId = chunk.i32();
      const className = chunk.string();
      const hasService = chunk.u8();
      const count = chunk.u32();
      const ids = chunk.integers(count, true);
      if (hasService) chunk.take(count);
      classes.set(classId, { className, ids });
      for (const id of ids) instances.set(id, { className, properties: {}, parentId: -1 });
    } else if (kind === 'PROP') {
      const classId = chunk.i32();
      const name = chunk.string();
      const classGroup = classes.get(classId);
      if (!classGroup || !STRING_PROPERTIES.has(name)) continue;
      const typeId = chunk.u8();
      let values;
      if (typeId === 1) {
        values = classGroup.ids.map(() => chunk.string());
      } else if (typeId === 3 && name === 'Value') {
        values = chunk.integers(classGroup.ids.length).map(String);
      } else continue;
      classGroup.ids.forEach((id, i) => { const instance = instances.get(id); if (instance) instance.properties[name] = values[i]; });
    } else if (kind === 'PRNT') {
      chunk.u8();
      const count = chunk.u32();
      const children = chunk.integers(count, true);
      const parents = chunk.integers(count, true);
      children.forEach((id, i) => { const instance = instances.get(id); if (instance) instance.parentId = parents[i]; });
    }
  }
  if (!sawEnd) throw new Error('The RBXL file is missing its closing chunk.');

  const pathCache = new Map();
  function pathFor(id, ancestors = new Set()) {
    if (pathCache.has(id)) return pathCache.get(id);
    const instance = instances.get(id);
    if (!instance) return '';
    const name = instance.properties.Name || instance.className;
    if (ancestors.has(id) || ancestors.size > 100) return name;
    ancestors.add(id);
    const parent = pathFor(instance.parentId, ancestors);
    ancestors.delete(id);
    const path = parent ? `${parent}.${name}` : name;
    pathCache.set(id, path);
    return path;
  }

  const items = [];
  const append = (instance, id, property, assetId, className = instance.className, source = 'Instance') => {
    if (!assetId || assetId === '0') return;
    items.push({ name: instance.properties.Name || instance.className, path: pathFor(id), className, property, assetId, source });
  };
  for (const [id, instance] of instances) {
    const props = instance.properties;
    for (const property of ASSET_PROPERTIES) {
      if (property === 'Source' || props[property] === undefined) continue;
      const assetId = idFromProperty(props[property]);
      if (!assetId) continue;
      if (property === 'Value' && !['StringValue', 'IntValue', 'NumberValue'].includes(instance.className)) continue;
      append(instance, id, property, assetId, assetClass(property, instance.className, pathFor(id)), property === 'Value' ? 'Value' : 'Instance');
    }
    if (['Script', 'ModuleScript', 'LocalScript'].includes(instance.className) && props.Source) {
      for (const ref of scriptReferences(props.Source)) append(instance, id, 'Source (read only)', ref.assetId, ref.className, 'Script');
    }
  }
  return { items, format: 'RBXL', totalInstances: instances.size };
}

function bytesWithLength(value) {
  const body = textEncoder.encode(value);
  if (body.length > 20_000_000) throw new Error('A replacement RBXL string is too large.');
  const bytes = new Uint8Array(body.length + 4);
  new DataView(bytes.buffer).setUint32(0, body.length, true);
  bytes.set(body, 4);
  return bytes;
}

function combine(chunks) {
  const length = chunks.reduce((sum, part) => sum + part.length, 0);
  if (length > 300_000_000) throw new Error('The rebuilt RBXL would be too large.');
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function rewriteMediaString(value, property, mapping) {
  let replacements = 0;
  const swap = (whole, id) => {
    const next = mapping.get(id);
    if (!next || next === id) return whole;
    replacements++;
    return whole.replace(id, next);
  };
  // In scripts, replace explicit asset references; never rewrite unrelated numbers.
  let changed = value.replace(/rbxassetid:\/\/(\d{1,20})(?!\d)/gi, swap)
    .replace(/https?:\/\/(?:www\.)?roblox\.com\/asset\/\?id=(\d{1,20})(?!\d)/gi, swap);
  if (property === 'Source') {
    changed = changed.replace(/((?:SoundId|AnimationId)\s*=\s*['"])(\d{1,20})(['"])/gi, (whole, before, id, after) => {
      const next = mapping.get(id);
      if (!next || next === id) return whole;
      replacements++;
      return `${before}${next}${after}`;
    });
    changed = changed.replace(/(Content\.fromAssetId\(\s*)(\d{1,20})(\s*\))/gi, (whole, before, id, after) => {
      const next = mapping.get(id);
      if (!next || next === id) return whole;
      replacements++;
      return `${before}${next}${after}`;
    });
  } else if (/^\d{1,20}$/.test(changed)) {
    const next = mapping.get(changed);
    if (next && next !== changed) { changed = next; replacements++; }
  }
  return { value: changed, replacements };
}

const REWRITE_PROPERTIES = ASSET_PROPERTIES;

/**
 * Return a new, Studio-openable binary place with selected asset references
 * rewritten. Unknown chunks and unmodified property bytes are preserved.
 * Rewritten property chunks are stored uncompressed, a valid RBXL encoding.
 */
export function rewriteBinaryPlace(arrayBuffer, idMapping) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 32 || !SIGNATURE.every((b, i) => bytes[i] === b)) {
    throw new Error('Choose an original binary .rbxl file to rebuild.');
  }
  const mapping = new Map(Object.entries(idMapping || {}).filter(([oldId, newId]) =>
    /^\d{1,20}$/.test(oldId) && /^\d{1,20}$/.test(String(newId)) && String(newId) !== oldId)
    .map(([oldId, newId]) => [oldId, String(newId)]));
  const reader = new Reader(bytes);
  reader.take(SIGNATURE.length);
  if (reader.u16() !== 0) throw new Error('Unsupported RBXL format version.');
  const classCount = reader.u32(), instanceCount = reader.u32();
  reader.take(8);
  if (classCount > 10_000 || instanceCount > 2_000_000) throw new Error('RBXL is larger than the safe limit.');
  const output = [bytes.subarray(0, reader.offset)];
  const counts = new Map();
  let changedProperties = 0, replacedReferences = 0, ended = false;
  const changedIds = new Set();

  for (let chunkNumber = 0; reader.offset < bytes.length && chunkNumber < 500_000; chunkNumber++) {
    const from = reader.offset;
    const kind = reader.fixedText(4);
    const compressedSize = reader.u32(), uncompressedSize = reader.u32();
    reader.take(4);
    if (compressedSize > 80_000_000 || uncompressedSize > 64_000_000) throw new Error('RBXL chunk is too large.');
    const data = compressedSize ? decompressChunk(reader.take(compressedSize), uncompressedSize) : reader.take(uncompressedSize);
    const original = bytes.subarray(from, reader.offset);
    if (kind === 'INST') {
      const inst = new Reader(data);
      const classId = inst.i32(); inst.string(); inst.u8();
      counts.set(classId, inst.u32());
    }
    if (kind !== 'PROP' || !mapping.size) {
      output.push(original);
    } else {
      const prop = new Reader(data);
      const classId = prop.i32(), name = prop.string(), type = prop.u8();
      const count = counts.get(classId);
      if (type !== 1 || !REWRITE_PROPERTIES.has(name) || count === undefined) {
        output.push(original);
      } else {
        const prefix = data.subarray(0, prop.offset);
        const pieces = [prefix];
        let replacementsInChunk = 0;
        for (let i = 0; i < count; i++) {
          const stringFrom = prop.offset;
          const length = prop.u32();
          if (length > 20_000_000) throw new Error('RBXL contains a property string that is too large.');
          const value = textDecoder.decode(prop.take(length));
          const changed = rewriteMediaString(value, name, mapping);
          if (changed.replacements) {
            pieces.push(bytesWithLength(changed.value));
            replacementsInChunk += changed.replacements;
            for (const [oldId, newId] of mapping) if (value.includes(oldId) && changed.value.includes(newId)) changedIds.add(oldId);
          } else {
            pieces.push(data.subarray(stringFrom, prop.offset));
          }
        }
        // Preserve any future extension bytes on a string property.
        pieces.push(data.subarray(prop.offset));
        if (!replacementsInChunk) {
          output.push(original);
        } else {
          const decoded = combine(pieces);
          const header = Uint8Array.from(original.subarray(0, 16));
          const view = new DataView(header.buffer);
          view.setUint32(4, 0, true); // Uncompressed property payload.
          view.setUint32(8, decoded.length, true);
          output.push(header, decoded);
          changedProperties++;
          replacedReferences += replacementsInChunk;
        }
      }
    }
    if (kind === 'END\0' || kind === 'END.') { ended = true; break; }
  }
  if (!ended) throw new Error('The RBXL file is missing its closing chunk.');
  // Preserve bytes beyond END, if any, rather than silently discarding data.
  output.push(bytes.subarray(reader.offset));
  return { buffer: combine(output).buffer, changedProperties, replacedReferences, changedAssetIds: [...changedIds] };
}

// Exported for deterministic test fixtures; no file writes are performed.
export const RBXL_SIGNATURE = Uint8Array.from(SIGNATURE);
