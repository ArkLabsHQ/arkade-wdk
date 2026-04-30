import { hex } from '@scure/base';
import { isValidInvoice } from './bolt11.js';
import { ArkAddress } from '@arkade-os/sdk';

/** @param {string} addr */
export const decodeArkAddress = (addr) => {
  const decoded = ArkAddress.decode(addr);
  return {
    serverPubKey: hex.encode(decoded.serverPubKey),
    vtxoTaprootKey: hex.encode(decoded.vtxoTaprootKey),
  };
};

/** @param {string} data */
export const isArkAddress = (data) => {
  try {
    decodeArkAddress(data);
  } catch {
    return false;
  }
  return true;
};

/** @param {string} data */
export const isBTCAddress = (data) => {
  const segwit = new RegExp('^(bc1|tb1|bcrt1)[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{39,87}$');
  const legacy = new RegExp('^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$');
  return segwit.test(data) || legacy.test(data);
};

/** @param {string} data */
export const isLightningInvoice = (data) => {
  return isValidInvoice(data);
};
