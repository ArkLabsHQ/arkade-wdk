# @arkade-os/wdk

WDK-compatible Bitcoin wallet manager/account implementation built on top of `@arkade-os/sdk`, with optional Lightning support through `@arkade-os/boltz-swap`.

## Current Status

Implemented:
- WDK `WalletManager` integration (`getAccount`, `getAccountByPath`, `dispose`)
- WDK account methods for send/sign/verify/quote and read-only conversion
- Destination auto-detection for Ark address, BTC address, and BOLT11 invoices
- LNURL/Lightning-address helpers (`fetchInvoice`, limits, callback resolution)
- Utility exports for address detection, BIP21 parsing/encoding, fees, and formatting
- Three account types via index: boarding (0), offchain (1), lightning (2)
- Lightning receive via `createLightningInvoice()` (HRPC → Boltz swap)
- Lightning send via auto-detection of BOLT11 invoices in `sendTransaction()`
- Transaction history for arkade networks via `getTransactionHistory()` (HRPC → SDK)
- Arkade balance fetching via direct REST calls to Ark indexer and Esplora

`TODO` (known gaps in current implementation):
- `getFeeRates()` currently returns placeholder values (`normal: 0n`, `fast: 0n`)
- `WalletAccountArkade.initialize()` is currently a no-op
- Lightning swap lifecycle helpers are not implemented yet (needs evaluation whether these are needed):
  `waitForLightningPayment`, `getPendingLightningReceives`, `getPendingLightningSends`,
  `getSwapHistory`, `getLightningLimits`, `getLightningFees`
- Transaction routing enum includes `EMAIL`, but email payments are not implemented
- BIP21 helpers are implemented, but `sendTransaction`/`quoteSendTransaction` currently expect direct destination values (Ark/BTC/BOLT11), not a BIP21 URI

## Account Model

The wallet manager exposes three account indices, all sharing the same underlying `@arkade-os/sdk` wallet instance:

| Index | AddressType | Purpose |
|-------|-------------|---------|
| 0 | `boarding` | On-chain BTC deposit address (funds enter the Ark) |
| 1 | `offchain` | Ark protocol address (VTXO-to-VTXO transfers) |
| 2 | `lightning` | Lightning via Boltz swaps (no static address; uses invoice generation) |

`getAddress()` returns an empty string for Lightning (index 2). The UI should detect this and present an amount-input + invoice-generation flow instead of a static QR code.

## Repository Structure

```text
arkade-wdk/
├── src/
│   ├── lib/                      # address, bip21, bolt11, lnurl, fees, formatting, send routing
│   ├── wallet-manager-arkade.ts  # WDK wallet manager implementation
│   ├── wallet-account-arkade.ts  # WDK account + read-only account implementations
│   └── index.ts                  # package exports
├── packages/
│   ├── pear-wrk-wdk/             # submodule: bare-kit worklet runtime (HRPC schema + handlers)
│   └── wdk-react-native-provider/# submodule: React Native provider (WDK service, contexts, UI wiring)
├── examples/
│   └── wdk-starter-react-native/ # submodule: Expo example app
└── scripts/setup-dev.js          # local dev setup helper
```

## Installation

```bash
npm install @arkade-os/wdk @tetherto/wdk
```

`@arkade-os/sdk` is not required as a direct install for normal usage of this adapter.
It is pulled transitively by `@arkade-os/wdk`.
If your app imports `@arkade-os/sdk` directly, add it explicitly to your app dependencies.

For local monorepo development with submodules and links:

```bash
npm run setup:dev
```

## Quick Start

```typescript
import WdkManager from '@tetherto/wdk'
import WalletManagerArkade from '@arkade-os/wdk'

const seedPhrase = 'your twelve word seed phrase here'
const wdk = new WdkManager(seedPhrase)

wdk.registerWallet('bitcoin', WalletManagerArkade, {
  arkServerUrl: 'https://arkade.computer',
  swapProviderUrl: 'https://api.ark.boltz.exchange', // optional: enables Lightning methods
})

const account = await wdk.getAccount('bitcoin', 0)

const arkAddress = await account.getAddress()
const balance = await account.getBalance()

const quote = await account.quoteSendTransaction({
  to: arkAddress,
  value: 1000n,
})

const tx = await account.sendTransaction({
  to: arkAddress,
  value: 1000n,
})

console.log({ balance, quoteFee: quote.fee, txid: tx.hash })
```

