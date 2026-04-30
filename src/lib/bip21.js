// https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki
// bitcoin:<address>[?amount=<amount>][?label=<label>][?message=<message>]

import { fromSatoshis, prettyNumber, toSatoshis } from './format.js';
import { isArkAddress } from './address.js';

/**
 * @typedef {{
 *   address?: string;
 *   arkAddress?: string;
 *   satoshis?: number;
 *   invoice?: string;
 *   lnurl?: string;
 * }} Bip21Decoded
 */

/**
 * Decode a BIP21 URI
 * @param {string} uri
 * @returns {Bip21Decoded}
 */
export const decodeBip21 = (uri) => {
  /** @type {Bip21Decoded} */
  const result = {
    address: undefined,
    satoshis: undefined,
    invoice: undefined,
    lnurl: undefined,
  };

  const bip21Url = uri.trim();

  if (!bip21Url.toLowerCase().startsWith('bitcoin:')) {
    throw new Error('Invalid BIP21 URI');
  }

  const urlWithoutPrefix = bip21Url.slice(8);
  const [address, queryString] = urlWithoutPrefix.split('?');

  result.address = address;

  if (queryString) {
    const params = new URLSearchParams(queryString);

    if (params.has('ark')) {
      const arkAddress = params.get('ark') ?? '';
      if (isArkAddress(arkAddress)) result.arkAddress = arkAddress;
    }

    if (params.has('amount')) {
      const amount = parseFloat(params.get('amount') ?? '');
      if (isNaN(amount) || amount < 0 || !isFinite(amount)) throw new Error('Invalid amount');
      result.satoshis = toSatoshis(amount);
    }

    const lightning = params.get('lightning') ?? '';
    if (lightning.startsWith('lnurl')) {
      result.lnurl = lightning;
    } else if (lightning.startsWith('ln')) {
      result.invoice = lightning;
    }
  }

  return result;
};

/**
 * @param {string} address
 * @param {string} arkAddress
 * @param {string} invoice
 * @param {number} sats
 * @returns {string}
 */
export const encodeBip21 = (address, arkAddress, invoice, sats) => {
  return (
    `bitcoin:${address}` +
    `?ark=${arkAddress}` +
    (invoice ? `&lightning=${invoice}` : '') +
    `&amount=${prettyNumber(fromSatoshis(sats))}`
  );
};

/** @param {string} data */
export const isBip21 = (data) => {
  try {
    decodeBip21(data);
    return true;
  } catch {
    return false;
  }
};
