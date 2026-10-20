import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RBXL_SIGNATURE, scanBinaryPlace, rewriteBinaryPlace } from '../public/rbxl-reader.js';

const enc = new TextEncoder();
const u32 = number => [number & 255, (number >>> 8) & 255, (number >>> 16) & 255, (number >>> 24) & 255];
const string = value => [...u32(enc.encode(value).length), ...enc.encode(value)];
const word = value => [...enc.encode(value)];
const refArray = ids => {
  let previous = 0;
  const zigzags = ids.map(id => {
    const difference = id - previous;
    previous = id;
    return ((difference << 1) ^ (difference >> 31)) >>> 0;
  });
  const bytes = [];
  for (let shift = 24; shift >= 0; shift -= 8) for (const number of zigzags) bytes.push((number >>> shift) & 255);
  return bytes;
};
const lz4LiteralOnly = input => {
  const result = [Math.min(15, input.length) << 4];
  if (input.length >= 15) {
    let remaining = input.length - 15;
    while (remaining >= 255) { result.push(255); remaining -= 255; }
    result.push(remaining);
  }
  result.push(...input);
  return result;
};
// Zstandard-compressed SoundId PROP chunk produced from the fixture content.
const zstdSoundProperty = Array.from(Buffer.from('KLUv/SAqUQEABwAAAAcAAABTb3VuZElkARYAAAByYnhhc3NldGlkOi8vMTIzNDU2Nzg5', 'base64'));
const chunk = (name, content, compressed = false) => {
  const stored = compressed === 'zstd' ? zstdSoundProperty : compressed ? lz4LiteralOnly(content) : content;
  return [...word(name), ...u32(compressed ? stored.length : 0), ...u32(content.length), ...[0, 0, 0, 0], ...stored];
};

function samplePlace(compressed = false, zstdSound = false) {
  const inst = [...u32(7), ...string('Sound'), 0, ...u32(1), ...refArray([1])];
  const name = [...u32(7), ...string('Name'), 1, ...string('Theme')];
  const sound = [...u32(7), ...string('SoundId'), 1, ...string('rbxassetid://123456789')];
  const prnt = [0, ...u32(1), ...refArray([1]), ...refArray([-1])];
  return Uint8Array.from([
    ...RBXL_SIGNATURE, 0, 0, ...u32(1), ...u32(1), ...new Array(8).fill(0),
    ...chunk('INST', inst, compressed),
    ...chunk('PROP', name, compressed),
    ...chunk('PROP', sound, zstdSound ? 'zstd' : compressed),
    ...chunk('PRNT', prnt, compressed),
    ...chunk('END\0', word('</roblox>')),
  ]);
}

test('scans a real binary-format RBXL structure, including names and asset IDs', () => {
  const result = scanBinaryPlace(samplePlace().buffer);
  assert.equal(result.format, 'RBXL');
  assert.equal(result.totalInstances, 1);
  assert.deepEqual(result.items, [{
    name: 'Theme', path: 'Theme', className: 'Sound', property: 'SoundId',
    assetId: '123456789', source: 'Instance',
  }]);
});

test('decodes LZ4-compressed RBXL chunks', () => {
  const result = scanBinaryPlace(samplePlace(true).buffer);
  assert.equal(result.items[0].assetId, '123456789');
});

test('decodes modern Zstandard and mixed Zstandard/LZ4 RBXL chunks', () => {
  for (const lz4 of [false, true]) {
    const result = scanBinaryPlace(samplePlace(lz4, true).buffer);
    assert.equal(result.items[0].assetId, '123456789');
    assert.equal(result.items[0].path, 'Theme');
  }
});

test('rewrites LZ4 and Zstandard property chunks and keeps source file untouched', () => {
  for (const zstd of [false, true]) {
    const original = samplePlace(true, zstd);
    const inputSnapshot = Uint8Array.from(original);
    const updated = rewriteBinaryPlace(original.buffer, { 123456789: '987654321' });
    assert.equal(updated.changedProperties, 1);
    assert.equal(updated.replacedReferences, 1);
    assert.deepEqual(updated.changedAssetIds, ['123456789']);
    assert.equal(scanBinaryPlace(updated.buffer).items[0].assetId, '987654321');
    assert.deepEqual(original, inputSnapshot, 'original game bytes must not change');
  }
});

test('does not rewrite unrelated properties or numbers without an exact asset match', () => {
  const original = samplePlace(true, true);
  const rebuilt = rewriteBinaryPlace(original.buffer, { 12345678: '999', 777: '888' });
  assert.equal(rebuilt.replacedReferences, 0);
  assert.deepEqual(new Uint8Array(rebuilt.buffer), original, 'no matching IDs should preserve all input bytes');
});

