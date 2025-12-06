/**
 * @arkade/wdk-core
 * WDK (Wallet Development Kit) implementation using Arkade Bitcoin SDK with Ark protocol support
 * Implements interfaces compatible with @tetherto/wdk and @tetherto/wdk-wallet
 */

// ============================================================================
// Main WDK Class
// ============================================================================

// ============================================================================
// Wallet Implementations
// ============================================================================

export {
  WalletManagerArkade,
} from './wallets/bitcoin-arkade.js';

// ============================================================================
// Utilities
// ============================================================================

export { isValidSeedPhrase, getRandomSeedPhrase } from './utils/seed-phrase.js';

// ============================================================================
// Core Type Exports
// ============================================================================

export type {
  // Official WDK types (re-exported for convenience)
  IWalletAccount,
  WDKWalletConfig as WalletConfig,

  // Arkade-specific configuration
  ArkadeWalletConfig,

  // Arkade-specific types
  Balance,
  Transfer,
  TransferQueryOptions,
  FeeQuote,
  FeeRates,
} from './types.js';
