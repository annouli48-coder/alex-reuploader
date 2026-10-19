import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RBXL_SIGNATURE, scanBinaryPlace } from '../public/rbxl-reader.js';

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

test('refuses non-RBXL data and truncated RBXL chunks', () => {
  assert.throws(() => scanBinaryPlace(enc.encode('hello').buffer), /not a binary Roblox/);
  const truncated = samplePlace().subarray(0, 60);
  assert.throws(() => scanBinaryPlace(truncated.buffer.slice(0, truncated.length)), /incomplete|missing/);
});
