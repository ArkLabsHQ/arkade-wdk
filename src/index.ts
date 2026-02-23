/**
 * @arkade-os/wdk
 * WDK (Wallet Development Kit) implementation using Arkade Bitcoin SDK with Ark protocol support
 * Implements interfaces compatible with @tetherto/wdk and @tetherto/wdk-wallet
 */

// Main wallet manager (default export for compatibility)
export { default } from './wallet-manager-arkade.js';

// Wallet account classes
export {
  WalletAccountArkade,
  WalletAccountArkadeReadOnly,
} from './wallet-account-arkade.js';

// Configuration types
export type {
  ArkadeWalletConfig,
} from './types.js';

// Transaction utilities
export {
  send,
  quoteSend,
  detectTransactionType,
  TransactionType,
  type SendResult,
  type SendOptions,
} from './lib/send.js';

// Address utilities
export {
  isArkAddress,
  isBTCAddress,
  isLightningInvoice,
  decodeArkAddress,
} from './lib/address.js';

// BIP21 URI utilities
export {
  isBip21,
  decodeBip21,
  encodeBip21,
  type Bip21Decoded,
} from './lib/bip21.js';

// BOLT11 invoice utilities
export {
  decodeInvoice,
  isValidInvoice,
  type DecodedInvoice,
} from './lib/bolt11.js';

// LNURL and Lightning Address utilities
export {
  isLnUrl,
  isLightningAddress,
  isValidLnUrl,
  getCallbackUrl,
  checkLnUrlConditions,
  fetchInvoice,
  fetchArkAddress,
  getLnUrlLimits,
  extractRecipientFromMetadata,
  type LnUrlResponse,
  type ArkMethodResponse,
} from './lib/lnurl.js';

// Fee utilities
export {
  calculateOffchainFee,
  calculateOnchainFee,
  calculateLightningFee,
  type FeeEstimate,
} from './lib/fees.js';

// Formatting utilities
export {
  fromSatoshis,
  toSatoshis,
  formatSats,
  formatSatsWithCommas,
  prettyNumber,
} from './lib/format.js';

