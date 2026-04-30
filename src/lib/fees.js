/**
 * Fee calculation utilities for Arkade transactions
 */

/**
 * @typedef {{ fee: bigint; total: bigint }} FeeEstimate
 */

/**
 * Parse and validate the ASP-supplied fee rate. The ASP is trusted but not
 * infallible — a malformed `txFeeRate` would otherwise propagate to
 * `BigInt(Math.ceil(NaN))` and throw deep inside the wallet stack.
 * @param {unknown} raw
 * @returns {number}
 */
export function parseFeeRate(raw) {
  const rate = parseFloat(/** @type {string} */ (raw));
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error(`Invalid Ark fee rate from server: ${String(raw)}`);
  }
  return rate;
}

/**
 * Calculate fees for an off-chain Ark VTXO transaction.
 * Uses Bitcoin-style fee rate model from the Ark Service Provider (ASP).
 * @param {Promise<import('@arkade-os/sdk').ArkInfo>} arkInfo
 * @returns {Promise<FeeEstimate>}
 */
export async function calculateOffchainFee(arkInfo) {
  const info = await arkInfo;
  const feeRate = parseFeeRate(info.fees.txFeeRate);
  const estimatedSize = 150;
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  return { fee, total: fee };
}

/**
 * Calculate fees for an on-chain Bitcoin transaction.
 * Uses Bitcoin-style fee rate model from the Ark Service Provider (ASP).
 * @param {Promise<import('@arkade-os/sdk').ArkInfo>} arkInfo
 * @returns {Promise<FeeEstimate>}
 */
export async function calculateOnchainFee(arkInfo) {
  const info = await arkInfo;
  const feeRate = parseFeeRate(info.fees.txFeeRate);
  // 1 input (P2TR): ~68 vB, 2 outputs (P2TR): ~86 vB, overhead: ~11 vB = ~165 vB
  const estimatedSize = 165;
  const fee = BigInt(Math.ceil(estimatedSize * feeRate));

  return { fee, total: fee };
}

/**
 * Calculate fees for a Lightning invoice payment (submarine swap).
 * Uses actual fee data from the Boltz swap provider.
 * @param {bigint} amount - Amount in satoshis
 * @param {import('@arkade-os/boltz-swap').ArkadeSwaps | null} lightning
 * @returns {Promise<FeeEstimate>}
 */
export async function calculateLightningFee(amount, lightning) {
  if (!lightning) {
    throw new Error('Lightning support not configured');
  }

  const fees = await lightning.getFees();
  const percentageFee = (amount * BigInt(Math.floor(fees.submarine.percentage * 100))) / 10000n;
  const minerFee = BigInt(fees.submarine.minerFees);
  const fee = percentageFee + minerFee;

  return { fee, total: amount + fee };
}
