import { Identity, IWallet, Wallet, WalletConfig } from '@arkade-os/sdk';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync, generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
// Official WDK types
import type {
  IWalletAccountReadOnly,
  KeyPair,
} from '@tetherto/wdk-wallet';

import type {
  Transaction,
  TransactionResult,
  TransferResult,
} from '@tetherto/wdk-wallet/types/src/wallet-account-read-only.js';

import type {
  ISwapProtocol,
  IBridgeProtocol,
  ILendingProtocol,
} from '@tetherto/wdk-wallet/types/src/protocols/index.js';

// Arkade-specific types
import type {
  ArkadeWalletConfig,
  Balance,
  FeeRates,
  Transfer,
  TransferQueryOptions,
} from '../types.js';
import WalletManager from '@tetherto/wdk-wallet';
import { IWalletAccount } from '@tetherto/wdk-wallet/types/src/wallet-manager.js';

/**
 * Bitcoin wallet manager using Arkade SDK with Ark protocol support
 * Implements WDK-compatible interface with Arkade's dual-layer transaction capabilities
 */
export class WalletManagerArkade extends WalletManager {
  private config: ArkadeWalletConfig;
  private accounts: Map<string, WalletAccountArkade> = new Map();

  /**
   * Static methods required by official WDK WalletManager interface
   */
  static getRandomSeedPhrase(): string {
    return generateMnemonic(wordlist)
  }

  static isValidSeedPhrase(seedPhrase: string): boolean {
    return validateMnemonic(seedPhrase, wordlist);
  }

  constructor(seed: string | Uint8Array, config?: ArkadeWalletConfig) {
    super(seed, config);
    this.config = config ?? {};
  }

  /**
   * Get or create account at specified index
   * Uses BIP-86 derivation path pattern: m/86'/0'/0'/0/index
   */
  async getAccount(index: number = 0): Promise<WalletAccountArkade> {

    const mainnet = this.config.network === 'mainnet';

    const path = `0'/0/${index}`;
    return this.getAccountByPath(path);
  }

  /**
   * Get or create account at specific derivation path
   */
  async getAccountByPath(path: string): Promise<WalletAccountArkade> {
    const existing = this.accounts.get(path);
    if (existing) {
      return existing;
    }

    const account = new WalletAccountArkade(this.seed, path, this.config);
    await account.initialize();

    this.accounts.set(path, account);
    return account;
  }

  /**
   * Get current Bitcoin network fee rates
   */
  async getFeeRates(): Promise<FeeRates> {
    // Note: Implement actual fee rate fetching from Arkade or external service
    // For now, return placeholder values (in sat/vB)
    return {
      normal: 10n, // ~1 hour confirmation
      fast: 20n, // faster confirmation
    };
  }

  /**
   * Securely dispose of sensitive data
   */
  dispose(): void {
    // Clear all accounts
    for (const account of this.accounts.values()) {
      account.dispose();
    }
    this.accounts.clear();

    // Clear seed if it's a Uint8Array
    if (this.seed instanceof Uint8Array) {
      this.seed.fill(0);
    }
  }
}

/**
 * Bitcoin wallet account with Arkade Ark protocol support
 * Extends standard WalletAccount with Arkade-specific features like VTXOs and boarding addresses
 */
class WalletAccountArkade implements IWalletAccount {


  constructor(
    public readonly  path: string,
    public readonly  index: number,
    public readonly  wallet: IWallet,
    public readonly  keyPair: KeyPair,
    ) {
  }

  /**
   * Initialize the wallet with Arkade SDK
   */
  async initialize(): Promise<void> {
  }

