/**
 * Fee calculation utilities for Arkade transactions
 */

import type { ArkInfo } from '@arkade-os/sdk';
import type { ArkadeSwaps } from '@arkade-os/boltz-swap';

export interface FeeEstimate {
  fee: bigint;
  total: bigint; // amount + fee
}

/**
 * Calculate fees for an off-chain Ark VTXO transaction
 * Uses Bitcoin-style fee rate model from the Ark Service Provider (ASP)
 * @param arkInfo - Ark network information with fee data
 * @returns Fee estimate
 */
export async function calculateOffchainFee(arkInfo: Promise<ArkInfo>): Promise<FeeEstimate> {
  const info = await arkInfo;

  // Off-chain transactions use the txFeeRate (sat/vB) like Bitcoin transactions
  const feeRate = parseFloat(info.fees.txFeeRate);

  // Estimate off-chain Ark VTXO transaction size:
  // VTXOs are smaller than regular Bitcoin transactions (~150 vB estimate)
  const estimatedSize = 150;
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  return {
    fee,
    total: fee, // For quotes, we just return the fee; amount is added separately
  };
}

/**
 * Calculate fees for an on-chain Bitcoin transaction
 * Uses Bitcoin-style fee rate model from the Ark Service Provider (ASP)
 * @param arkInfo - Ark network information with fee data
 * @returns Fee estimate
 */
export async function calculateOnchainFee(arkInfo: Promise<ArkInfo>): Promise<FeeEstimate> {
  const info = await arkInfo;

  // On-chain transactions also use the txFeeRate (sat/vB)
  const feeRate = parseFloat(info.fees.txFeeRate);

  // Estimate on-chain Bitcoin transaction size:
  // - 1 input (P2TR): ~68 vB
  // - 2 outputs (P2TR): ~86 vB
  // - Overhead: ~11 vB
  // Total: ~165 vB
  const estimatedSize = 165;
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  return {
    fee,
    total: fee, // For quotes, we just return the fee; amount is added separately
  };
}

/**
 * Calculate fees for a Lightning invoice payment (submarine swap)
 * Uses actual fee data from the Boltz swap provider
 * @param amount - Amount in satoshis
 * @param lightning - ArkadeSwaps instance with swap provider
 * @returns Fee estimate
 */
export async function calculateLightningFee(
  amount: bigint,
  lightning: ArkadeSwaps | null
): Promise<FeeEstimate> {
  if (!lightning) {
    throw new Error('Lightning support not configured');
  }
    // Get actual fees from the swap provider
    const fees = await lightning.getFees();

    // For submarine swaps (paying Lightning invoices):
    // Fee = (amount * percentage) + minerFees
    const percentageFee = (amount * BigInt(Math.floor(fees.submarine.percentage * 100))) / 10000n;
    const minerFee = BigInt(fees.submarine.minerFees);
    const fee = percentageFee + minerFee;

    return {
      fee,
      total: amount + fee,
    };

}

