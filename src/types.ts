/**
 * Arkade-specific types for Bitcoin wallet with Ark protocol support
 *
 * For WDK types, import directly from:
 * - @tetherto/wdk
 * - @tetherto/wdk-wallet
 */

import type { WalletConfig as WDKWalletConfig } from '@tetherto/wdk-wallet';
import type { WalletConfig as ArkadeSDKWalletConfig } from '@arkade-os/sdk';

// Re-export official WDK types for convenience
export type { IWalletAccount, WalletConfig as WDKWalletConfig } from '@tetherto/wdk-wallet';

// ============================================================================
// Arkade-Specific Extensions
// ============================================================================

/**
 * Arkade-specific transfer query options
 */
export interface TransferQueryOptions {
  limit?: number;
  offset?: number;
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

export interface ArkadeWalletConfig extends Omit<WDKWalletConfig, 'network'>, Partial<Omit<ArkadeSDKWalletConfig, 'network'>> {
  // Arkade-specific configuration
  serverUrl?: string;
}
