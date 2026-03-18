/**
 * Transaction sending utilities with automatic routing based on destination type
 */

import type { IWallet, ArkInfo } from '@arkade-os/sdk';
import type { ArkadeSwaps } from '@arkade-os/boltz-swap';
import {
  isArkAddress,
  isBTCAddress,
  isLightningInvoice,
} from './address.js';
import { isBip21, decodeBip21 } from './bip21.js';
import { decodeInvoice } from './bolt11.js';
import { calculateOffchainFee, calculateOnchainFee, calculateLightningFee, type FeeEstimate } from './fees.js';

export enum TransactionType {
  ARK_OFFCHAIN = 'ark_offchain',
  BITCOIN_ONCHAIN = 'bitcoin_onchain',
  LIGHTNING = 'lightning',
  EMAIL = 'email',
  UNKNOWN = 'unknown',
}

export interface SendResult {
  txid: string;
  type: TransactionType;
  fee: bigint;
}

export interface SendOptions {
  to: string;
  amount: bigint;
  wallet: IWallet;
  arkInfo: Promise<ArkInfo>;
  lightning?: ArkadeSwaps | null;
}

/**
 * Detect the transaction type based on the destination
 */
export function detectTransactionType(destination: string): TransactionType {
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
    // BIP21 can contain multiple payment methods, we'll handle it specially
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
 */
export async function quoteSend(options: SendOptions): Promise<FeeEstimate> {
  const { to, amount, arkInfo, lightning } = options;
  const type = detectTransactionType(to);

  switch (type) {
    case TransactionType.ARK_OFFCHAIN: {
      // Off-chain Ark transaction (VTXO to VTXO)
      return calculateOffchainFee(arkInfo);
    }

    case TransactionType.BITCOIN_ONCHAIN: {
      // On-chain Bitcoin transaction
      return calculateOnchainFee(arkInfo);
    }

    case TransactionType.LIGHTNING: {
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }
      // For Lightning invoices, decode to get the amount
      const invoice = decodeInvoice(to);
      const invoiceAmount = BigInt(invoice.amountSats);

      // If amount is specified, it should match the invoice
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
 * Send a transaction to the specified destination
 * Automatically routes to the appropriate method based on address type
 */
export async function send(options: SendOptions): Promise<SendResult> {
  const { to, amount, wallet, arkInfo, lightning } = options;
  const type = detectTransactionType(to);

  switch (type) {
    case TransactionType.ARK_OFFCHAIN: {
      // Off-chain Ark transaction (VTXO to VTXO)
      const txid = await wallet.sendBitcoin({
        address: to,
        amount: Number(amount),
      });

      const feeEstimate = await calculateOffchainFee(arkInfo);

      return {
        txid,
        type: TransactionType.ARK_OFFCHAIN,
        fee: feeEstimate.fee,
      };
    }

    case TransactionType.BITCOIN_ONCHAIN: {
      // On-chain Bitcoin transaction
      const txid = await wallet.sendBitcoin({
        address: to,
        amount: Number(amount),
      });

      const feeEstimate = await calculateOnchainFee(arkInfo);

      return {
        txid,
        type: TransactionType.BITCOIN_ONCHAIN,
        fee: feeEstimate.fee,
      };
    }

    case TransactionType.LIGHTNING: {
      // Lightning invoice payment
      if (!lightning) {
        throw new Error('Lightning support not configured');
      }

      const invoice = decodeInvoice(to);
      const invoiceAmount = BigInt(invoice.amountSats);

      // If amount is specified, it should match the invoice
      if (amount > 0n && amount !== invoiceAmount) {
        throw new Error('Amount mismatch with Lightning invoice');
      }

      const result = await lightning.sendLightningPayment({
        invoice: to,
      });

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
