/**
 * Arkade-specific types for Bitcoin wallet with Arkade support
 *
 * For WDK types, import directly from:
 * - @tetherto/wdk
 * - @tetherto/wdk-wallet
 */

/**
 * @typedef {import('@tetherto/wdk-wallet').WalletConfig &
 *   Omit<import('@arkade-os/sdk').WalletConfig, 'identity'> & {
 *     swapProviderUrl?: string
 *     swapRepository?: import('@arkade-os/boltz-swap').ArkadeSwapsCreateConfig['swapRepository']
 *   }} ArkadeWalletConfig
 */

export default {};
