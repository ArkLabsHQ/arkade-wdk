import { ArkInfo, IWallet, Wallet, ExtendedCoin, TxType } from '@arkade-os/sdk';
import * as secp from '@noble/secp256k1';
import { hex } from '@scure/base';
// Official WDK types
import type { IWalletAccountReadOnly, KeyPair } from '@tetherto/wdk-wallet';

import type {
  Transaction,
  TransactionResult,
  TransferResult,
  IWalletAccount,
} from '@tetherto/wdk-wallet';
import type { ExplorerTransaction, IndexerProvider } from '@arkade-os/sdk';
import {
  decodeInvoice,
  type ArkadeLightning,
  type CreateLightningInvoiceResponse,
} from '@arkade-os/boltz-swap';
import { quoteSend, send } from './lib/send.js';
import { calculateLightningReceiveFee } from './lib/fees.js';
import { isValidInvoice } from './lib/bolt11.js';
import { ArkTransaction } from '@arklabs/wallet-sdk';

/**
 * Read-only Bitcoin wallet account with Arkade Ark protocol support
 * Cannot sign or send transactions - only query balances and verify signatures
 */
export class WalletAccountArkadeReadOnly implements IWalletAccountReadOnly {
  public readonly index: number;

  constructor(
    public readonly path: string,
    protected readonly wallet: IWallet,
    public readonly keyPair: { publicKey: Uint8Array },
    protected readonly indexerProvider: IndexerProvider,
    protected readonly arkInfo: Promise<ArkInfo>
  ) {
    this.index = parseInt(path.split('/').pop() || '0', 10);
  }

  /**
   * Get Ark protocol address (off-chain)
   */
  async getAddress(): Promise<string> {
    return await this.wallet.getAddress();
  }

  /**
   * Get simple balance (total spendable amount)
   */
  async getBalance(): Promise<bigint> {
    const balance = await this.wallet.getBalance();
    return BigInt(balance.total);
  }

  /**
   * Checks for a confirmed Bitcoin deposit to the specified address
   * @param depositAddress
   * @returns
   */
  async getLatestDepositTxId(depositAddress: string): Promise<string | null> {
    const address: string = await this.wallet.getBoardingAddress();
    if (address !== depositAddress)
      throw new Error('Deposit address does not match boarding address');

    const utxos: ExtendedCoin[] = await this.wallet.getBoardingUtxos();
    if (utxos.length === 0) return null;

    return utxos.sort((a, b) => b.createdAt - a.createdAt)[0].txid;
  }

  /**
   * Generates a single-use Bitcoin deposit address
   * for boarding (Arkade protocol)
   */
  async getSingleUseDepositAddress(): Promise<string> {
    return await this.wallet.getBoardingAddress();
  }

