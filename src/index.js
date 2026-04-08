/**
 * @arkade-os/wdk
 * WDK (Wallet Development Kit) implementation using Arkade Bitcoin SDK with Ark protocol support
 */

export { default } from './wallet-manager-arkade.js';
export { WalletAccountArkade } from './wallet-account-arkade.js';
export { WalletAccountReadOnlyArkade } from './wallet-account-read-only-arkade.js';

// Lib helpers — re-exported so downstream consumers (the RN provider, the
// example app) can `import { decodeBip21, isLightningAddress, fetchInvoice,
// ... } from '@arkade-os/wdk'` without reaching into subpaths. The package's
// exports field intentionally only declares ".".
export * from './lib/address.js';
export * from './lib/bip21.js';
export * from './lib/bolt11.js';
export * from './lib/lnurl.js';
export * from './lib/format.js';
export * from './lib/send.js';
export * from './lib/fees.js';