## Lightning and LNURL

Create Lightning invoice (enabled only when `swapProviderUrl` is configured):

```typescript
const invoice = await account.createLightningInvoice(50_000, 'Payment for coffee')
console.log(invoice) // BOLT11 string
```

Pay to Lightning address / LNURL:

```typescript
import { fetchInvoice, isLightningAddress } from '@arkade-os/wdk'

if (isLightningAddress('user@wallet.com')) {
  const invoice = await fetchInvoice('user@wallet.com', 1000, 'tip')
  await account.sendTransaction({ to: invoice, value: 1000n })
}
```

`TODO`: Convenience wrappers for waiting on/inspecting Lightning swap status are not implemented yet on `WalletAccountArkade`.

## Accessing Arkade SDK Directly

`WalletAccountArkade` exposes the underlying SDK wallet as `account.wallet`.

```typescript
const boardingAddress = await account.wallet.getBoardingAddress()
const detailedBalance = await account.wallet.getBalance()
const history = await account.getTransactionHistory() // also available via account.wallet.getTransactionHistory()
```

`TODO`: Add first-class wrapper methods for these SDK calls on `WalletAccountArkade`.

## API Reference (Current)

### WalletManagerArkade

```typescript
class WalletManagerArkade extends WalletManager {
  // inherited from @tetherto/wdk-wallet WalletManager
  static getRandomSeedPhrase(wordCount?: 12 | 24): string
  static isValidSeedPhrase(seedPhrase: string): boolean

  constructor(seed: string | Uint8Array, config?: ArkadeWalletConfig)
  getAccount(index?: number): Promise<WalletAccountArkade>
  getAccountByPath(path: string): Promise<WalletAccountArkade>
  getFeeRates(): Promise<{ normal: bigint; fast: bigint }>
  dispose(): void
}
```

### WalletAccountArkadeReadOnly

```typescript
class WalletAccountArkadeReadOnly {
  readonly index: number
  readonly path: string
  readonly keyPair: { publicKey: Uint8Array }

  getAddress(): Promise<string> // returns '' for lightning accounts
  getBalance(): Promise<bigint>
  getTransactionHistory(): Promise<ArkTransaction[]>
  verify(message: string, signature: string): Promise<boolean>
  getTransactionReceipt(hash: string): Promise<unknown | null>
  getTokenBalance(tokenAddress: string): Promise<bigint> // always 0n for Bitcoin
  quoteSendTransaction(tx: Transaction): Promise<{ fee: bigint }>
  quoteTransfer(options: TransferOptions): Promise<{ fee: bigint }> // throws (not applicable)
}
```

### WalletAccountArkade

```typescript
class WalletAccountArkade extends WalletAccountArkadeReadOnly {
  readonly keyPair: { publicKey: Uint8Array; privateKey: Uint8Array | null }
  readonly wallet: IWallet
  readonly arkadeLightning: ArkadeLightning | null

  initialize(): Promise<void> // TODO: currently no-op
  sendTransaction(tx: Transaction): Promise<{ hash: string; fee: bigint }>
  quoteSendTransaction(tx: Transaction): Promise<{ fee: bigint }>
  transfer(options: TransferOptions): Promise<TransferResult> // throws (not applicable)
  sign(message: string): Promise<string>
  toReadOnlyAccount(): Promise<WalletAccountArkadeReadOnly>
  dispose(): void
  createLightningInvoice(amount: number, description?: string): Promise<{ invoice: string; paymentHash: string }>
}
```

### Utility Exports

Address:
- `decodeArkAddress`
- `isArkAddress`
- `isBTCAddress`
- `isLightningInvoice`

Transaction routing:
- `detectTransactionType`
- `quoteSend`
- `send`
- `TransactionType`

BIP21:
- `isBip21`
- `decodeBip21`
- `encodeBip21`

BOLT11:
- `decodeInvoice`
- `isValidInvoice`

