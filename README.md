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
- Optional Lightning receive via `createLightningInvoice()` (HRPC → Boltz swap)
- Optional Lightning send via auto-detection of BOLT11 invoices in `sendTransaction()`
- Transaction history for arkade networks via `getTransactionHistory()` (HRPC → SDK)
- Arkade balance fetching via the RN-side Arkade wallet using `getBalance()`

`TODO` (known gaps in current implementation):
- Transaction routing enum includes `EMAIL`, but email payments are not implemented

## Account Model

The wallet manager exposes three account indices, each derived from the seed at a distinct BIP-86 path:

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
│   ├── wallet-manager-arkade.js  # WDK wallet manager implementation
│   ├── wallet-account-arkade.js  # WDK account implementation
│   ├── wallet-account-read-only-arkade.js  # WDK read-only account implementation
│   ├── types.js                  # ArkadeWalletConfig type
│   └── index.js                  # package exports
├── packages/
│   ├── pear-wrk-wdk/             # submodule: bare-kit worklet runtime (HRPC schema + handlers)
│   └── wdk-react-native-provider/# submodule: React Native provider (WDK service, contexts, UI wiring)
├── examples/
│   └── wdk-starter-react-native/ # submodule: Expo example app
├── patches/
│   ├── pear-wrk-wdk.patch
│   ├── wdk-react-native-provider.patch
│   └── wdk-starter-react-native.patch
└── scripts/
    ├── setup-dev.js              # local dev setup helper
    ├── apply-patches.js          # apply ./patches to each submodule
    └── generate-patches.js       # regenerate ./patches from submodule diffs
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
const { invoice, paymentHash } = await account.createLightningInvoice(50_000, 'Payment for coffee')
console.log(invoice) // BOLT11 invoice string
```

Pay to Lightning address / LNURL:

```typescript
import { fetchInvoice, isLightningAddress } from '@arkade-os/wdk/src/lib/lnurl.js'

if (isLightningAddress('user@wallet.com')) {
  const invoice = await fetchInvoice('user@wallet.com', 1000, 'tip')
  await account.sendTransaction({ to: invoice, value: 1000n })
}
```

## Arkade-Specific Account Methods

The adapter does not expose the underlying `@arkade-os/sdk` wallet instance.
Use the account methods instead:

```typescript
const balance = await account.getBalance()
const unsubscribe = await account.subscribeToIncomingFunds(() => {
  console.log('New Arkade funds detected')
})
const history = await account.getTransactionHistory()

unsubscribe()
```

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

### WalletAccountReadOnlyArkade

```typescript
class WalletAccountReadOnlyArkade {
  readonly index: number
  readonly path: string
  readonly keyPair: { publicKey: Uint8Array }

  getAddress(): Promise<string> // returns '' for lightning accounts
  getBoardingAddress(): Promise<string>
  getBalance(): Promise<bigint>
  getTransactionHistory(): Promise<ArkTransaction[]>
  verify(message: string, signature: string): Promise<boolean>
  getTransactionReceipt(hash: string): Promise<unknown | null>
  getTokenBalance(tokenAddress: string): Promise<bigint>
  quoteSendTransaction(tx: Transaction): Promise<{ fee: bigint }>
  quoteTransfer(options: TransferOptions): Promise<{ fee: bigint }>
}
```

### WalletAccountArkade

```typescript
class WalletAccountArkade extends WalletAccountReadOnlyArkade {
  readonly keyPair: { publicKey: Uint8Array; privateKey: Uint8Array | null }
  readonly arkadeSwaps: ArkadeSwaps | null

