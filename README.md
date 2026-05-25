# @arkade-os/wdk

WDK-compatible Bitcoin wallet manager/account implementation built on top of `@arkade-os/sdk`, with optional Lightning support through `@arkade-os/boltz-swap`.

## Current Status

Implemented:
- WDK `WalletManager` integration (`getAccount`, `getAccountByPath`, `getFeeRates`, `dispose`)
- WDK account methods for send/sign/verify/quote, BIP-322 message signing, and read-only conversion
- Destination auto-detection in `sendTransaction()` for Arkade addresses, BTC addresses, BOLT11 invoices, Lightning addresses, LNURL, and BIP21 URIs
- Optional Lightning receive via `createLightningInvoice()` (Boltz reverse swap)
- Optional Lightning send via `sendTransaction()` (Boltz submarine swap)
- Transaction history via `getTransactionHistory()` (delegates to the SDK)
- Subscription to incoming VTXOs via `subscribeToIncomingFunds()`

## Account Model

Each call to `getAccount(index)` returns one account derived at BIP-86 path `m/86'/<coin>/0'/0/<index>` (`coin = 0` for bitcoin, `1` for any other network). The index is just a key-derivation leaf — there is no per-index role.

Every account exposes three receive surfaces from the same underlying wallet:

| Surface | API | Used when |
|---------|-----|-----------|
| Arkade address (offchain) | `getAddress()` | Receiving VTXO transfers from other Arkade users |
| Boarding address (on-chain) | `getBoardingAddress()` | Funding the wallet by depositing on-chain BTC |
| Lightning invoice | `createLightningInvoice(amount, description?)` | Receiving Lightning payments via Boltz reverse swap |

Lightning is only available when `swapProviderUrl` is set in the wallet config; otherwise `createLightningInvoice` throws. `getAddress()` always returns the Arkade address — do not use it as a QR code for Lightning receives.

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

`@arkade-os/sdk` and `@arkade-os/boltz-swap` are not required as a direct install for normal usage of this adapter.
They are pulled transitively by `@arkade-os/wdk`.
If your app imports `@arkade-os/sdk` or `@arkade-os/boltz-swap` directly, add them explicitly to your app dependencies.

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
await account.sendTransaction({ to: 'user@wallet.com', value: 1000n })
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
  dispose(): Promise<void>
}
```

### WalletAccountReadOnlyArkade

```typescript
class WalletAccountReadOnlyArkade {
  getAddress(): Promise<string>
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
  readonly path: string             // full BIP-86 derivation path
  readonly index: number            // path leaf (last segment)
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

### Package Exports

`@arkade-os/wdk` exports three values:

- `default` — `WalletManagerArkade`
- `WalletAccountArkade`
- `WalletAccountReadOnlyArkade`

The modules under `src/lib/` (address detection, BIP21, BOLT11, LNURL, fees, formatting, send routing) back the destination auto-detection that `sendTransaction()` performs and are not part of the package's public API.

## Configuration

```typescript
import type { ArkadeWalletConfig } from '@arkade-os/wdk'

const config: ArkadeWalletConfig = {
  arkServerUrl: 'https://arkade.computer',
  // Optional: enables Lightning send/receive.
  // swapProviderUrl: 'https://api.boltz.exchange',
}
```

`ArkadeWalletConfig` extends the WDK `WalletConfig` and the `@arkade-os/sdk` `WalletConfig` (minus `identity`, which the manager fills in from the derived HD key) plus an optional `swapProviderUrl`.

Common fields:

| Field | Required                      | Purpose |
|-------|-------------------------------|---------|
| `arkServerUrl` | either this or `arkProvider`  | URL used to construct a `RestArkProvider`. |
| `arkProvider` | either this or `arkServerUrl` | A pre-built `ArkProvider` instance — useful for tests or custom transports. |
| `swapProviderUrl` | optional                      | Boltz API URL. Enables `createLightningInvoice`, Lightning send via `sendTransaction`, and the swap query methods. |
| `storage` | optional                      | `{ walletRepository, contractRepository }`. Defaults to in-memory repositories; pass persistent ones (e.g. SQLite-backed) to keep VTXO state across restarts. |
| `swapRepository` | optional                      | Boltz swap state storage. Forwarded into `ArkadeSwaps` when `swapProviderUrl` is set. |

The manager fetches `arkProvider.getInfo()` once at construction time (with a single retry on failure) and reuses the result for fee rates, network detection, and wallet initialization. `Wallet.create` is wrapped in a 30-second timeout; the rejection mentions the unreachable Arkade server so misconfigurations surface quickly.

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
| `packages/pear-wrk-wdk` | one commit before `v2.0.0-beta.1` (commit `ed8cd00`) |
| `packages/wdk-react-native-provider` | one commit past `v1.0.0-beta.3` (commit `79462d4`) |
| `examples/wdk-starter-react-native` | `develop` (commit `f010fda`) |

Run `git submodule status` to confirm the pinned commit hashes in the parent repo.

### After cloning

Use the setup script — it initializes submodules, applies all patches, installs dependencies, builds the root package, and links everything for local development:

```bash
npm run setup:dev
```

> [!TIP]
> To run the example app: `cd examples/wdk-starter-react-native && npm run android # or ios`

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

## Releasing to npm

Releases are driven from a local workstation by `scripts/release.js` (invoked through `npm run release`). There is no automated release pipeline.

### Prerequisites

- npm account with access to the `@arkade-os` org
- Logged in: `npm login`
- Working tree on the commit you want to publish (the release script does not bump the version itself)

### Steps

1. Bump the version with `--no-git-tag-version` (the release script creates the tag itself; using plain `npm version` would create the tag twice and the script would refuse to run):
   ```bash
   npm version --no-git-tag-version patch   # or minor / major
   git commit -am "Bump version"
   git push
   ```

2. Run the release script:
   ```bash
   npm run release
   ```
   It reads the version from `package.json`, creates the `vX.Y.Z` tag locally, runs `npm publish` (which fires the `prepublishOnly` hook that regenerates type declarations in `types/`), and pushes the tag to `origin`. If publish fails the tag is removed so a retry can re-tag the same commit.

Only `src/` and `types/` are included in the tarball (per the `files` field in `package.json`).

## CI

`.github/workflows/ci.yml` runs on every push and pull request targeting `master`. The job uses Node.js 22 and runs:

```bash
npm ci
npm run lint    # eslint + tsc --noEmit via jsconfig.json
npm test        # node --test src/__tests__/*.test.js
```

Tests use Node's built-in test runner — no extra framework or runtime dependency is required.

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
- [Arkade Documentation](https://docs.arkadeos.com)
- [Boltz Exchange](https://boltz.exchange)
