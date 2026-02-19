import * as bip39 from 'bip39';

/**
 * Runtime-safe `WalletManager` base used by `@arkade-os/wdk`.
 *
 * Problem being fixed:
 * Importing `@tetherto/wdk-wallet` at runtime can resolve its `bare` export in
 * React Native worklet/bare bundling paths. That pulls extra bare runtime wiring
 * into this adapter bundle and can trigger unstable behavior (e.g. addon/runtime
 * resolution failures during wallet manager execution).
 *
 * Why this file exists:
 * We only need a small subset of the upstream `WalletManager` behavior for this
 * package (`seed` lifecycle + BIP-39 helpers). Keeping that subset local avoids
 * the runtime import, while preserving compatible method names/signatures.
 *
 * Important:
 * - Keep this class API-aligned with the upstream base for compatibility.
 * - Type-only imports from `@tetherto/wdk-wallet` are still fine.
 */
export interface WalletManagerConfig {
  transferMaxFee?: number | bigint;
  [key: string]: unknown;
}

export type KeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array | null;
};

/**
 * Minimal runtime-compatible subset of `@tetherto/wdk-wallet`'s `WalletManager`.
 * Used as the superclass for network-specific managers in this package.
 */
export default class WalletManager {
  protected _seed: Uint8Array;
  protected _config: WalletManagerConfig;

  constructor(seed: string | Uint8Array, config: WalletManagerConfig = {}) {
    if (typeof seed === 'string') {
      if (!WalletManager.isValidSeedPhrase(seed)) {
        throw new Error('The seed phrase is invalid.');
      }

      seed = bip39.mnemonicToSeedSync(seed);
    }

    this._seed = seed;
    this._config = config;
  }

  static getRandomSeedPhrase(wordCount: 12 | 24 = 12): string {
    const strength = wordCount === 24 ? 256 : 128;
    return bip39.generateMnemonic(strength);
  }

  static isValidSeedPhrase(seedPhrase: string): boolean {
    return bip39.validateMnemonic(seedPhrase);
  }

  get seed(): Uint8Array {
    return this._seed;
  }
}
