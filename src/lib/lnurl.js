/**
 * LNURL and Lightning Address utilities
 * Enables receiving payments via Lightning addresses (user@domain.com) and LNURL
 */

import { bech32, utf8 } from '@scure/base';

const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * @typedef {{
 *   maxSendable: number;
 *   minSendable: number;
 *   callback: string;
 *   metadata: string;
 *   commentAllowed?: number;
 *   transferAmounts?: { method: string; available: boolean }[];
 * }} LnUrlResponse
 */

/**
 * @typedef {{
 *   expiryDate: string;
 *   address: string;
 *   hint: string;
 * }} ArkMethodResponse
 */

/**
 * @typedef {{ pr: string }} LnUrlCallbackResponse
 */

/** @param {string} data */
const isValidBech32 = (data) => {
  try {
    bech32.decodeToBytes(data);
    return true;
  } catch {
    return false;
  }
};

/** @param {string} data */
export const isLnUrl = (data) => {
  return data.toLowerCase().startsWith('lnurl') && isValidBech32(data);
};

/** @param {string} data */
export const isLightningAddress = (data) => {
  return data.includes('@') && EMAIL_REGEX.test(data);
};

/** @param {string} data */
export const isValidLnUrl = (data) => {
  return isLnUrl(data) || isLightningAddress(data);
};

/**
 * Get the callback URL for an LNURL or Lightning address
 * @param {string} lnurl
 * @returns {string}
 */
export const getCallbackUrl = (lnurl) => {
  if (isLightningAddress(lnurl)) {
    const [user, domain] = lnurl.split('@');
    return `https://${domain}/.well-known/lnurlp/${user}`;
  }
  const { bytes } = bech32.decodeToBytes(lnurl);
  return utf8.encode(bytes);
};

/**
 * @template T
 * @param {Response} response
 * @returns {Promise<T>}
 */
const checkResponse = async (response) => {
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  return /** @type {Promise<T>} */ (response.json());
};

/**
 * @param {number} amountMsat
 * @param {LnUrlResponse} data
 * @returns {LnUrlResponse}
 */
const checkLnUrlResponse = (amountMsat, data) => {
  if (amountMsat < data.minSendable || amountMsat > data.maxSendable) {
    throw new Error(
      `Amount ${amountMsat / 1000} sats is outside LNURL range: ` +
        `${data.minSendable / 1000} - ${data.maxSendable / 1000} sats`
    );
  }
  return data;
};

/**
 * @param {number} amountMsat
 * @param {string} note
 * @param {LnUrlResponse} data
 * @returns {Promise<string>}
 */
const fetchLnUrlInvoice = async (amountMsat, note, data) => {
  let url = `${data.callback}?amount=${amountMsat}`;
  if (note && data.commentAllowed && note.length <= data.commentAllowed) {
    url += `&comment=${encodeURIComponent(note)}`;
  }
  const res = await fetch(url).then(
    /** @type {(r: Response) => Promise<LnUrlCallbackResponse>} */ (checkResponse)
  );
  return res.pr;
};

/**
 * Get LNURL metadata/limits
 * @param {string} lnurl - LNURL or Lightning address
 * @returns {Promise<LnUrlResponse>}
 */
export const checkLnUrlConditions = async (lnurl) => {
  const url = getCallbackUrl(lnurl);
  const response = await fetch(url);
  return /** @type {Promise<LnUrlResponse>} */ (checkResponse(response));
};

/**
 * Fetch a Lightning invoice from an LNURL or Lightning address
 * @param {string} lnurl - LNURL or Lightning address (e.g., user@domain.com)
 * @param {number} sats - Amount in satoshis
 * @param {string} [note=''] - Optional payment note/comment
 * @returns {Promise<string>} BOLT11 invoice
 */
export const fetchInvoice = async (lnurl, sats, note = '') => {
  const url = getCallbackUrl(lnurl);
  const amountMsat = Math.round(sats * 1000);

  const data = await fetch(url).then(
    /** @type {(r: Response) => Promise<LnUrlResponse>} */ (checkResponse)
  );
  checkLnUrlResponse(amountMsat, data);
  return fetchLnUrlInvoice(amountMsat, note, data);
};

/**
 * Fetch Ark address from LNURL (if supported).
 * Some LNURL servers support Ark protocol directly.
 * @param {string} lnurl - LNURL or Lightning address
 * @returns {Promise<ArkMethodResponse>}
 */
export const fetchArkAddress = async (lnurl) => {
  const url = getCallbackUrl(lnurl) + '?method=ark';
  const response = await fetch(url);
  return /** @type {Promise<ArkMethodResponse>} */ (checkResponse(response));
};

/**
 * Parse minimum and maximum amounts from LNURL response
 * @param {string} lnurl - LNURL or Lightning address
 * @returns {Promise<{ minSats: number; maxSats: number }>}
 */
export const getLnUrlLimits = async (lnurl) => {
  const data = await checkLnUrlConditions(lnurl);
  return {
    minSats: Math.ceil(data.minSendable / 1000),
    maxSats: Math.floor(data.maxSendable / 1000),
  };
};

/**
 * Extract recipient description from LNURL metadata
 * @param {string} metadata
 * @returns {string | null}
 */
export const extractRecipientFromMetadata = (metadata) => {
  try {
    const parsed = JSON.parse(metadata);
    const textEntry = parsed.find((/** @type {string[]} */ entry) => entry[0] === 'text/plain');
    return textEntry?.[1] ?? null;
  } catch {
    return null;
  }
};