  /**
   * Get Ark protocol address (off-chain)
   */
  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }
    return await this.wallet.getAddress();
  }


  /**
   * Get simple balance (total spendable amount) to match IWalletAccount interface
   */
  async getBalance(): Promise<bigint> {
    const detailed = await this.getBalanceDetailed();
    return BigInt(detailed.total);
  }

  /**
   * Get detailed balance with all Arkade VTXO states
   */
  async getBalanceDetailed(): Promise<Balance> {
    const balance = await this.wallet.getBalance()

  }

  /**
   * Send Bitcoin transaction (official WDK signature)
   */
  async sendTransaction(tx: Transaction): Promise<TransactionResult> {
    const amount = typeof tx.value === 'bigint' ? Number(tx.value) : tx.value;
    const txid = await this.wallet.sendBitcoin({
      address: tx.to,
      amount: amount,
    });

    return {
      hash: txid,
      fee: 0n
    };
  }

  /**
   * Quote transaction fee without sending (official WDK signature)
   */
  async quoteSendTransaction(_tx: Transaction): Promise<Omit<TransactionResult, 'hash'>> {
    return {
      fee: 0n,
    };
  }

  /**
   * Get token balance (ERC-20 specific - not applicable to Bitcoin)
   * Required by official WDK IWalletAccount interface
   */
  async getTokenBalance(_tokenAddress: string): Promise<bigint> {
    // Bitcoin doesn't have tokens like EVM chains
    throw new Error('getTokenBalance not applicable to Bitcoin wallets');
  }

  /**
   * Transfer tokens (ERC-20 specific - not applicable to Bitcoin)
   * Required by official WDK IWalletAccount interface
   */
  async transfer(_options: { token: string; recipient: string; amount: number | bigint }): Promise<TransferResult> {
    // Bitcoin doesn't have token transfers like EVM chains
    throw new Error('transfer not applicable to Bitcoin wallets - use sendTransaction instead');
  }

  /**
   * Quote transfer costs (ERC-20 specific - not applicable to Bitcoin)
   * Required by official WDK IWalletAccount interface
   */
  async quoteTransfer(_options: { token: string; recipient: string; amount: number | bigint }): Promise<Omit<TransferResult, 'hash'>> {
    // Bitcoin doesn't have token transfers like EVM chains
    throw new Error('quoteTransfer not applicable to Bitcoin wallets');
  }

  /**
   * Get transaction receipt
   * Required by official WDK IWalletAccount interface
   */
  async getTransactionReceipt(_hash: string): Promise<unknown | null> {
    // TODO: Implement transaction receipt lookup via Esplora or similar
    throw new Error('getTransactionReceipt not yet implemented');
  }

  /**
   * Sign a message with the account's private key
   * Note: Arkade SDK Identity is designed for Bitcoin transaction signing, not arbitrary messages.
   * This is a simplified implementation for WDK compatibility.
   */
  async sign(message: string): Promise<string> {
    if (!this.identity) {
      throw new Error('Identity not initialized');
    }

    // Get the public key as a signature placeholder
    // In a real implementation, you'd use proper Bitcoin message signing (BIP-137)
    const pubkey = this.identity.xOnlyPublicKey();
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(message);

    // Create a simple hash-based signature (NOT SECURE - for demo only)
    const combined = new Uint8Array(pubkey.length + messageBytes.length);
    combined.set(pubkey, 0);
    combined.set(messageBytes, pubkey.length);

    // Convert to hex string
    return Array.from(combined)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Verify a message signature
   */
  async verify(_message: string, _signature: string): Promise<boolean> {
    if (!this.identity) {
      throw new Error('Identity not initialized');
    }

    // TODO: Implement proper signature verification with public key
    // This requires Bitcoin message signing format (BIP-137)
    throw new Error('verify not yet implemented - requires BIP-137 message signing');
  }

  /**
   * Create a read-only version of this account
   */
  async toReadOnlyAccount(): Promise<IWalletAccountReadOnly> {
    throw new Error('toReadOnlyAccount not implemented');
  }

  /**
   * Register a protocol (swap, bridge, lending) with this account
   */
  registerProtocol<P>(label: string, protocol: P, _config?: unknown): void {
    this.protocols.set(label, protocol as any);
  }

  /**
   * Get registered swap protocol by label
   */
  getSwapProtocol(label: string): ISwapProtocol | undefined {
    const protocol = this.protocols.get(label);
    return protocol && 'execute' in protocol ? (protocol as ISwapProtocol) : undefined;
  }

  /**
   * Get registered bridge protocol by label
   */
  getBridgeProtocol(label: string): IBridgeProtocol | undefined {
    const protocol = this.protocols.get(label);
    return protocol && 'execute' in protocol ? (protocol as IBridgeProtocol) : undefined;
  }

  /**
   * Get registered lending protocol by label
   */
  getLendingProtocol(label: string): ILendingProtocol | undefined {
    const protocol = this.protocols.get(label);
    return protocol && 'execute' in protocol ? (protocol as ILendingProtocol) : undefined;
  }

  /**
   * Securely dispose of sensitive data
   */
  dispose(): void {
    // Clear identity
    this.identity = null;

    // Clear wallet reference
    this._wallet = null;

    // Clear protocols
    this.protocols.clear();
  }

}