LNURL / Lightning address:
- `isLnUrl`
- `isLightningAddress`
- `isValidLnUrl`
- `getCallbackUrl`
- `checkLnUrlConditions`
- `fetchInvoice`
- `fetchArkAddress`
- `getLnUrlLimits`
- `extractRecipientFromMetadata`

Fees and formatting:
- `calculateOffchainFee`
- `calculateOnchainFee`
- `calculateLightningFee`
- `fromSatoshis`
- `toSatoshis`
- `formatSats`
- `formatSatsWithCommas`
- `prettyNumber`

## Configuration

```typescript
import type { ArkadeWalletConfig } from '@arkade-os/wdk'

const config: ArkadeWalletConfig = {
  arkServerUrl: 'https://arkade.computer',
  swapProviderUrl: 'https://api.ark.boltz.exchange',
}
```

`ArkadeWalletConfig` includes `@arkade-os/sdk` wallet config fields (except `identity`) plus `swapProviderUrl`.
Minimum Arkade configuration is `arkServerUrl` or `arkProvider`.

## Temporary Workarounds

### Arkade balance fetching bypasses the worklet

The normal WDK path for balances is: RN provider -> HRPC `getAddressBalance` -> worklet -> SDK `wallet.getBalance()`. For arkade networks, the SDK's internal Esplora URL defaults to `http://localhost:3000` (regtest), which is unreachable from an Android device. Non-arkade chains (BTC, EVM, TON, etc.) don't hit this problem because their balances are fetched via the WDK indexer at `wdk-api.tether.io` directly from RN's `fetch`, never through the worklet.

The current workaround in `wdk-react-native-provider` calls the Ark indexer and Esplora REST APIs directly from the RN side:
- **Offchain/Lightning balance**: `GET ${arkServerUrl}/v1/indexer/vtxos?scripts=${pkScript}&spendableOnly=true`
- **Boarding balance**: `GET ${esploraUrl}/address/${addr}/utxo`

This involves an inline bech32m decoder (`arkAddressToPkScript`) to extract the pkScript from the Ark address without adding a dependency. Once the SDK's Esplora URL is configurable or auto-detected correctly, these workarounds can be removed and the standard HRPC `getAddressBalance` path can be used for arkade too.

### Transaction history uses HRPC (not a workaround)

Unlike balances, transaction history goes through the full HRPC path: RN provider -> HRPC `getTransactionHistory` -> worklet -> SDK `wallet.getTransactionHistory()`. The SDK returns `ArkTransaction[]` which is serialized as JSON through HRPC and mapped to the provider's `Transaction` interface on the RN side.

## Git Submodules

The `packages/` and `examples/` directories are git submodules, each with their own repository. Changes flow **inside-out**: commit within the submodule first, then commit the updated submodule reference in the parent.

### Workflow

```bash
# 1. Make changes inside a submodule
cd packages/wdk-react-native-provider
# ... edit files ...
git add -A && git commit -m "your change"
git push

# 2. Back in the parent repo, commit the updated submodule pointer
cd ../..
git add packages/wdk-react-native-provider
git commit -m "Update wdk-react-native-provider submodule"
```

Repeat for each submodule that changed (`packages/pear-wrk-wdk`, `examples/wdk-starter-react-native`).

### After cloning

```bash
git submodule update --init --recursive
```

Or use the setup script which also builds and links:

```bash
npm run setup:dev
```

### Provider build

After editing provider source, regenerate bundles and type definitions before committing:

```bash
cd packages/wdk-react-native-provider
npm run prepare   # runs gen:secret-manager-bundle + gen:worker-bundle + bob build
```

This re-bundles the worklet (picking up any HRPC schema changes from `pear-wrk-wdk`) and type-checks with the stricter `bob build` settings.

## Development

```bash
npm install
npm run build
npm run dev
npm run lint
npm run format
```

Testing:

```bash
npm test
```

`TODO`: Jest is configured with `setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts']`, but that file is not currently present in this repository.

## License

MIT

## Resources

- [WDK Documentation](https://docs.wallet.tether.io/sdk)
- [Arkade SDK](https://github.com/arkade-os/ts-sdk)
- [Ark Protocol](https://ark-protocol.org)
- [Boltz Exchange](https://boltz.exchange)