test('replaces recognized asset URLs in script source without modifying other numbers', () => {
  const inst = [...u32(3), ...string('Script'), 0, ...u32(1), ...refArray([1])];
  const name = [...u32(3), ...string('Name'), 1, ...string('Logic')];
  const lua = 's.SoundId="rbxassetid://123456789"; print(123456789); a.AnimationId="123456789"';
  const source = [...u32(3), ...string('Source'), 1, ...string(lua)];
  const prnt = [0, ...u32(1), ...refArray([1]), ...refArray([-1])];
  const bytes = Uint8Array.from([
    ...RBXL_SIGNATURE, 0, 0, ...u32(1), ...u32(1), ...new Array(8).fill(0),
    ...chunk('INST', inst), ...chunk('PROP', name), ...chunk('PROP', source),
    ...chunk('PRNT', prnt), ...chunk('END\0', word('</roblox>')),
  ]);
  const updated = rewriteBinaryPlace(bytes.buffer, { 123456789: '999888777' });
  const before = scanBinaryPlace(bytes.buffer).items;
  const after = scanBinaryPlace(updated.buffer).items;
  assert.equal(before.length, 1, 'original scanner only recognizes URI-typed script IDs');
  assert.equal(after[0].assetId, '999888777');
  // The incidental print value is untouched in the rebuilt binary.
  assert.equal(Buffer.from(updated.buffer).includes(Buffer.from('print(123456789)')), true);
  assert.equal(Buffer.from(updated.buffer).includes(Buffer.from('a.AnimationId="999888777"')), true);
});

test('scans and rewrites mesh and image IDs in the same RBXL place', () => {
  const inst = [...u32(11), ...string('MeshPart'), 0, ...u32(1), ...refArray([1])];
  const name = [...u32(11), ...string('Name'), 1, ...string('CustomMesh')];
  const mesh = [...u32(11), ...string('MeshId'), 1, ...string('rbxassetid://220011')];
  const texture = [...u32(11), ...string('TextureID'), 1, ...string('rbxassetid://330022')];
  const prnt = [0, ...u32(1), ...refArray([1]), ...refArray([-1])];
  const bytes = Uint8Array.from([
    ...RBXL_SIGNATURE, 0, 0, ...u32(1), ...u32(1), ...new Array(8).fill(0),
    ...chunk('INST', inst, true), ...chunk('PROP', name), ...chunk('PROP', mesh, true),
    ...chunk('PROP', texture, true), ...chunk('PRNT', prnt), ...chunk('END\0', word('</roblox>')),
  ]);
  assert.deepEqual(scanBinaryPlace(bytes.buffer).items.map(x => [x.property, x.assetId]), [
    ['MeshId', '220011'], ['TextureID', '330022'],
  ]);
  const rebuilt = rewriteBinaryPlace(bytes.buffer, { 220011: '990011', 330022: '880022' });
  assert.equal(rebuilt.replacedReferences, 2);
  assert.deepEqual(scanBinaryPlace(rebuilt.buffer).items.map(x => x.assetId), ['990011', '880022']);
});

test('recognizes Content.fromAssetId without rewriting unrelated script numbers', () => {
  const inst = [...u32(3), ...string('LocalScript'), 0, ...u32(1), ...refArray([1])];
  const source = [...u32(3), ...string('Source'), 1, ...string('local image = Content.fromAssetId(771144)\nprint(771144)')];
  const prnt = [0, ...u32(1), ...refArray([1]), ...refArray([-1])];
  const bytes = Uint8Array.from([
    ...RBXL_SIGNATURE, 0, 0, ...u32(1), ...u32(1), ...new Array(8).fill(0),
    ...chunk('INST', inst), ...chunk('PROP', source), ...chunk('PRNT', prnt),
    ...chunk('END\0', word('</roblox>')),
  ]);
  assert.equal(scanBinaryPlace(bytes.buffer).items[0].assetId, '771144');
  const rebuilt = rewriteBinaryPlace(bytes.buffer, { 771144: '991177' });
  assert.equal(Buffer.from(rebuilt.buffer).includes(Buffer.from('Content.fromAssetId(991177)')), true);
  assert.equal(Buffer.from(rebuilt.buffer).includes(Buffer.from('print(771144)')), true);
});

test('refuses non-RBXL data and truncated RBXL chunks', () => {
  assert.throws(() => scanBinaryPlace(enc.encode('hello').buffer), /not a binary Roblox/);
  const truncated = samplePlace().subarray(0, 60);
  assert.throws(() => scanBinaryPlace(truncated.buffer.slice(0, truncated.length)), /incomplete|missing/);
});
