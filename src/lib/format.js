/**
 * Bitcoin amount formatting utilities
 */

const SATS_PER_BTC = 100_000_000;

/**
 * Convert satoshis to BTC
 * @param {number | bigint} sats
 * @returns {number}
 */
export const fromSatoshis = (sats) => {
  return Number(sats) / SATS_PER_BTC;
};

/**
 * Convert BTC to satoshis
 * @param {number} btc
 * @returns {number}
 */
export const toSatoshis = (btc) => {
  return Math.floor(btc * SATS_PER_BTC);
};

/**
 * Format a number with proper decimal places
 * @param {number} value
 * @param {number} [decimals=8]
 * @returns {string}
 */
export const prettyNumber = (value, decimals = 8) => {
  return value.toFixed(decimals).replace(/\.?0+$/, '');
};

/**
 * Format satoshis as a readable string
 * @param {number | bigint} sats
 * @returns {string}
 */
export const formatSats = (sats) => {
  const btc = fromSatoshis(sats);
  return `${prettyNumber(btc)} BTC`;
};

/**
 * Format satoshis with commas
 * @param {number | bigint} sats
 * @returns {string}
 */
export const formatSatsWithCommas = (sats) => {
  return `${Number(sats).toLocaleString()} sats`;
};
