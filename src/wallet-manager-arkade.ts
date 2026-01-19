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
import { ArkadeLightning, BoltzSwapProvider } from '@arkade-os/boltz-swap';
import { FeeRates } from '@tetherto/wdk';
import { WalletAccountArkade } from './bitcoin-arkade.js';

/**
 * Bitcoin wallet manager using Arkade SDK with Ark protocol support
 * Implements WDK-compatible interface with Arkade's dual-layer transaction capabilities
 */
class WalletManagerArkade extends WalletManager {
  private config: ArkadeWalletConfig;
  private accounts: Map<string, WalletAccountArkade> = new Map();
  private disposed: boolean = false;
  private arkProvider: ArkProvider;
  private info: Promise<ArkInfo>;

  constructor(seed: string | Uint8Array, config?: ArkadeWalletConfig) {
    super(seed);

    this.config = config ?? {};
    this.arkProvider = (this.config.arkProvider ??
      new RestArkProvider(this.config.arkServerUrl!)) as ArkProvider;
    this.info = this.arkProvider.getInfo().catch((reason: unknown) => {
      throw new Error(`Failed to fetch Arkade network info: ${String(reason)}`);
    });
  }

  private disposeCheck(): void {
    if (this.disposed) {
      throw new Error('WalletManagerArkade has been disposed');
    }
  }

  /**
   * Get or create account at specified index
   * Uses BIP-86 derivation path pattern: m/86'/0'/0'/0/index
   */
  async getAccount(index: number = 0): Promise<WalletAccountArkade> {
    this.disposeCheck();

    const info = await this.info;
    const network = ['bitcoin', 'mainnet'].includes(String(info.network)) ? '0' : '1';
    const path = `m/86'/${network}/0'/0/${index}`;
    return this.getAccountByPath(path);
  }

  /**
   * Get or create account at specific derivation path
   */
  async getAccountByPath(path: string): Promise<WalletAccountArkade> {
    this.disposeCheck();

    const existing = this.accounts.get(path);
    if (existing) {
      return existing;
    }

    const hdKey = HDKey.fromMasterSeed(this.seed).derive(path);
    if (!hdKey.privateKey || !hdKey.publicKey) {
      throw new Error(`Failed to derive private key at path ${path}`);
    }

    const config: WalletConfig = {
      ...this.config,
      identity: SingleKey.fromPrivateKey(hdKey.privateKey),
    };

    const wallet = await Wallet.create(config);
    const keyPair: KeyPair = {
      privateKey: hdKey.privateKey,
      publicKey: hdKey.publicKey,
    };

    let al: ArkadeLightning | null = null;
    if (this.config.swapProviderUrl) {
      const swapProvider = new BoltzSwapProvider({
        apiUrl: this.config.swapProviderUrl,
        network: (await this.info).network as NetworkName,
      });
      al = new ArkadeLightning({
        wallet,
        swapProvider,
        swapManager: {
          autoStart: true,
        },
      });
    }

    const account = new WalletAccountArkade(
      path,
      wallet,
      keyPair,
      wallet.indexerProvider,
      this.info,
      al
    );
    await account.initialize();

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

    this.seed.set(new Uint8Array(this.seed.length));
    this.disposed = true;
  }
}

export default WalletManagerArkade;
