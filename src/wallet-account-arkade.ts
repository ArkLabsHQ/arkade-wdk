import { ArkInfo, ArkTransaction, IWallet, Wallet } from '@arkade-os/sdk';
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
// Official WDK types
import type { IWalletAccountReadOnly, KeyPair } from '@tetherto/wdk-wallet';

import type {
  Transaction,
  TransactionResult,
  TransferResult,
  IWalletAccount,
} from '@tetherto/wdk-wallet';
import { Signer, Verifier } from 'bip322-js';
import type { IndexerProvider } from '@arkade-os/sdk';
import type {
  ArkadeLightning,
  CreateLightningInvoiceResponse,
} from '@arkade-os/boltz-swap';
import { calculateOffchainFee } from './lib/fees.js';
import { quoteSend, send } from './lib/send.js';

/**
 * Read-only Bitcoin wallet account with Arkade Ark protocol support
 * Cannot sign or send transactions - only query balances and verify signatures
 *
 * Each account is a unified view exposing all capabilities:
 * - `getAddress()` → Ark offchain address (primary)
 * - `getBoardingAddress()` → on-chain Bitcoin deposit address
 * - Lightning via `createLightningInvoice()` (on the full account)
 */
export class WalletAccountArkadeReadOnly implements IWalletAccountReadOnly {
  public readonly index: number;

  constructor(
    public readonly path: string,
    protected readonly wallet: IWallet,
    public readonly keyPair: { publicKey: Uint8Array },
    protected readonly indexerProvider: IndexerProvider,
    protected readonly arkInfo: Promise<ArkInfo>,
  ) {
    this.index = parseInt(path.split('/').pop() || '0', 10);
  }

  /**
   * Get the Ark offchain address (primary address for VTXO-to-VTXO transfers)
   */
  async getAddress(): Promise<string> {
    return await this.wallet.getAddress();
  }

  /**
   * Get the on-chain Bitcoin boarding address for initial deposits
   */
  async getBoardingAddress(): Promise<string> {
    return await this.wallet.getBoardingAddress();
  }

  /**
   * Get simple balance (total spendable amount)
   */
  async getBalance(): Promise<bigint> {
    const balance = await this.wallet.getBalance();
    return BigInt(balance.total);
  }

  /**
   * Verify a message signature
   */
  async verify(_message: string, _signature: string): Promise<boolean> {
    return Verifier.verifySignature(
      btc.p2tr(await this.wallet.identity.xOnlyPublicKey()).address,
      _message,
      _signature,
      false
    );
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(_hash: string): Promise<unknown> {
    const res = await this.indexerProvider.getVirtualTxs([_hash]);
    return res.txs.length > 0 ? res.txs[0] : null;
  }

  /**
   * Get transaction history from the Ark SDK
   */
  async getTransactionHistory(): Promise<ArkTransaction[]> {
    return await this.wallet.getTransactionHistory();
  }

  /**
   * Get token balance for a specific asset
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const balance = await this.wallet.getBalance();
    const asset = balance.assets.find(
      (a: { assetId: string; amount: number }) => a.assetId === tokenAddress,
    );
    return asset ? BigInt(asset.amount) : 0n;
  }

  /**
   * Quote transaction fee without sending (read-only can still estimate)
   */
  async quoteSendTransaction(tx: Transaction): Promise<Omit<TransactionResult, 'hash'>> {
    const estimate = await quoteSend({
      to: tx.to,
      amount: BigInt(tx.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: null,
    });
    return { fee: estimate.fee };
  }

  /**
   * Quote transfer costs for an asset transfer
   */
  async quoteTransfer(_options: {
    token: string;
    recipient: string;
    amount: number | bigint;
  }): Promise<Omit<TransferResult, 'hash'>> {
    const feeEstimate = await calculateOffchainFee(this.arkInfo);
    return { fee: feeEstimate.fee };
  }
}

/**
 * Bitcoin wallet account with Arkade Ark protocol support
 * Extends standard WalletAccount with Arkade-specific features like VTXOs and boarding addresses
 */
export class WalletAccountArkade extends WalletAccountArkadeReadOnly implements IWalletAccount {
  public override readonly keyPair: KeyPair;

  constructor(
    path: string,
    public readonly wallet: IWallet,
    keyPair: KeyPair,
    indexerProvider: IndexerProvider,
    arkInfo: Promise<ArkInfo>,
    public readonly arkadeLightning: ArkadeLightning | null = null,
  ) {
    super(path, wallet, keyPair, indexerProvider, arkInfo);
    this.keyPair = keyPair;
  }

  /**
   * Send Bitcoin transaction (official WDK signature)
   */
  async sendTransaction(tx: Transaction): Promise<TransactionResult> {
    const result = await send({
      to: tx.to,
      amount: BigInt(tx.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: this.arkadeLightning,
    });

    return {
      hash: result.txid,
      fee: result.fee,
    };
  }

  /**
   * Quote transaction fee without sending (official WDK signature)
   */
  override async quoteSendTransaction(tx: Transaction): Promise<Omit<TransactionResult, 'hash'>> {
    const estimate = await quoteSend({
      to: tx.to,
      amount: BigInt(tx.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: this.arkadeLightning,
    });

    return {
      fee: estimate.fee,
    };
  }

  /**
   * Transfer an asset to a recipient via Ark protocol
   */
  async transfer(options: {
    token: string;
    recipient: string;
    amount: number | bigint;
  }): Promise<TransferResult> {
    const txid = await this.wallet.send({
      address: options.recipient,
      assets: [{ assetId: options.token, amount: Number(options.amount) }],
    });

    const feeEstimate = await calculateOffchainFee(this.arkInfo);

    return {
      hash: txid,
      fee: feeEstimate.fee,
    };
  }

  /**
   * Sign a message with the account's private key
   * Note: Arkade SDK Identity is designed for Bitcoin transaction signing, not arbitrary messages.
   * This is a simplified implementation for WDK compatibility.
   */
  async sign(message: string): Promise<string> {
    return Signer.sign(
      hex.encode(this.keyPair.privateKey!),
      btc.p2tr(await this.wallet.identity.xOnlyPublicKey()).address,
      message
    );
  }

  /**
   * Create a read-only version of this account
   */
  toReadOnlyAccount(): Promise<IWalletAccountReadOnly> {
    return Promise.resolve(new WalletAccountArkadeReadOnly(
      this.path,
      this.wallet,
      { publicKey: this.keyPair.publicKey },
      this.indexerProvider,
      this.arkInfo,
    ));
  }

  /**
   * Securely dispose of sensitive data
   */
  dispose(): void {
    this.keyPair.privateKey?.fill(0);
    (this as unknown as { wallet: Wallet | null }).wallet = null;
    void this.arkadeLightning?.dispose();
  }


  // ==========================================
  // Lightning Receive Methods
  // ==========================================

  /**
   * Create a Lightning invoice to receive payment
   * Requires Lightning support to be configured (swapProviderUrl)
   * @param amount Amount in satoshis to receive
   * @param description Optional description for the invoice
   */
  async createLightningInvoice(amount: number, description?: string): Promise<{ invoice: string; paymentHash: string }> {
    if (!this.arkadeLightning) {
      throw new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.');
    }

    const response: CreateLightningInvoiceResponse = await this.arkadeLightning.createLightningInvoice({
      amount,
      description,
    });

    return { invoice: response.invoice, paymentHash: response.paymentHash };
  }

}
