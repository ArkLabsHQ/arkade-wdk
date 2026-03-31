import WalletManager, { type KeyPair } from '@tetherto/wdk-wallet';
import type { ArkadeWalletConfig } from './types.js';
import {
  ArkInfo,
  ArkProvider,
  RestArkProvider,
  SingleKey,
  Wallet,
  WalletConfig,
} from '@arkade-os/sdk';
import { HDKey } from '@scure/bip32';
import { ArkadeSwaps } from '@arkade-os/boltz-swap';
import type { FeeRates } from '@tetherto/wdk';
import { WalletAccountArkade } from './wallet-account-arkade.js';

const WALLET_CREATE_TIMEOUT_MS = 30_000;

/**
 * Bitcoin wallet manager using Arkade SDK with Ark protocol support.
 * Caches accounts in the inherited `_accounts` map and delegates disposal to the base class.
 */
class WalletManagerArkade extends WalletManager {
  private config: ArkadeWalletConfig;
  private disposed: boolean = false;
  private arkProvider: ArkProvider;
  private info: Promise<ArkInfo>;
  private walletPromise: Promise<{
    wallet: Wallet;
    keyPair: KeyPair;
    swaps: ArkadeSwaps | null;
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

  private getOrCreateWallet(): Promise<{
    wallet: Wallet;
    keyPair: KeyPair;
    swaps: ArkadeSwaps | null;
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

      let swaps: ArkadeSwaps | null = null;
      if (this.config.swapProviderUrl) {
        swaps = await ArkadeSwaps.create({
          wallet,
          swapManager: { autoStart: true, pollInterval: 5_000 },
        });
      }

      return { wallet, keyPair, swaps };
    })();

    this.walletPromise.catch(() => {
      this.walletPromise = null;
    });

    return this.walletPromise;
  }

  async getAccount(index: number = 0): Promise<WalletAccountArkade> {
    this.disposeCheck();

    const info = await this.info;
    const network = ['bitcoin', 'mainnet'].includes(String(info.network)) ? '0' : '1';
    const path = `m/86'/${network}/0'/0/${index}`;

    return this.getAccountByPath(path);
  }

  async getAccountByPath(path: string): Promise<WalletAccountArkade> {
    this.disposeCheck();

    const cached = this._accounts[path] as WalletAccountArkade | undefined;
    if (cached) return cached;

    const { wallet, keyPair, swaps } = await this.getOrCreateWallet();
    const address = await wallet.getAddress();

    const account = new WalletAccountArkade(
      address,
      path,
      wallet,
      keyPair,
      wallet.indexerProvider,
      this.info,
      swaps,
    );

    this._accounts[path] = account;
    return account;
  }

  getFeeRates(): Promise<FeeRates> {
    this.disposeCheck();
    return Promise.resolve({ normal: 0n, fast: 0n });
  }

  dispose(): void {
    this.disposeCheck();
    super.dispose();
    this.walletPromise = null;
    globalThis.crypto.getRandomValues(this.seed);
    this.seed.fill(0);
    this.disposed = true;
  }
}

export default WalletManagerArkade;
