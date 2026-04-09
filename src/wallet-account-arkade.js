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
    /** @type {import('@arkade-os/sdk').IReadonlyWallet} */
    const readonlyWallet = {
      identity: this.wallet.identity,
      getAddress: () => this.wallet.getAddress(),
      getBoardingAddress: () => this.wallet.getBoardingAddress(),
      getBalance: () => this.wallet.getBalance(),
      getVtxos: (/** @type {import('@arkade-os/sdk').GetVtxosFilter} */ filter) => this.wallet.getVtxos(filter),
      getBoardingUtxos: () => this.wallet.getBoardingUtxos(),
      getTransactionHistory: () => this.wallet.getTransactionHistory(),
      getContractManager: () => this.wallet.getContractManager(),
      assetManager: this.wallet.assetManager,
    };
    return Promise.resolve(
      new WalletAccountReadOnlyArkade(
        /** @type {string} */ (this._address),
        readonlyWallet,
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
    // Forward-compat: WalletAccountReadOnly currently has no dispose(),
    // call it if a future base class adds one.
    // @ts-expect-error super.dispose is not declared on the base class
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
    const swaps = this._requireSwaps();
    const response = await swaps.createLightningInvoice({ amount, description });
    return { invoice: response.invoice, paymentHash: response.paymentHash };
  }

  /**
   * Wait for an incoming Lightning payment to settle and claim the resulting VTXO.
   * The invoice must have been created via {@link createLightningInvoice} on this
   * account so the matching pending reverse swap is in storage. The BOLT11
   * invoice is stored on `swap.response.invoice`, not at the top level.
   * @param {string} invoice - BOLT11 invoice previously created via createLightningInvoice
   * @returns {Promise<{ txid: string }>} The claim transaction id
   */
  async waitForLightningPayment(invoice) {
    const swaps = this._requireSwaps();
    const pending = await swaps.getPendingReverseSwaps();
    const swap = pending.find((s) => s.response?.invoice === invoice);
    if (!swap) {
      throw new Error(`No pending reverse swap found for invoice ${invoice}`);
    }
    return swaps.waitAndClaim(swap);
  }

  // ==========================================
  // Lightning Lifecycle Queries
  // ==========================================

  /**
   * List pending Lightning receives (reverse swaps awaiting settlement).
   * @returns {Promise<import('@arkade-os/boltz-swap').PendingReverseSwap[]>}
   */
  async getPendingLightningReceives() {
    return this._requireSwaps().getPendingReverseSwaps();
  }

  /**
   * List pending Lightning sends (submarine swaps awaiting settlement).
   * @returns {Promise<import('@arkade-os/boltz-swap').PendingSubmarineSwap[]>}
   */
  async getPendingLightningSends() {
    return this._requireSwaps().getPendingSubmarineSwaps();
  }

  /**
   * Full swap history (reverse + submarine + chain), newest first.
   * @returns {Promise<(
   *   import('@arkade-os/boltz-swap').PendingReverseSwap |
   *   import('@arkade-os/boltz-swap').PendingSubmarineSwap |
   *   import('@arkade-os/boltz-swap').PendingChainSwap
   * )[]>}
   */
  async getSwapHistory() {
    return this._requireSwaps().getSwapHistory();
  }

  /**
   * Lightning swap min/max limits from the swap provider.
   * @returns {Promise<import('@arkade-os/boltz-swap').LimitsResponse>}
   */
  async getLightningLimits() {
    return this._requireSwaps().getLimits();
  }

  /**
   * Lightning swap fee schedule from the swap provider.
   * @returns {Promise<import('@arkade-os/boltz-swap').FeesResponse>}
   */
  async getLightningFees() {
    return this._requireSwaps().getFees();
  }

  /**
   * @private
   * @returns {import('@arkade-os/boltz-swap').ArkadeSwaps}
   */
  _requireSwaps() {
    if (!this.arkadeSwaps) {
      throw new Error(
        'Lightning support not configured. Provide swapProviderUrl in wallet config.'
      );
    }
    return this.arkadeSwaps;
  }
}
