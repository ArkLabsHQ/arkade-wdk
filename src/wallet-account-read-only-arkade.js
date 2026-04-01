import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { BIP322 } from '@arkade-os/sdk';
import { calculateOffchainFee } from './lib/fees.js';

/**
 * Read-only Bitcoin wallet account with Arkade Ark protocol support.
 * Extends the WDK base class to inherit standard address handling
 * and provide query-only access to balances, history, and fee quotes.
 */
export class WalletAccountReadOnlyArkade extends WalletAccountReadOnly {
  /**
   * @param {string} address
   * @param {import('@arkade-os/sdk').IReadonlyWallet} wallet
   * @param {import('@arkade-os/sdk').IndexerProvider} indexerProvider
   * @param {Promise<import('@arkade-os/sdk').ArkInfo>} arkInfo
   */
  constructor(address, wallet, indexerProvider, arkInfo) {
    super(address);
    /** @protected */
    this.wallet = wallet;
    /** @protected */
    this.indexerProvider = indexerProvider;
    /** @protected */
    this.arkInfo = arkInfo;
  }

  /**
   * Get the on-chain Bitcoin boarding address for initial deposits
   * @returns {Promise<string>}
   */
  async getBoardingAddress() {
    return await this.wallet.getBoardingAddress();
  }

  /** @returns {Promise<bigint>} */
  async getBalance() {
    const balance = await this.wallet.getBalance();
    return BigInt(balance.total);
  }

  /**
   * @param {string} message
   * @param {string} signature
   * @returns {Promise<boolean>}
   */
  async verify(message, signature) {
    return BIP322.verify(message, signature, await this.getAddress());
  }

  /**
   * @param {string} hash
   * @returns {Promise<unknown>}
   */
  async getTransactionReceipt(hash) {
    const res = await this.indexerProvider.getVirtualTxs([hash]);
    return res.txs.length > 0 ? res.txs[0] : null;
  }

  /** @returns {Promise<import('@arkade-os/sdk').ArkTransaction[]>} */
  async getTransactionHistory() {
    return await this.wallet.getTransactionHistory();
  }

  /**
   * @param {string} tokenAddress
   * @returns {Promise<bigint>}
   */
  async getTokenBalance(tokenAddress) {
    const balance = await this.wallet.getBalance();
    const asset = balance.assets.find(
      (/** @type {{ assetId: string; amount: number }} */ a) => a.assetId === tokenAddress
    );
    return asset ? BigInt(asset.amount) : 0n;
  }

  /**
   * @param {import('@tetherto/wdk-wallet').Transaction} _tx
   * @returns {Promise<Omit<import('@tetherto/wdk-wallet').TransactionResult, 'hash'>>}
   */
  async quoteSendTransaction(_tx) {
    const feeEstimate = await calculateOffchainFee(this.arkInfo);
    return { fee: feeEstimate.fee };
  }

  /**
   * @param {{ token: string; recipient: string; amount: number | bigint }} _options
   * @returns {Promise<Omit<import('@tetherto/wdk-wallet').TransferResult, 'hash'>>}
   */
  async quoteTransfer(_options) {
    const feeEstimate = await calculateOffchainFee(this.arkInfo);
    return { fee: feeEstimate.fee };
  }
}
