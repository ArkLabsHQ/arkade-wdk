import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { ArkInfo, ArkTransaction, BIP322 } from '@arkade-os/sdk';
import type { IReadonlyWallet, IndexerProvider } from '@arkade-os/sdk';
import type {
  Transaction,
  TransactionResult,
  TransferResult,
} from '@tetherto/wdk-wallet';
import { calculateOffchainFee } from './lib/fees.js';

/**
 * Read-only Bitcoin wallet account with Arkade Ark protocol support.
 * Extends the WDK base class to inherit standard address handling
 * and provide query-only access to balances, history, and fee quotes.
 */
export class WalletAccountReadOnlyArkade extends WalletAccountReadOnly {
  constructor(
    address: string,
    protected readonly wallet: IReadonlyWallet,
    protected readonly indexerProvider: IndexerProvider,
    protected readonly arkInfo: Promise<ArkInfo>,
  ) {
    super(address);
  }

  /**
   * Get the on-chain Bitcoin boarding address for initial deposits
   */
  async getBoardingAddress(): Promise<string> {
    return await this.wallet.getBoardingAddress();
  }

  async getBalance(): Promise<bigint> {
    const balance = await this.wallet.getBalance();
    return BigInt(balance.total);
  }

  async verify(message: string, signature: string): Promise<boolean> {
    return BIP322.verify(message, signature, await this.getAddress());
  }

  async getTransactionReceipt(hash: string): Promise<unknown> {
    const res = await this.indexerProvider.getVirtualTxs([hash]);
    return res.txs.length > 0 ? res.txs[0] : null;
  }

  async getTransactionHistory(): Promise<ArkTransaction[]> {
    return await this.wallet.getTransactionHistory();
  }

  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const balance = await this.wallet.getBalance();
    const asset = balance.assets.find(
      (a: { assetId: string; amount: number }) => a.assetId === tokenAddress,
    );
    return asset ? BigInt(asset.amount) : 0n;
  }

  async quoteSendTransaction(_tx: Transaction): Promise<Omit<TransactionResult, 'hash'>> {
    const feeEstimate = await calculateOffchainFee(this.arkInfo);
    return { fee: feeEstimate.fee };
  }

  async quoteTransfer(_options: {
    token: string;
    recipient: string;
    amount: number | bigint;
  }): Promise<Omit<TransferResult, 'hash'>> {
    const feeEstimate = await calculateOffchainFee(this.arkInfo);
    return { fee: feeEstimate.fee };
  }
}
