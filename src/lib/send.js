/**
 * Transaction sending utilities with automatic routing based on destination type
 */

import { isArkAddress, isBTCAddress, isLightningInvoice } from './address.js';
import { isBip21, decodeBip21 } from './bip21.js';
import { decodeInvoice } from './bolt11.js';
import { calculateOffchainFee, calculateOnchainFee, calculateLightningFee } from './fees.js';
import { isLightningAddress, isLnUrl, fetchInvoice, fetchArkAddress } from './lnurl.js';

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
 * Like {@link SendOptions} but only requires read access — quoting a fee
 * never signs, so a read-only wallet is sufficient.
 * @typedef {Omit<SendOptions, 'wallet'> & {
 *   wallet: import('@arkade-os/sdk').IReadonlyWallet;
 * }} QuoteOptions
 */

/**
 * Resolve a possibly-BIP21 destination string into the inner address/invoice
 * actually consumed by the wallet, plus any amount carried in the URI.
 *
 * BIP21 wraps a Bitcoin address with optional `?ark=`, `?lightning=`, and
 * `?amount=` parameters. Explicit `?ark=` parameters take priority over LNURL
 * fallback routes.
 *
 * @param {string} destination
 * @returns {{ resolved: string; bip21Sats?: number }}
 */
export function resolveDestination(destination) {
  if (!isBip21(destination)) {
    return { resolved: destination };
  }
  const decoded = decodeBip21(destination);
  const resolved = decoded.invoice ?? decoded.arkAddress ?? decoded.lnurl ?? decoded.address;
  if (!resolved) {
    throw new Error(`BIP21 URI has no usable destination: ${destination}`);
  }
  return { resolved, bip21Sats: decoded.satoshis };
}

/**
 * Detect the transaction type based on the destination.
 * Accepts BIP21 URIs and resolves them to the inner destination type.
 * @param {string} destination
 * @returns {string}
 */
export function detectTransactionType(destination) {
  const { resolved } = isBip21(destination)
    ? resolveDestination(destination)
    : { resolved: destination };

  if (isArkAddress(resolved)) {
    return TransactionType.ARK_OFFCHAIN;
  }
  if (isBTCAddress(resolved)) {
    return TransactionType.BITCOIN_ONCHAIN;
  }
  if (isLightningInvoice(resolved)) {
    return TransactionType.LIGHTNING;
  }
  if (isLightningAddress(resolved) || isLnUrl(resolved)) {
    return TransactionType.EMAIL;
  }
  return TransactionType.UNKNOWN;
}

/**
 * Reconcile an explicit `options.amount` with an amount carried in a BIP21 URI.
 * - If only one is set, use that one.
 * - If both are set and they agree, use either.
 * - If both are set and they disagree, throw.
 * @param {bigint} optionsAmount
 * @param {number | undefined} bip21Sats
 * @returns {bigint}
 */
function reconcileAmount(optionsAmount, bip21Sats) {
  if (bip21Sats === undefined) return optionsAmount;
  const bip21Amount = BigInt(bip21Sats);
  if (optionsAmount === 0n) return bip21Amount;
  if (optionsAmount !== bip21Amount) {
    throw new Error(
      `Amount mismatch: options.amount=${optionsAmount} but BIP21 URI specifies ${bip21Amount}`
    );
  }
  return optionsAmount;
}

/**
 * @param {string} destination
 * @returns {Promise<string | null>}
 */
async function fetchArkAddressIfAvailable(destination) {
  try {
    const response = await fetchArkAddress(destination);
    return response.address && isArkAddress(response.address) ? response.address : null;
  } catch {
    return null;
  }
}

/** @param {bigint} amount */
function assertPositiveAmount(amount) {
  if (amount <= 0n) {
    throw new Error('Amount required for LNURL payment');
  }
}

/**
 * Quote a transaction fee without sending
 * @param {QuoteOptions} options
 * @returns {Promise<import('./fees.js').FeeEstimate>}
 */