  sendTransaction(tx: Transaction): Promise<{ hash: string; fee: bigint }>
  quoteSendTransaction(tx: Transaction): Promise<{ fee: bigint }>
  transfer(options: TransferOptions): Promise<TransferResult>
  sign(message: string): Promise<string>
  subscribeToIncomingFunds(callback: (coins: IncomingFunds) => void): Promise<() => void>
  toReadOnlyAccount(): Promise<WalletAccountReadOnlyArkade>
  dispose(): void
  createLightningInvoice(amount: number, description?: string): Promise<{ invoice: string; paymentHash: string }>
  waitForLightningPayment(invoice: string): Promise<{ txid: string }>
  getPendingLightningReceives(): Promise<PendingReverseSwap[]>
  getPendingLightningSends(): Promise<PendingSubmarineSwap[]>
  getSwapHistory(): Promise<(PendingReverseSwap | PendingSubmarineSwap | PendingChainSwap)[]>
  getLightningLimits(): Promise<LimitsResponse>
  getLightningFees(): Promise<FeesResponse>
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
  // Optional: enables Lightning send/receive.
  // swapProviderUrl: 'https://api.ark.boltz.exchange',
}
```

`ArkadeWalletConfig` includes `@arkade-os/sdk` wallet config fields (except `identity`) plus optional `swapProviderUrl`.
Minimum Arkade configuration is `arkServerUrl` or `arkProvider`.

## Temporary Workarounds

### Arkade balances resolve on the RN side

The normal WDK path for balances is: RN provider -> HRPC `getAddressBalance` -> worklet. Arkade now takes a different route: the RN provider initializes an `@arkade-os/wdk` account locally with Expo adapters and asks that account for its total balance.

Current Arkade balance path:
- RN provider -> `WalletAccountArkade.getBalance()`
- `getBalance()` -> SDK `wallet.getBalance().total`
- provider may subtract current boarding UTXOs via `getBoardingAddress()` and `esploraUrl` before presenting spendable Arkade / Lightning balance

This keeps the SDK wallet encapsulated inside the account classes and leaves Arkade-specific balance shaping in the provider layer instead of expanding the wallet API.

### Transaction history uses HRPC (not a workaround)

Unlike balances, transaction history goes through the full HRPC path: RN provider -> HRPC `getTransactionHistory` -> worklet -> SDK `wallet.getTransactionHistory()`. The SDK returns `ArkTransaction[]` which is serialized as JSON through HRPC and mapped to the provider's `Transaction` interface on the RN side.

## Git Submodules and Patches

The `packages/` and `examples/` directories are git submodules pointing at upstream repositories we don't have write access to. Local modifications are stored as patch files under `./patches/` and applied on top of pinned upstream commits.

### Submodules

| Path | Pinned at |
|------|-----------|
| `packages/pear-wrk-wdk` | `1.0.0-beta.4` (commit `ef7a951`) |
| `packages/wdk-react-native-provider` | `1.0.0-beta.3` (tag `v1.0.0-beta.3`) |
| `examples/wdk-starter-react-native` | `main` |

### After cloning

Use the setup script — it initializes submodules, applies all patches, installs dependencies, builds the root package, and links everything for local development:

```bash
npm run setup:dev
```

If you only need to (re-)apply patches without running the rest of the setup:

```bash
node scripts/apply-patches.js          # apply all patches
node scripts/apply-patches.js --check  # dry-run (verify they apply cleanly)
```

### Editing a submodule

Submodule working trees are kept dirty: the patches in `./patches/` are applied on top of the pinned upstream commits. To make a change:

1. Edit files inside the submodule directly:
   ```bash
   cd packages/wdk-react-native-provider
   # ... edit files ...
   ```

2. From the parent repo, regenerate the patch:
   ```bash
   cd ../..
   node scripts/generate-patches.js
   ```
   The script defaults to the SHA the parent repo has pinned for each submodule, so the patch only captures your local changes — not divergence from upstream.

3. Commit the updated patch in the parent repo:
   ```bash
   git add patches/wdk-react-native-provider.patch
   git commit -m "Update wdk-react-native-provider patch"
   ```

### Provider build

After editing provider source, regenerate bundles and type definitions before committing:

```bash
cd packages/wdk-react-native-provider
npm run prepare   # runs bob build + gen:secret-manager-bundle + gen:worker-bundle
```

This re-bundles the worklet (picking up any HRPC schema changes from `pear-wrk-wdk`) and type-checks with the stricter `bob build` settings.

## Development

```bash
npm install
npm run lint
npm run format
```

Testing:

```bash
npm test
```

## License

MIT

## Resources

- [WDK Documentation](https://docs.wallet.tether.io/sdk)
- [Arkade SDK](https://github.com/arkade-os/ts-sdk)
- [Ark Protocol](https://ark-protocol.org)
- [Boltz Exchange](https://boltz.exchange)
