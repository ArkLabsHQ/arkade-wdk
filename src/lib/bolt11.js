import bolt11 from 'light-bolt11-decoder';

/**
 * @typedef {{ note: string; expiry: number; amountSats: number; paymentHash: string }} DecodedInvoice
 */

/** @param {string} data */
const extractNote = (data) => {
  if (!/^\[/.test(data)) return data;
  try {
    return JSON.parse(data)[0][1];
  } catch {
    return '';
  }
};

/**
 * Look up a section's `value` field by name. The `light-bolt11-decoder`
 * `Section` union has variants without a `value` (e.g. `checksum`,
 * `separator`), so this helper isolates the cast to one place.
 * @param {ReturnType<typeof bolt11.decode>['sections']} sections
 * @param {string} name
 * @returns {string | undefined}
 */
const findSectionValue = (sections, name) => {
  const section = /** @type {{ value: string } | undefined} */ (
    sections.find((s) => s.name === name)
  );
  return section?.value;
};

/**
 * @param {string} invoice
 * @returns {DecodedInvoice}
 */
export const decodeInvoice = (invoice) => {
  const decoded = bolt11.decode(invoice);
  const millisats = Number(findSectionValue(decoded.sections, 'amount') ?? '0');
  const description = findSectionValue(decoded.sections, 'description') ?? '';
  return {
    expiry: decoded.expiry ?? 3600,
    note: extractNote(description),
    amountSats: Math.floor(millisats / 1000),
    paymentHash: findSectionValue(decoded.sections, 'payment_hash') ?? '',
  };
};

/** @param {string} data */
export const isValidInvoice = (data) => {
  try {
    decodeInvoice(data);
    return true;
  } catch {
    return false;
  }
};
