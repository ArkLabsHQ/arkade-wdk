import WalletManager from '@tetherto/wdk-wallet';
import { RestArkProvider, SingleKey, Wallet } from '@arkade-os/sdk';
import { HDKey } from '@scure/bip32';
import { ArkadeSwaps } from '@arkade-os/boltz-swap';
import { WalletAccountArkade } from './wallet-account-arkade.js';

const WALLET_CREATE_TIMEOUT_MS = 30_000;

/**
 * Bitcoin wallet manager using Arkade SDK with Ark protocol support.
 * Caches accounts in the inherited `_accounts` map and delegates disposal to the base class.
 */
class WalletManagerArkade extends WalletManager {
  /**
   * @param {string | Uint8Array} seed
   * @param {import('./types.js').ArkadeWalletConfig} [config]
   */
  constructor(seed, config) {
    super(seed);

    /** @private @type {import('./types.js').ArkadeWalletConfig} */
    this.config = config ?? {};

    /** @private @type {import('@arkade-os/sdk').ArkProvider} */
    this.arkProvider = /** @type {import('@arkade-os/sdk').ArkProvider} */ (
      this.config.arkProvider ?? new RestArkProvider(this.config.arkServerUrl)
    );

    /** @private @type {Promise<import('@arkade-os/sdk').ArkInfo>} */
    this.info = this.arkProvider.getInfo().catch((/** @type {unknown} */ reason) => {
      this.info = this.arkProvider.getInfo();
      throw new Error(`Failed to fetch Arkade network info: ${String(reason)}`);
    });

    /** @private */
    this.disposed = false;

    /** @private @type {{ [path: string]: Promise<{ wallet: Wallet; keyPair: import('@tetherto/wdk-wallet').KeyPair; swaps: ArkadeSwaps | null }> | undefined }} */
    this._walletPromises = {};
  }

  /** @private */
  disposeCheck() {
    if (this.disposed) {
      throw new Error('WalletManagerArkade has been disposed');
    }
  }

  /**
   * @private
   * @param {string} path — full BIP-86 derivation path (e.g. `m/86'/1/0'/0/3`)
   * @returns {Promise<{ wallet: Wallet; keyPair: import('@tetherto/wdk-wallet').KeyPair; swaps: ArkadeSwaps | null }>}
   */
  _getOrCreateWalletForPath(path) {
    if (this._walletPromises[path]) {
      return this._walletPromises[path];
    }

    this._walletPromises[path] = (async () => {
      const hdKey = HDKey.fromMasterSeed(this.seed).derive(path);
      if (!hdKey.privateKey || !hdKey.publicKey) {
        throw new Error(`Failed to derive private key at path ${path}`);
      }

      /** @type {import('@arkade-os/sdk').WalletConfig} */
      const walletConfig = {
        ...this.config,
        identity: SingleKey.fromPrivateKey(hdKey.privateKey),
      };

      const wallet = await Promise.race([
        Wallet.create(walletConfig),
        new Promise((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Ark wallet creation timed out after ${WALLET_CREATE_TIMEOUT_MS}ms — ` +
                    `is the Ark server at ${this.config.arkServerUrl} reachable?`
                )
              ),
            WALLET_CREATE_TIMEOUT_MS
          );
        }),
      ]);

      /** @type {import('@tetherto/wdk-wallet').KeyPair} */
      const keyPair = {
        privateKey: hdKey.privateKey,
        publicKey: hdKey.publicKey,
      };

      /** @type {ArkadeSwaps | null} */
      let swaps = null;
      if (this.config.swapProviderUrl) {
        swaps = await ArkadeSwaps.create({
          wallet,
          swapManager: { autoStart: true, pollInterval: 5_000 },
        });
      }

      return { wallet, keyPair, swaps };
    })();

    this._walletPromises[path].catch(() => {
      delete this._walletPromises[path];
    });

    return this._walletPromises[path];
  }

  /**
   * @param {number} [index]
   * @returns {Promise<WalletAccountArkade>}
   */
  async getAccount(index = 0) {
    this.disposeCheck();

    const info = await this.info;
    const network = ['bitcoin', 'mainnet'].includes(String(info.network)) ? '0' : '1';
    const path = `m/86'/${network}/0'/0/${index}`;

    return this.getAccountByPath(path);
  }

  /**
   * @param {string} path
   * @returns {Promise<WalletAccountArkade>}
   */
  async getAccountByPath(path) {
    this.disposeCheck();

    const cached = /** @type {WalletAccountArkade | undefined} */ (this._accounts[path]);
    if (cached) return cached;

    const { wallet, keyPair, swaps } = await this._getOrCreateWalletForPath(path);
    const address = await wallet.getAddress();

    const account = new WalletAccountArkade(
      address,
      path,
      wallet,
      keyPair,
      wallet.indexerProvider,
      this.info,
      swaps
    );

    this._accounts[path] = account;
    return account;
  }

  /** @returns {Promise<import('@tetherto/wdk').FeeRates>} */
  getFeeRates() {
    this.disposeCheck();
    return Promise.resolve({ normal: 0n, fast: 0n });
  }

  async dispose() {
    this.disposeCheck();
    this.disposed = true;

    super.dispose();

    const walletPromises = Object.values(this._walletPromises);
    this._walletPromises = {};

    for (const wp of walletPromises) {
      if (!wp) continue;
      try {
        const { wallet } = await wp;
        await wallet.dispose();
      } catch (_err) {
        // Wallet creation may have failed — nothing to dispose
      }
    }

    globalThis.crypto.getRandomValues(this.seed);
    this.seed.fill(0);
  }
}

export default WalletManagerArkade;
