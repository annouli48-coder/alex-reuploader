// Read-only Roblox binary place (.rbxl) media reference scanner.
// Decodes the instance/property/parent chunks needed to locate asset IDs.
// The original place is never changed or uploaded.

import { decompress as decompressZstd } from '../node_modules/fzstd/esm/index.mjs';

const SIGNATURE = [0x3c, 0x72, 0x6f, 0x62, 0x6c, 0x6f, 0x78, 0x21, 0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a];
const textDecoder = new TextDecoder('utf-8');

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

function scriptReferences(source) {
  const result = [];
  const pattern = /(SoundId|AnimationId)\s*=\s*['"]?(?:rbxassetid:\/\/|https?:\/\/www\.roblox\.com\/asset\/\?id=)(\d{1,20})/gi;
  for (const match of String(source).matchAll(pattern)) {
    result.push({ className: match[1].toLowerCase() === 'soundid' ? 'Sound' : 'Animation', assetId: match[2] });
    if (result.length >= 300) break;
  }
  return result;
}

const STRING_PROPERTIES = new Set(['Name', 'SoundId', 'AnimationId', 'Asset', 'AssetId', 'Value', 'Source']);

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
    if (items.length >= 30_000) throw new Error('Over 30,000 media references. Scan a smaller place file.');
    items.push({ name: instance.properties.Name || instance.className, path: pathFor(id), className, property, assetId, source });
  };
  for (const [id, instance] of instances) {
    const props = instance.properties;
    if (instance.className === 'Sound') append(instance, id, 'SoundId', idFromProperty(props.SoundId));
    if (instance.className === 'Animation') append(instance, id, 'AnimationId', idFromProperty(props.AnimationId));
    if (instance.className === 'AudioPlayer') append(instance, id, 'Asset', idFromProperty(props.Asset || props.AssetId));
    if (['Script', 'ModuleScript', 'LocalScript'].includes(instance.className) && props.Source) {
      for (const ref of scriptReferences(props.Source)) append(instance, id, 'Source (read only)', ref.assetId, ref.className, 'Script');
    }
    if (['StringValue', 'IntValue', 'NumberValue'].includes(instance.className) && props.Value !== undefined) {
      const path = pathFor(id).toLowerCase();
      const type = /sound|audio/.test(path) ? 'Sound' : /anim/.test(path) ? 'Animation' : null;
      if (type) append(instance, id, 'Value (read only)', idFromProperty(props.Value), type, 'Value');
    }
  }
  return { items, format: 'RBXL', totalInstances: instances.size };
}

// Exported for deterministic test fixtures; no file writes are performed.
export const RBXL_SIGNATURE = Uint8Array.from(SIGNATURE);
