import WalletManager from '@tetherto/wdk-wallet';
import { RestArkProvider, SingleKey, Wallet } from '@arkade-os/sdk';
import { HDKey } from '@scure/bip32';
import { ArkadeSwaps, BoltzSwapProvider } from '@arkade-os/boltz-swap';
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
    // Retry once on failure. The previous code re-threw from the catch handler
    // which orphaned the original rejected promise as unhandled — Bare's
    // uncaught-rejection handler would then call abort() and crash the app.
    // Returning the retry result from catch keeps a single promise chain with
    // no orphaned rejections. If BOTH attempts fail, the promise rejects and
    // callers (getAccount, getFeeRates) surface the error normally.
    this.info = this.arkProvider.getInfo().catch((/** @type {unknown} */ reason) => {
      console.warn(`Arkade network info fetch failed, retrying: ${String(reason)}`);
      return this.arkProvider.getInfo();
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
        // Resolve the network from the same arkInfo we cached at construction
        // time so the swap provider speaks to the matching Boltz endpoint.
        const info = await this.info;
        const network = /** @type {import('@arkade-os/sdk').NetworkName} */ (info.network);
        const swapProvider = new BoltzSwapProvider({
          apiUrl: this.config.swapProviderUrl,
          network,
        });
        swaps = await ArkadeSwaps.create({
          wallet,
          swapProvider,
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

  /**
   * Returns the current Ark fee rate in sat/vB.
   *
   * Ark has no mempool fee tiers — `txFeeRate` from `arkInfo.fees` is the
   * single rate negotiated with the Ark server, so `normal` and `fast` are
   * always equal. The split is preserved to match the WDK `FeeRates` shape.
   *
   * @returns {Promise<import('@tetherto/wdk').FeeRates>}
   */
  async getFeeRates() {
    this.disposeCheck();
    const info = await this.info;
    const rate = BigInt(Math.ceil(parseFloat(info.fees.txFeeRate)));
    return { normal: rate, fast: rate };
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
