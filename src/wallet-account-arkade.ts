import { ArkInfo, BIP322, IWallet } from '@arkade-os/sdk';
import type { KeyPair, IWalletAccountReadOnly } from '@tetherto/wdk-wallet';
import type {
  Transaction,
  TransactionResult,
  TransferResult,
  IWalletAccount,
} from '@tetherto/wdk-wallet';
import type { IndexerProvider } from '@arkade-os/sdk';
import type {
  ArkadeSwaps,
  CreateLightningInvoiceResponse,
} from '@arkade-os/boltz-swap';
import { calculateOffchainFee } from './lib/fees.js';
import { quoteSend, send } from './lib/send.js';
import { WalletAccountReadOnlyArkade } from './wallet-account-read-only-arkade.js';

/**
 * Full Bitcoin wallet account with Arkade Ark protocol support.
 * Extends the read-only account with signing, sending, and Lightning capabilities.
 */
export class WalletAccountArkade extends WalletAccountReadOnlyArkade implements IWalletAccount {
  public readonly index: number;
  public readonly path: string;
  public readonly keyPair: KeyPair;

  declare protected readonly wallet: IWallet;

  constructor(
    address: string,
    path: string,
    wallet: IWallet,
    keyPair: KeyPair,
    indexerProvider: IndexerProvider,
    arkInfo: Promise<ArkInfo>,
    public readonly arkadeSwaps: ArkadeSwaps | null = null,
  ) {
    super(address, wallet, indexerProvider, arkInfo);
    this.path = path;
    this.index = parseInt(path.split('/').pop() || '0', 10);
    this.keyPair = keyPair;
  }

  async sendTransaction(tx: Transaction): Promise<TransactionResult> {
    const result = await send({
      to: tx.to,
      amount: BigInt(tx.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: this.arkadeSwaps,
    });

    return {
      hash: result.txid,
      fee: result.fee,
    };
  }

  override async quoteSendTransaction(tx: Transaction): Promise<Omit<TransactionResult, 'hash'>> {
    const estimate = await quoteSend({
      to: tx.to,
      amount: BigInt(tx.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: this.arkadeSwaps,
    });

    return { fee: estimate.fee };
  }

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
    return { hash: txid, fee: feeEstimate.fee };
  }

  async sign(message: string): Promise<string> {
    return BIP322.sign(message, this.wallet.identity);
  }

  toReadOnlyAccount(): Promise<IWalletAccountReadOnly> {
    return Promise.resolve(new WalletAccountReadOnlyArkade(
      this._address!,
      this.wallet,
      this.indexerProvider,
      this.arkInfo,
    ));
  }

  dispose(): void {
    if (this.keyPair.privateKey) {
      globalThis.crypto.getRandomValues(this.keyPair.privateKey);
      this.keyPair.privateKey.fill(0);
    }
    void this.arkadeSwaps?.dispose();
  }

  // ==========================================
  // Lightning Receive Methods
  // ==========================================

  async createLightningInvoice(amount: number, description?: string): Promise<{ invoice: string; paymentHash: string }> {
    if (!this.arkadeSwaps) {
      throw new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.');
    }

    const response: CreateLightningInvoiceResponse = await this.arkadeSwaps.createLightningInvoice({
      amount,
      description,
    });

    return { invoice: response.invoice, paymentHash: response.paymentHash };
  }
}
