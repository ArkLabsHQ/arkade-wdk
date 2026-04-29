/**
 * Bech32m decoder for Ark addresses, returning the BTC pkScript that the Ark
 * indexer expects in its `scripts=` query parameter.
 *
 * This module exists primarily so the inline decoder shipped in the
 * `wdk-react-native-provider` patch (which can't pull in `@arkade-os/sdk` on
 * the RN JS thread) has a tested counterpart here. The two implementations
 * must stay in sync; tests in `src/__tests__/bech32m.test.js` cross-check
 * this implementation against `ArkAddress` from the SDK.
 *
 * Reference: BIP-350. Ark addresses encode 65 bytes:
 *   1 byte version || 32 bytes serverPubKey || 32 bytes vtxoTaprootKey
 * The pkScript is `OP_1 OP_PUSHBYTES_32 <vtxoTaprootKey>` = `5120 || hex(...)`.
 */
/* eslint-disable no-bitwise -- bech32m is bit-packed by definition */

const BECH32M_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

/**
 * @param {number[]} values
 * @returns {number}
 */
function bech32mPolymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

/**
 * @param {string} hrp
 * @returns {number[]}
 */
function bech32mHrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/**
 * @param {string} addr
 * @returns {{ hrp: string; words: number[] }}
 */
export function bech32mDecode(addr) {
  const lower = addr.toLowerCase();
  if (lower.length > 1023) throw new Error('Ark address too long');
  const sep = lower.lastIndexOf('1');
  if (sep < 1 || sep + 7 > lower.length) {
    throw new Error('Ark address: invalid bech32m structure');
  }
  const hrp = lower.substring(0, sep);
  const data = [];
  for (let i = sep + 1; i < lower.length; i++) {
    const idx = BECH32M_CHARSET.indexOf(lower.charAt(i));
    if (idx === -1) throw new Error('Ark address: invalid bech32m character');
    data.push(idx);
  }
  if (bech32mPolymod([...bech32mHrpExpand(hrp), ...data]) !== BECH32M_CONST) {
    throw new Error('Ark address: bech32m checksum mismatch');
  }
  return { hrp, words: data.slice(0, data.length - 6) };
}

/**
 * @param {number[]} words
 * @returns {number[]}
 */
export function bech32mFromWords(words) {
  let acc = 0;
  let bits = 0;
  const out = [];
  for (const v of words) {
    if (v < 0 || v > 31) throw new Error('Ark address: invalid 5-bit value');
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >>> bits) & 0xff);
    }
  }
  if (bits >= 5 || (acc << (8 - bits)) & 0xff) {
    throw new Error('Ark address: invalid bech32m padding');
  }
  return out;
}

/**
 * Decode an Ark address into the BTC pkScript that the Ark indexer expects in
 * its `scripts=` query parameter (lowercase hex).
 * @param {string} address
 * @returns {string}
 */
export function arkAddressToPkScript(address) {
  const { words } = bech32mDecode(address);
  const data = bech32mFromWords(words);
  if (data.length !== 65) {
    throw new Error(`Ark address: expected 65-byte payload (1+32+32), got ${data.length}`);
  }
  const vtxoTaprootKey = data.slice(33, 65);
  const hex = vtxoTaprootKey.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `5120${hex}`;
}
/* eslint-enable no-bitwise */
