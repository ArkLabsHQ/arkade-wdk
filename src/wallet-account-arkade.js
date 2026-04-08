import { BIP322 } from '@arkade-os/sdk';
import { sodium_memzero } from 'sodium-universal';
import { calculateOffchainFee } from './lib/fees.js';
import { quoteSend, send } from './lib/send.js';
import { WalletAccountReadOnlyArkade } from './wallet-account-read-only-arkade.js';

/**
 * Full Bitcoin wallet account with Arkade Ark protocol support.
 * Extends the read-only account with signing, sending, and Lightning capabilities.
 */
export class WalletAccountArkade extends WalletAccountReadOnlyArkade {
  /**
   * @param {string} address
   * @param {string} path
   * @param {import('@arkade-os/sdk').IWallet} wallet
   * @param {import('@tetherto/wdk-wallet').KeyPair} keyPair
   * @param {import('@arkade-os/sdk').IndexerProvider} indexerProvider
   * @param {Promise<import('@arkade-os/sdk').ArkInfo>} arkInfo
   * @param {import('@arkade-os/boltz-swap').ArkadeSwaps | null} [arkadeSwaps]
   */
  constructor(address, path, wallet, keyPair, indexerProvider, arkInfo, arkadeSwaps = null) {
    super(address, wallet, indexerProvider, arkInfo);
    /** @readonly */
    this.path = path;
    /** @readonly */
    this.index = parseInt(path.split('/').pop() || '0', 10);
    /** @readonly */
    this.keyPair = keyPair;
    /** @readonly */
    this.arkadeSwaps = arkadeSwaps;
  }

  /**
   * @param {import('@tetherto/wdk-wallet').Transaction} tx
   * @returns {Promise<import('@tetherto/wdk-wallet').TransactionResult>}
   */
  async sendTransaction(tx) {
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

  /**
   * @param {import('@tetherto/wdk-wallet').Transaction} tx
   * @returns {Promise<Omit<import('@tetherto/wdk-wallet').TransactionResult, 'hash'>>}
   */
  async quoteSendTransaction(tx) {
    const estimate = await quoteSend({
      to: tx.to,
      amount: BigInt(tx.value),
      wallet: this.wallet,
      arkInfo: this.arkInfo,
      lightning: this.arkadeSwaps,
    });

    return { fee: estimate.fee };
  }

  /**
   * @param {{ token: string; recipient: string; amount: number | bigint }} options
   * @returns {Promise<import('@tetherto/wdk-wallet').TransferResult>}
   */
  async transfer(options) {
    const txid = await this.wallet.send({
      address: options.recipient,
      assets: [{ assetId: options.token, amount: Number(options.amount) }],
    });

    const feeEstimate = await calculateOffchainFee(this.arkInfo);
    return { hash: txid, fee: feeEstimate.fee };
  }

  /**
   * @param {string} message
   * @returns {Promise<string>}
   */
  async sign(message) {
    return BIP322.sign(message, this.wallet.identity);
  }

  /** @returns {Promise<WalletAccountReadOnlyArkade>} */
  toReadOnlyAccount() {
    return Promise.resolve(
      new WalletAccountReadOnlyArkade(
        /** @type {string} */ (this._address),
        this.wallet,
        this.indexerProvider,
        this.arkInfo
      )
    );
  }

  dispose() {
    if (this.keyPair.privateKey) {
      sodium_memzero(this.keyPair.privateKey);
    }
    void this.arkadeSwaps?.dispose();
    if (typeof super.dispose === 'function') super.dispose();
  }

  // ==========================================
  // Lightning Receive Methods
  // ==========================================

  /**
   * Create a Lightning invoice to receive payment.
   * Requires Lightning support to be configured (swapProviderUrl).
   * @param {number} amount - Amount in satoshis to receive
   * @param {string} [description] - Optional description for the invoice
   * @returns {Promise<{ invoice: string; paymentHash: string }>}
   */
  async createLightningInvoice(amount, description) {
    if (!this.arkadeSwaps) {
      throw new Error('Lightning support not configured. Provide swapProviderUrl in wallet config.');
    }

    const response = await this.arkadeSwaps.createLightningInvoice({
      amount,
      description,
    });

    return { invoice: response.invoice, paymentHash: response.paymentHash };
  }
}
