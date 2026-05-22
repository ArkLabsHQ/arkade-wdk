import WalletManager from '@tetherto/wdk-wallet';
import {
  RestArkProvider,
  SingleKey,
  Wallet,
  InMemoryWalletRepository,
  InMemoryContractRepository,
} from '@arkade-os/sdk';
import { HDKey } from '@scure/bip32';
import { ArkadeSwaps, BoltzSwapProvider } from '@arkade-os/boltz-swap';
import { sodium_memzero } from 'sodium-universal';
import { parseFeeRate } from './lib/fees.js';
import { WalletAccountArkade } from './wallet-account-arkade.js';

const WALLET_CREATE_TIMEOUT_MS = 30_000;

/**
 * Bitcoin wallet manager using the Arkade SDK.
 * Caches accounts in the inherited `_accounts` map and delegates disposal to the base class.
 */
class WalletManagerArkade extends WalletManager {
  /**
   * @param {string | Uint8Array} seed
   * @param {import('./types.js').ArkadeWalletConfig} [config]
   */
  constructor(seed, config = {}) {
    super(seed, config);

    /** @private @type {import('@arkade-os/sdk').ArkProvider} */
    this._arkProvider = /** @type {import('@arkade-os/sdk').ArkProvider} */ (
      this._cfg().arkProvider ?? new RestArkProvider(this._cfg().arkServerUrl)
    );

    /** @private @type {Promise<import('@arkade-os/sdk').ArkInfo>} */
    // Retry once on failure. The previous code re-threw from the catch handler
    // which orphaned the original rejected promise as unhandled — Bare's
    // uncaught-rejection handler would then call abort() and crash the app.
    // Returning the retry result from catch keeps a single promise chain with
    // no orphaned rejections. If BOTH attempts fail, the promise rejects and
    // callers (getAccount, getFeeRates) surface the error normally.
    this._info = this._arkProvider.getInfo().catch((/** @type {unknown} */ reason) => {
      console.warn(`Arkade network info fetch failed, retrying: ${String(reason)}`);
      return this._arkProvider.getInfo();
    });

    /** @private */
    this._disposed = false;

    /** @private @type {{ [path: string]: Promise<{ wallet: Wallet; keyPair: import('@tetherto/wdk-wallet').KeyPair; swaps: ArkadeSwaps | null }> | undefined }} */
    this._walletPromises = {};
  }

  /**
   * Narrows the inherited `_config` (typed as the WDK `WalletConfig` base)
   * to our `ArkadeWalletConfig`. Accessing it through this helper keeps the
   * type assertion in one place.
   * @private
   * @returns {import('./types.js').ArkadeWalletConfig}
   */
  _cfg() {
    return /** @type {import('./types.js').ArkadeWalletConfig} */ (this._config);
  }

  /** @private */
  _disposeCheck() {
    if (this._disposed) {
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
      // Keep the master HDKey named so we can wipe its private data after
      // derivation. The final hdKey._privateKey is shared with keyPair below
      // and is zeroed via sodium_memzero in the account dispose path.
      // The try/finally ensures the master's private data is wiped even if
      // `derive(path)` throws on a malformed path supplied by the consumer.
      const master = HDKey.fromMasterSeed(this.seed);
      let hdKey;
      try {
        hdKey = master.derive(path);
      } finally {
        master.wipePrivateData();
      }
      if (!hdKey.privateKey || !hdKey.publicKey) {
        throw new Error(`Failed to derive private key at path ${path}`);
      }

      const cfg = this._cfg();
      /** @type {import('@arkade-os/sdk').WalletConfig} */
      const walletConfig = {
        ...cfg,
        identity: SingleKey.fromPrivateKey(hdKey.privateKey),
        // Use in-memory storage when no storage config is provided. The SDK
        // defaults to IndexedDB which isn't available in the Bare worklet
        // runtime. In-memory storage means VTXO state is lost on app restart,
        // but balance/send/history work for the current session. A future
        // improvement could bridge to expo-sqlite on the RN side or use a
        // bare-fs-backed SQLite repo.
        storage: cfg.storage ?? {
          walletRepository: new InMemoryWalletRepository(),
          contractRepository: new InMemoryContractRepository(),
        },
      };

      // Track the timer so we can clear it when Wallet.create wins. Letting
      // the timeout fire after a successful create produces an unhandled
      // rejection on the losing promise, which Bare's strict handler turns
      // into an abort.
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timeoutId;
      const wallet = await Promise.race([
        Wallet.create(walletConfig),
        new Promise((_resolve, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(
                  `Arkade wallet creation timed out after ${WALLET_CREATE_TIMEOUT_MS}ms — ` +
                    `is the Arkade operator at ${cfg.arkServerUrl} reachable?`
                )
              ),
            WALLET_CREATE_TIMEOUT_MS
          );
        }),
      ]).finally(() => clearTimeout(timeoutId));

      /** @type {import('@tetherto/wdk-wallet').KeyPair} */
      const keyPair = {
        privateKey: hdKey.privateKey,
        publicKey: hdKey.publicKey,
      };

      /** @type {ArkadeSwaps | null} */
      let swaps = null;
      if (cfg.swapProviderUrl) {
        const info = await this._info;
        const network = /** @type {import('@arkade-os/sdk').NetworkName} */ (info.network);
        const swapProvider = new BoltzSwapProvider({
          apiUrl: cfg.swapProviderUrl,
          network,
          referralId: 'arkade-wdk-sdk',
        });

        /** @type {import('@arkade-os/boltz-swap').ArkadeSwapsCreateConfig} */
        const swapsConfig = {
          wallet,
          swapProvider,
          swapManager: { autoStart: true, pollInterval: 5_000 },
        };
        // Forward swapRepository from config if provided (e.g. a SQLite-
        // backed repo passed by the RN-side initArkadeWallet).
        if (cfg.swapRepository) {
          swapsConfig.swapRepository = cfg.swapRepository;
        }
        swaps = await ArkadeSwaps.create(swapsConfig);
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
    this._disposeCheck();

    const info = await this._info;
    const network = ['bitcoin', 'mainnet'].includes(String(info.network)) ? '0' : '1';
    const path = `m/86'/${network}/0'/0/${index}`;

    return this.getAccountByPath(path);
  }

  /**
   * @param {string} path
   * @returns {Promise<WalletAccountArkade>}
   */
  async getAccountByPath(path) {
    this._disposeCheck();

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
      this._info,
      swaps
    );

    this._accounts[path] = account;
    return account;
  }

  /**
   * Returns the current Arkade fee rate in sat/vB.
   *
   * Arkade has no mempool fee tiers — `txFeeRate` from `arkInfo.fees` is the
   * single rate from the Arkade operator, so `normal` and `fast` are
   * always equal. The split is preserved to match the WDK `FeeRates` shape.
   *
   * @returns {Promise<import('@tetherto/wdk').FeeRates>}
   */
  async getFeeRates() {
    this._disposeCheck();
    const info = await this._info;
    const rate = BigInt(Math.ceil(parseFeeRate(info.fees.txFeeRate)));
    return { normal: rate, fast: rate };
  }

  async dispose() {
    this._disposeCheck();
    this._disposed = true;

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

    sodium_memzero(this.seed);
  }
}

export default WalletManagerArkade;
