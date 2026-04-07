/**
 * Transaction sending utilities with automatic routing based on destination type
 */

import { isArkAddress, isBTCAddress, isLightningInvoice } from './address.js';
import { isBip21, decodeBip21 } from './bip21.js';
import { decodeInvoice } from './bolt11.js';
import { calculateOffchainFee, calculateOnchainFee, calculateLightningFee } from './fees.js';

/** @enum {string} */
export const TransactionType = /** @type {const} */ ({
  ARK_OFFCHAIN: 'ark_offchain',
  BITCOIN_ONCHAIN: 'bitcoin_onchain',
  LIGHTNING: 'lightning',
  EMAIL: 'email',
  UNKNOWN: 'unknown',
});

/**
 * @typedef {{ txid: string; type: string; fee: bigint }} SendResult
 */

/**
 * @typedef {{
 *   to: string;
 *   amount: bigint;
 *   wallet: import('@arkade-os/sdk').IWallet;
 *   arkInfo: Promise<import('@arkade-os/sdk').ArkInfo>;
 *   lightning?: import('@arkade-os/boltz-swap').ArkadeSwaps | null;
 * }} SendOptions
 */

/**
 * Detect the transaction type based on the destination
 * @param {string} destination
 * @returns {string}
 */
export function detectTransactionType(destination) {
  if (isArkAddress(destination)) {
    return TransactionType.ARK_OFFCHAIN;
  }
  if (isBTCAddress(destination)) {
    return TransactionType.BITCOIN_ONCHAIN;
  }
  if (isLightningInvoice(destination)) {
    return TransactionType.LIGHTNING;
  }
  if (isBip21(destination)) {
    const decoded = decodeBip21(destination);
    if (decoded.invoice) {
      return TransactionType.LIGHTNING;
    }
    if (decoded.arkAddress) {
      return TransactionType.ARK_OFFCHAIN;
    }
    if (decoded.address) {
      return TransactionType.BITCOIN_ONCHAIN;
    }
  }
  return TransactionType.UNKNOWN;
}

/**
 * Quote a transaction fee without sending
 * @param {SendOptions} options
 * @returns {Promise<import('./fees.js').FeeEstimate>}
 */
export async function quoteSend(options) {
  const { to, amount, arkInfo, lightning } = options;
  const type = detectTransactionType(to);

  switch (type) {
    case TransactionType.ARK_OFFCHAIN: {
      return calculateOffchainFee(arkInfo);
    }

    case TransactionType.BITCOIN_ONCHAIN: {
      return calculateOnchainFee(arkInfo);
    }

    case TransactionType.LIGHTNING: {
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }
      const invoice = decodeInvoice(to);
      const invoiceAmount = BigInt(invoice.amountSats);

      if (amount > 0n && amount !== invoiceAmount) {
        throw new Error('Amount mismatch with Lightning invoice');
      }

      return calculateLightningFee(invoiceAmount, lightning);
    }

    case TransactionType.EMAIL: {
      throw new Error('Email payments not yet supported');
    }

    default: {
      throw new Error(`Unknown destination type: ${to}`);
    }
  }
}

/**
 * Send a transaction to the specified destination.
 * Automatically routes to the appropriate method based on address type.
 * @param {SendOptions} options
 * @returns {Promise<SendResult>}
 */
export async function send(options) {
  const { to, amount, wallet, arkInfo, lightning } = options;
  const type = detectTransactionType(to);

  switch (type) {
    case TransactionType.ARK_OFFCHAIN: {
      const txid = await wallet.sendBitcoin({
        address: to,
        amount: Number(amount),
      });
      const feeEstimate = await calculateOffchainFee(arkInfo);
      return { txid, type: TransactionType.ARK_OFFCHAIN, fee: feeEstimate.fee };
    }

    case TransactionType.BITCOIN_ONCHAIN: {
      const txid = await wallet.sendBitcoin({
        address: to,
        amount: Number(amount),
      });
      const feeEstimate = await calculateOnchainFee(arkInfo);
      return { txid, type: TransactionType.BITCOIN_ONCHAIN, fee: feeEstimate.fee };
    }

    case TransactionType.LIGHTNING: {
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }

      const invoice = decodeInvoice(to);
      const invoiceAmount = BigInt(invoice.amountSats);

      if (amount > 0n && amount !== invoiceAmount) {
        throw new Error('Amount mismatch with Lightning invoice');
      }

      const result = await lightning.sendLightningPayment({ invoice: to });
      const feeEstimate = await calculateLightningFee(invoiceAmount, lightning);
      return {
        txid: result.preimage || invoice.paymentHash,
        type: TransactionType.LIGHTNING,
        fee: feeEstimate.fee,
      };
    }

    case TransactionType.EMAIL: {
      throw new Error('Email payments not yet supported');
    }

    default: {
      throw new Error(`Unknown destination type: ${to}`);
    }
  }
}
