/**
 * Bitcoin amount formatting utilities
 */

const SATS_PER_BTC = 100_000_000;

/**
 * Convert satoshis to BTC
 * @param sats - Amount in satoshis
 * @returns Amount in BTC
 */
export const fromSatoshis = (sats: number | bigint): number => {
  return Number(sats) / SATS_PER_BTC;
};

/**
 * Convert BTC to satoshis
 * @param btc - Amount in BTC
 * @returns Amount in satoshis
 */
export const toSatoshis = (btc: number): number => {
  return Math.floor(btc * SATS_PER_BTC);
};

/**
 * Format a number with proper decimal places
 * @param value - Number to format
 * @param decimals - Number of decimal places (default: 8 for BTC)
 * @returns Formatted string
 */
export const prettyNumber = (value: number, decimals: number = 8): string => {
  return value.toFixed(decimals).replace(/\.?0+$/, '');
};

/**
 * Format satoshis as a readable string
 * @param sats - Amount in satoshis
 * @returns Formatted string (e.g., "0.00001234 BTC")
 */
export const formatSats = (sats: number | bigint): string => {
  const btc = fromSatoshis(sats);
  return `${prettyNumber(btc)} BTC`;
};

/**
 * Format satoshis with commas
 * @param sats - Amount in satoshis
 * @returns Formatted string (e.g., "1,234,567 sats")
 */
export const formatSatsWithCommas = (sats: number | bigint): string => {
  return `${Number(sats).toLocaleString()} sats`;
};
