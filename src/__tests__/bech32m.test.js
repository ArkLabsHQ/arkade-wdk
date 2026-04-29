import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hex } from '@scure/base';
import { ArkAddress } from '@arkade-os/sdk';
import { arkAddressToPkScript, bech32mDecode, bech32mFromWords } from '../lib/bech32m.js';

/**
 * Build a deterministic Ark address using the SDK's encoder so the test can
 * cross-check our standalone decoder against the canonical implementation.
 */
function makeArkAddress(seed = 0x42) {
  const serverPubKey = new Uint8Array(32).fill(seed);
  const vtxoTaprootKey = new Uint8Array(32).map((_, i) => (seed + i) & 0xff);
  return {
    encoded: new ArkAddress(serverPubKey, vtxoTaprootKey, 'tark').encode(),
    serverPubKey,
    vtxoTaprootKey,
  };
}

describe('bech32m', () => {
  it('decodes an Ark address and matches the SDK pkScript', () => {
    const { encoded, vtxoTaprootKey } = makeArkAddress();
    const expectedPkScript = `5120${hex.encode(vtxoTaprootKey)}`;

    assert.equal(arkAddressToPkScript(encoded), expectedPkScript);
  });

  it('round-trips multiple seeds against the SDK', () => {
    for (const seed of [0x00, 0x01, 0x7f, 0x80, 0xff]) {
      const { encoded, vtxoTaprootKey } = makeArkAddress(seed);
      const expected = `5120${hex.encode(vtxoTaprootKey)}`;
      assert.equal(arkAddressToPkScript(encoded), expected, `seed=${seed}`);
    }
  });

  it('decoded payload contains version + serverPubKey + vtxoTaprootKey', () => {
    const { encoded, serverPubKey, vtxoTaprootKey } = makeArkAddress(0x33);
    const { words } = bech32mDecode(encoded);
    const bytes = bech32mFromWords(words);

    assert.equal(bytes.length, 65, 'payload is 1 + 32 + 32 bytes');
    assert.equal(bytes[0], 0, 'default version is 0');
    assert.deepEqual(Uint8Array.from(bytes.slice(1, 33)), serverPubKey);
    assert.deepEqual(Uint8Array.from(bytes.slice(33, 65)), vtxoTaprootKey);
  });

  it('rejects an address with a corrupted checksum', () => {
    const { encoded } = makeArkAddress();
    // Flip the final character to something else in the bech32m alphabet.
    const last = encoded[encoded.length - 1];
    const flipped = last === 'q' ? 'p' : 'q';
    const corrupted = encoded.slice(0, -1) + flipped;

    assert.throws(() => arkAddressToPkScript(corrupted), /checksum mismatch/);
  });

  it('rejects an address containing invalid bech32m characters', () => {
    const { encoded } = makeArkAddress();
    // 'b' is not in the bech32m charset.
    const corrupted = encoded.slice(0, -1) + 'b';

    assert.throws(() => arkAddressToPkScript(corrupted), /invalid bech32m character/);
  });

  it('rejects an address with no separator', () => {
    assert.throws(() => arkAddressToPkScript('noseparatorhere'), /invalid bech32m structure/);
  });
});
