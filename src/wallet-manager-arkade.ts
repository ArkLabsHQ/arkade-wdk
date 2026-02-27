import WalletManager, { type KeyPair } from '@tetherto/wdk-wallet';
import type { ArkadeWalletConfig } from './types.js';
import {
  ArkInfo,
  ArkProvider,
  NetworkName,
  RestArkProvider,
  SingleKey,
  Wallet,
  WalletConfig,
} from '@arkade-os/sdk';
import { HDKey } from '@scure/bip32';
import { ArkadeSwaps, BoltzSwapProvider } from '@arkade-os/boltz-swap';
import type { FeeRates } from '@tetherto/wdk';
import { WalletAccountArkade } from './wallet-account-arkade.js';

const WALLET_CREATE_TIMEOUT_MS = 30_000;

/**
 * Bitcoin wallet manager using Arkade SDK with Ark protocol support
 * Implements WDK-compatible interface with Arkade's dual-layer transaction capabilities
 *
 * Each account index creates a unified account exposing all capabilities:
 * - `getAddress()` → Ark offchain address (primary)
 * - `getBoardingAddress()` → on-chain Bitcoin deposit address
 * - `createLightningInvoice()` → Lightning receive (when configured)
 *
 * All accounts share the same underlying Ark wallet instance.
 */
class WalletManagerArkade extends WalletManager {
  private config: ArkadeWalletConfig;
  private accounts: Map<string, WalletAccountArkade> = new Map();
  private disposed: boolean = false;
  private arkProvider: ArkProvider;
  private info: Promise<ArkInfo>;
  /** Cached wallet instance shared across account indices */
  private walletPromise: Promise<{
    wallet: Wallet;
    keyPair: KeyPair;
    lightning: ArkadeSwaps | null;
  }> | null = null;

  constructor(seed: string | Uint8Array, config?: ArkadeWalletConfig) {
    super(seed);

    this.config = config ?? {};
    this.arkProvider = (this.config.arkProvider ?? new RestArkProvider(this.config.arkServerUrl!)) as ArkProvider;
    this.info = this.arkProvider.getInfo().catch((reason: unknown) => {
      this.info = this.arkProvider.getInfo();
      throw new Error(`Failed to fetch Arkade network info: ${String(reason)}`);
    });
  }

  private disposeCheck(): void {
    if (this.disposed) {
      throw new Error('WalletManagerArkade has been disposed');
    }
  }

  /**
   * Create or return the shared Ark wallet instance.
   * The wallet key always derives from BIP-86 index 0 path.
   */
  private getOrCreateWallet(): Promise<{
    wallet: Wallet;
    keyPair: KeyPair;
    lightning: ArkadeSwaps | null;
  }> {
    if (this.walletPromise) {
      return this.walletPromise;
    }

    this.walletPromise = (async () => {
      const info = await this.info;
      const network = ['bitcoin', 'mainnet'].includes(String(info.network)) ? '0' : '1';
      const path = `m/86'/${network}/0'/0/0`;

      const hdKey = HDKey.fromMasterSeed(this.seed).derive(path);
      if (!hdKey.privateKey || !hdKey.publicKey) {
        throw new Error(`Failed to derive private key at path ${path}`);
      }

      const walletConfig: WalletConfig = {
        ...this.config,
        identity: SingleKey.fromPrivateKey(hdKey.privateKey),
      };

      // Wrap Wallet.create() with a timeout so an unreachable Ark server
      // doesn't hang the worklet indefinitely.
      const wallet = await Promise.race([
        Wallet.create(walletConfig),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error(
              `Ark wallet creation timed out after ${WALLET_CREATE_TIMEOUT_MS}ms — ` +
              `is the Ark server at ${this.config.arkServerUrl} reachable?`
            )),
            WALLET_CREATE_TIMEOUT_MS
          );
        }),
      ]);

      const keyPair: KeyPair = {
        privateKey: hdKey.privateKey,
        publicKey: hdKey.publicKey,
      };

      let lightning: ArkadeSwaps | null = null;
      if (this.config.swapProviderUrl) {
        const swapProvider = new BoltzSwapProvider({
          apiUrl: this.config.swapProviderUrl,
          network: info.network as NetworkName,
        });
        lightning = new ArkadeSwaps({
          wallet,
          swapProvider,
          swapManager: { autoStart: true, pollInterval: 5_000 },
        });
      }

      return { wallet, keyPair, lightning };
    })();

    // If creation fails, clear the promise so the next call retries
    this.walletPromise.catch(() => {
      this.walletPromise = null;
    });

    return this.walletPromise;
  }

  /**
   * Get or create a unified account at the specified index.
   * Each account exposes all capabilities (offchain, boarding, lightning).
   */
  async getAccount(index: number = 0): Promise<WalletAccountArkade> {
    this.disposeCheck();

    const cacheKey = `account:${index}`;

    const existing = this.accounts.get(cacheKey);
    if (existing) {
      return existing;
    }

    const { wallet, keyPair, lightning } = await this.getOrCreateWallet();

    const info = await this.info;
    const network = ['bitcoin', 'mainnet'].includes(String(info.network)) ? '0' : '1';
    const path = `m/86'/${network}/0'/0/${index}`;

    const account = new WalletAccountArkade(
      path,
      wallet,
      keyPair,
      wallet.indexerProvider,
      this.info,
      lightning,
    );

    this.accounts.set(cacheKey, account);
    return account;
  }

  /**
   * Get or create a unified account at a specific derivation path.
   */
  async getAccountByPath(path: string): Promise<WalletAccountArkade> {
    this.disposeCheck();

    const existing = this.accounts.get(path);
    if (existing) {
      return existing;
    }

    const { wallet, keyPair, lightning } = await this.getOrCreateWallet();

    const account = new WalletAccountArkade(
      path,
      wallet,
      keyPair,
      wallet.indexerProvider,
      this.info,
      lightning,
    );

    this.accounts.set(path, account);
    return account;
  }

  /**
   * Get current Bitcoin network fee rates
   */
  getFeeRates(): Promise<FeeRates> {
    this.disposeCheck();
    return Promise.resolve({
      normal: 0n,
      fast: 0n,
    });
  }

  /**
   * Securely dispose of sensitive data
   */
  dispose(): void {
    this.disposeCheck();

    // Clear all accounts
    for (const account of this.accounts.values()) {
      account.dispose();
    }
    this.accounts.clear();
    this.walletPromise = null;

    this.seed.set(new Uint8Array(this.seed.length));
    this.disposed = true;
  }
}

export default WalletManagerArkade;
