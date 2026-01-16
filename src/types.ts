/**
 * Arkade-specific types for Bitcoin wallet with Ark protocol support
 *
 * For WDK types, import directly from:
 * - @tetherto/wdk
 * - @tetherto/wdk-wallet
 */

import type { WalletConfig as WDKWalletConfig } from '@tetherto/wdk-wallet';
import type { WalletConfig as ArkadeSDKWalletConfig } from '@arkade-os/sdk';

export interface ArkadeWalletConfig
  extends WDKWalletConfig, Omit<ArkadeSDKWalletConfig, 'identity'> {
  swapProviderUrl?: string;
}
