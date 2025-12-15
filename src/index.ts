/**
 * @arkade/wdk-core
 * WDK (Wallet Development Kit) implementation using Arkade Bitcoin SDK with Ark protocol support
 * Implements interfaces compatible with @tetherto/wdk and @tetherto/wdk-wallet
 */

export type {
  // Arkade-specific configuration
  ArkadeWalletConfig,
} from './types.js';
export { default as WalletManagerArkade } from './wallet-manager-arkade.js';