  /**
   * Get token balance - not applicable to Bitcoin
   */
  async getTokenBalance(_tokenAddress: string): Promise<bigint> {
    return Promise.reject(new Error('getTokenBalance not applicable to Bitcoin wallets'));
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(
    hash: string
  ): Promise<{ hash: string; blockNumber: number; status: string; gasUsed: number } | null> {
    const address = await this.wallet.getBoardingAddress();
    const txs: ExplorerTransaction[] = await this.wallet.onchainProvider.getTransactions(address);
    if (txs.length === 0) return null;

    const tx = txs.find((t) => t.txid === hash);
    if (!tx) return null;

    return {
      hash: tx.txid,
      blockNumber: tx.status.block_number,
      status: tx.status.confirmed ? 'confirmed' : 'pending',
      gasUsed: 0, // Not applicable to Bitcoin
    };
  }

  /**
   * Returns the account's transaction history
   * @returns
   */
  async getTransfers(options: { direction?: string; limit?: number; skip?: number }): Promise<
    Array<{
      hash: string;
      from: string;
      to: string;
      value: bigint;
      timestamp: number;
      direction: string;
    }>
  > {
    const history: ArkTransaction[] = await this.wallet.getTransactionHistory();
    if (history.length === 0) return [];

    const transfers = history.map((tx) => ({
      hash: tx.key.boardingTxid || tx.key.commitmentTxid || tx.key.arkTxid || '',
      from: '', // TODO: implement sender address extraction if needed
      to: '', // TODO: implement recipient address extraction if needed
      value: BigInt(tx.amount),
      timestamp: tx.createdAt,
      direction: tx.type === TxType.TxReceived ? 'incoming' : 'outgoing',
    }));

    let filtered = transfers.filter((t) => t.hash !== '');

    if (options.direction === 'incoming' || options.direction === 'outgoing') {
      filtered = filtered.filter((t) => t.direction === options.direction);
    }

    const start = options.skip || 0;
    const end = options.limit ? start + options.limit : undefined;

    return filtered.slice(start, end);
  }

  /**
   * Returns confirmed utxos for a deposit address
   * @param depositAddress
   * @param limit
   * @param offset
   * @returns
   */
  async getUtxosForDepositAddress(
    depositAddress: string,
    limit?: number,
    skip?: number
  ): Promise<string[]> {
    const boardingAddress: string = await this.wallet.getBoardingAddress();
    if (boardingAddress !== depositAddress)
      throw new Error('Deposit address does not match boarding address');

    const utxos: ExtendedCoin[] = await this.wallet.getBoardingUtxos();
    if (utxos.length === 0) return [];

    const txids = utxos.map((utxo) => utxo.txid);

    const start = skip || 0;
    const end = limit ? start + limit : undefined;

    return txids.slice(start, end);
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
   * Quote transfer costs - not applicable to Bitcoin
   */
  async quoteTransfer(_options: {
    token: string;
    recipient: string;
    amount: number | bigint;
  }): Promise<Omit<TransferResult, 'hash'>> {
    return Promise.reject(new Error('quoteTransfer not applicable to Bitcoin wallets'));
  }

  /**
   * Verify a message signature
   */
  async verify(message: string, signature: string): Promise<boolean> {
    const signatureBytes = hex.decode(signature);
    const pubkey = this.keyPair.publicKey.slice(1);
    const messageBytes = new TextEncoder().encode(message);
    return await secp.schnorr.verifyAsync(signatureBytes, messageBytes, pubkey);
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
    public readonly arkadeLightning: ArkadeLightning | null = null
  ) {
    super(path, wallet, keyPair, indexerProvider, arkInfo);
    this.keyPair = keyPair;
  }

  /**
   * Completes boarding of given UTXO to the Arkade protocol
   * @param txid
   * @returns object with id, value, and address of settled UTXO
   */
  async claimDeposit(
    txid: string
  ): Promise<Array<{ id: string; value: bigint; address: string }> | undefined> {
    const address: string = await this.wallet.getBoardingAddress();
    const utxos: ExtendedCoin[] = await this.wallet.getBoardingUtxos();
    const utxo = utxos.find((utxo) => utxo.txid === txid);
    if (!utxo) return undefined;

    await this.wallet.settle({ inputs: [utxo] });

    return [{ id: utxo.txid, value: BigInt(utxo.value), address }];
  }

  /**
   * Create a Lightning invoice to receive payment
   * Requires Lightning support to be configured (swapProviderUrl)
   * @param amount Amount in satoshis to receive
   * @param description Optional description for the invoice
   */
  async createLightningInvoice(amount: number, description?: string): Promise<string> {
    if (!this.arkadeLightning) {
      return Promise.reject(
        new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.')
      );
    }

    const response: CreateLightningInvoiceResponse =
      await this.arkadeLightning.createLightningInvoice({
        amount,
        description,
      });

    return response.invoice;
  }

  /**
   * Securely dispose of sensitive data
   */
  dispose(): void {
    this.keyPair.privateKey?.fill(0);
    (this as unknown as { wallet: Wallet | null }).wallet = null;
    void this.arkadeLightning?.dispose();
  }

  /**
   * Gets Lightning receive request by id
   * @param id
   * @returns
   */
  async getLightningReceiveRequest(
    id: string
  ): Promise<{ id: string; invoice: string; memo?: string; status: string; value: number } | null> {
    if (!this.arkadeLightning) {
      return Promise.reject(
        new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.')
      );
    }

    const swaps = await this.arkadeLightning.getPendingReverseSwaps();
    const swap = swaps.find((s) => s.id === id);
    if (!swap) return null;

    const status = await this.arkadeLightning.getSwapStatus(swap.id);
    if (!status) return null;

    return {
      id: swap.id,
      invoice: swap.response.invoice,
      memo: swap.request.description,
      status: status.status as string,
      value: swap.request.invoiceAmount,
    };
  }

  /**
   * Gets fee estimate for Lightning payments
   * @param options
   * @returns
   */
  async getLightningSendFeeEstimate(options: { invoice: string }): Promise<number> {
    if (!this.arkadeLightning) {
      return Promise.reject(
        new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.')
      );
    }

    if (!isValidInvoice(options.invoice)) {
      return Promise.reject(new Error('Invalid Lightning invoice'));
    }

    const { amountSats } = decodeInvoice(options.invoice);
    const estimate = await calculateLightningReceiveFee(BigInt(amountSats), this.arkadeLightning);

    return Number(estimate.fee);
  }

  /**
   * Initialize the wallet with Arkade SDK
   */
  async initialize(): Promise<void> {}

  /**
   * Pays a Lightning invoice
   * @param invoice
   * @returns object with id, invoice, status, and fee
   */
  async payLightningInvoice(
    invoice: string
  ): Promise<{ id: string; invoice: string; status: string; fee: number }> {
    if (!this.arkadeLightning) {
      return Promise.reject(
        new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.')
      );
    }

    if (!isValidInvoice(invoice)) {
      return Promise.reject(new Error('Invalid Lightning invoice'));
    }

    try {
      await this.arkadeLightning.sendLightningPayment({ invoice });

      const swaps = await this.arkadeLightning.getPendingSubmarineSwaps();
      const swap = swaps.find((s) => s.request.invoice === invoice);
      if (!swap) return Promise.reject(new Error('Failed to find submarine swap for the invoice'));

      const result = await this.arkadeLightning.getSwapStatus(swap.id);
      if (!result) return Promise.reject(new Error('Failed to get swap status'));

      return {
        id: swap.id,
        invoice: swap.request.invoice,
        status: result.status as string,
        fee: await this.getLightningSendFeeEstimate({ invoice }),
      };
    } catch (error) {
      return Promise.reject(
        new Error(`Failed to pay Lightning invoice: ${(error as Error).message}`)
      );
    }
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
   * Sign a message with the account's private key
   * Note: Arkade SDK Identity is designed for Bitcoin transaction signing, not arbitrary messages.
   * This is a simplified implementation for WDK compatibility.
   */
  async sign(message: string): Promise<string> {
    const privKey = this.keyPair.privateKey!;
    const msgUint8 = new TextEncoder().encode(message);
    const signature = await secp.schnorr.signAsync(msgUint8, privKey);
    return hex.encode(signature);
  }

  /**
   * Create a read-only version of this account
   */
  toReadOnlyAccount(): Promise<WalletAccountArkadeReadOnly> {
    return Promise.resolve(
      new WalletAccountArkadeReadOnly(
        this.path,
        this.wallet,
        { publicKey: this.keyPair.publicKey },
        this.indexerProvider,
        this.arkInfo
      )
    );
  }

  /**
   * Transfer tokens (ERC-20 specific - not applicable to Bitcoin)
   * Required by official WDK IWalletAccount interface
   */
  transfer(_options: {
    token: string;
    recipient: string;
    amount: number | bigint;
  }): Promise<TransferResult> {
    // Bitcoin doesn't have token transfers like EVM chains
    return Promise.reject(
      new Error('transfer not applicable to Bitcoin wallets - use sendTransaction instead')
    );
  }

  /**
   * Withdraws funds to a Bitcoin address
   * @param options: to - Recipient Bitcoin address, value - Value in satoshis
   * @returns
   */
  async withdraw(options: {
    to: string;
    value: number;
  }): Promise<
    { id: string; to: string; value: number; status: string; fee: number } | null | undefined
  > {
    const { txid, fee } = await send({
      to: options.to,
      amount: BigInt(options.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: null,
    });

    return {
      id: txid,
      to: options.to,
      value: options.value,
      status: 'pending',
      fee: Number(fee),
    };
  }
}
