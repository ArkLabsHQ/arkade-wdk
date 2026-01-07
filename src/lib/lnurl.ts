/**
 * LNURL and Lightning Address utilities
 * Enables receiving payments via Lightning addresses (user@domain.com) and LNURL
 */

import { bech32, utf8 } from '@scure/base';

const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

/**
 * LNURL-pay response from the server
 */
export interface LnUrlResponse {
  /** Maximum amount in millisats that can be sent */
  maxSendable: number;
  /** Minimum amount in millisats that can be sent */
  minSendable: number;
  /** Callback URL to request the invoice */
  callback: string;
  /** JSON metadata about the recipient */
  metadata: string;
  /** Optional comment allowed length */
  commentAllowed?: number;
  /** Optional transfer methods available */
  transferAmounts?: {
    method: string;
    available: boolean;
  }[];
}

/**
 * Ark method response for LNURL+Ark
 */
export interface ArkMethodResponse {
  /** Expiry date for the address */
  expiryDate: string;
  /** Ark address for receiving */
  address: string;
  /** Hint about the address */
  hint: string;
}

/**
 * Callback response containing the invoice
 */
export interface LnUrlCallbackResponse {
  /** BOLT11 payment request */
  pr: string;
}

/**
 * Check if a string is a valid bech32-encoded LNURL
 */
const isValidBech32 = (data: string): boolean => {
  try {
    bech32.decodeToBytes(data);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if a string is an LNURL (lnurl1...)
 */
export const isLnUrl = (data: string): boolean => {
  return data.toLowerCase().startsWith('lnurl') && isValidBech32(data);
};

/**
 * Check if a string is a Lightning address (user@domain.com)
 */
export const isLightningAddress = (data: string): boolean => {
  return data.includes('@') && EMAIL_REGEX.test(data);
};

/**
 * Check if a string is a valid LNURL or Lightning address
 */
export const isValidLnUrl = (data: string): boolean => {
  return isLnUrl(data) || isLightningAddress(data);
};

/**
 * Get the callback URL for an LNURL or Lightning address
 */
export const getCallbackUrl = (lnurl: string): string => {
  if (isLightningAddress(lnurl)) {
    // Lightning address (user@domain.com)
    const [user, domain] = lnurl.split('@');
    return `https://${domain}/.well-known/lnurlp/${user}`;
  }
  // LNURL (lnurl1...)
  const { bytes } = bech32.decodeToBytes(lnurl);
  return utf8.encode(bytes);
};

/**
 * Helper to check response status
 */
const checkResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  return response.json() as Promise<T>;
};

/**
 * Validate amount is within LNURL limits
 */
const checkLnUrlResponse = (amountMsat: number, data: LnUrlResponse): LnUrlResponse => {
  if (amountMsat < data.minSendable || amountMsat > data.maxSendable) {
    throw new Error(
      `Amount ${amountMsat / 1000} sats is outside LNURL range: ` +
      `${data.minSendable / 1000} - ${data.maxSendable / 1000} sats`
    );
  }
  return data;
};

/**
 * Fetch invoice from LNURL callback
 */
const fetchLnUrlInvoice = async (
  amountMsat: number,
  note: string,
  data: LnUrlResponse
): Promise<string> => {
  let url = `${data.callback}?amount=${amountMsat}`;
  if (note && data.commentAllowed && note.length <= data.commentAllowed) {
    url += `&comment=${encodeURIComponent(note)}`;
  }
  const res = await fetch(url).then(checkResponse<LnUrlCallbackResponse>);
  return res.pr;
};

/**
 * Get LNURL metadata/limits
 * @param lnurl LNURL or Lightning address
 * @returns LNURL response with limits and metadata
 */
export const checkLnUrlConditions = async (lnurl: string): Promise<LnUrlResponse> => {
  const url = getCallbackUrl(lnurl);
  const response = await fetch(url);
  return checkResponse<LnUrlResponse>(response);
};

/**
 * Fetch a Lightning invoice from an LNURL or Lightning address
 * @param lnurl LNURL or Lightning address (e.g., user@domain.com)
 * @param sats Amount in satoshis
 * @param note Optional payment note/comment
 * @returns BOLT11 invoice
 */
export const fetchInvoice = async (
  lnurl: string,
  sats: number,
  note: string = ''
): Promise<string> => {
  const url = getCallbackUrl(lnurl);
  const amountMsat = Math.round(sats * 1000); // Convert to millisats

  const data = await fetch(url).then(checkResponse<LnUrlResponse>);
  checkLnUrlResponse(amountMsat, data);
  return fetchLnUrlInvoice(amountMsat, note, data);
};

/**
 * Fetch Ark address from LNURL (if supported)
 * Some LNURL servers support Ark protocol directly
 * @param lnurl LNURL or Lightning address
 * @returns Ark method response with address
 */
export const fetchArkAddress = async (lnurl: string): Promise<ArkMethodResponse> => {
  const url = getCallbackUrl(lnurl) + '?method=ark';
  const response = await fetch(url);
  return checkResponse<ArkMethodResponse>(response);
};

/**
 * Parse minimum and maximum amounts from LNURL response
 * @param lnurl LNURL or Lightning address
 * @returns Min/max amounts in satoshis
 */
export const getLnUrlLimits = async (
  lnurl: string
): Promise<{ minSats: number; maxSats: number }> => {
  const data = await checkLnUrlConditions(lnurl);
  return {
    minSats: Math.ceil(data.minSendable / 1000),
    maxSats: Math.floor(data.maxSendable / 1000),
  };
};

/**
 * Extract recipient description from LNURL metadata
 */
export const extractRecipientFromMetadata = (metadata: string): string | null => {
  try {
    const parsed = JSON.parse(metadata);
    // Look for plain text entry
    const textEntry = parsed.find((entry: string[]) => entry[0] === 'text/plain');
    return textEntry?.[1] ?? null;
  } catch {
    return null;
  }
};