export async function quoteSend(options) {
  const { to, amount, arkInfo, lightning } = options;
  const { resolved, bip21Sats } = resolveDestination(to);
  const type = detectTransactionType(resolved);
  const effectiveAmount = reconcileAmount(amount, bip21Sats);

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
      const invoice = decodeInvoice(resolved);
      const invoiceAmount = BigInt(invoice.amountSats);

      if (effectiveAmount > 0n && effectiveAmount !== invoiceAmount) {
        throw new Error('Amount mismatch with Lightning invoice');
      }

      return calculateLightningFee(invoiceAmount, lightning);
    }

    case TransactionType.EMAIL: {
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }
      assertPositiveAmount(effectiveAmount);

      const arkAddress = await fetchArkAddressIfAvailable(resolved);
      if (arkAddress) {
        return calculateOffchainFee(arkInfo);
      }

      return calculateLightningFee(effectiveAmount, lightning);
    }

    default: {
      throw new Error(`Unknown destination type: ${to}`);
    }
  }
}

/**
 * Send a transaction to the specified destination.
 * Automatically routes to the appropriate method based on address type.
 * Accepts BIP21 URIs and resolves them to their inner destination.
 * @param {SendOptions} options
 * @returns {Promise<SendResult>}
 */
export async function send(options) {
  const { to, amount, wallet, arkInfo, lightning } = options;
  const { resolved, bip21Sats } = resolveDestination(to);
  const type = detectTransactionType(resolved);
  const effectiveAmount = reconcileAmount(amount, bip21Sats);

  switch (type) {
    case TransactionType.ARK_OFFCHAIN: {
      const txid = await wallet.sendBitcoin({
        address: resolved,
        amount: Number(effectiveAmount),
      });
      const feeEstimate = await calculateOffchainFee(arkInfo);
      return { txid, type: TransactionType.ARK_OFFCHAIN, fee: feeEstimate.fee };
    }

    case TransactionType.BITCOIN_ONCHAIN: {
      const txid = await wallet.sendBitcoin({
        address: resolved,
        amount: Number(effectiveAmount),
      });
      const feeEstimate = await calculateOnchainFee(arkInfo);
      return { txid, type: TransactionType.BITCOIN_ONCHAIN, fee: feeEstimate.fee };
    }

    case TransactionType.LIGHTNING: {
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }

      const invoice = decodeInvoice(resolved);
      const invoiceAmount = BigInt(invoice.amountSats);

      if (effectiveAmount > 0n && effectiveAmount !== invoiceAmount) {
        throw new Error('Amount mismatch with Lightning invoice');
      }

      const result = await lightning.sendLightningPayment({ invoice: resolved });
      const feeEstimate = await calculateLightningFee(invoiceAmount, lightning);
      return {
        txid: result.preimage || invoice.paymentHash,
        type: TransactionType.LIGHTNING,
        fee: feeEstimate.fee,
      };
    }

    case TransactionType.EMAIL: {
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }
      assertPositiveAmount(effectiveAmount);

      const arkAddress = await fetchArkAddressIfAvailable(resolved);
      if (arkAddress) {
        const txid = await wallet.sendBitcoin({
          address: arkAddress,
          amount: Number(effectiveAmount),
        });
        const feeEstimate = await calculateOffchainFee(arkInfo);
        return { txid, type: TransactionType.ARK_OFFCHAIN, fee: feeEstimate.fee };
      }

      const invoice = await fetchInvoice(resolved, Number(effectiveAmount));
      const decoded = decodeInvoice(invoice);
      const invoiceAmount = BigInt(decoded.amountSats);

      if (invoiceAmount !== effectiveAmount) {
        throw new Error('Amount mismatch with LNURL invoice');
      }

      const result = await lightning.sendLightningPayment({ invoice });
      const feeEstimate = await calculateLightningFee(invoiceAmount, lightning);
      return {
        txid: result.preimage || decoded.paymentHash,
        type: TransactionType.LIGHTNING,
        fee: feeEstimate.fee,
      };
    }

    default: {
      throw new Error(`Unknown destination type: ${to}`);
    }
  }
}
