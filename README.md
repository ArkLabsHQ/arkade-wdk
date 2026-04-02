# @arkade-os/wdk

WDK-compatible Bitcoin wallet manager/account implementation built on top of `@arkade-os/sdk`, with optional Lightning support through `@arkade-os/boltz-swap`.

## Current Status

Implemented:
- WDK `WalletManager` integration (`getAccount`, `getAccountByPath`, `dispose`)
- WDK account methods for send/sign/verify/quote and read-only conversion
- Destination auto-detection for Ark address, BTC address, and BOLT11 invoices
- Lightning receive via `createLightningInvoice()` (Boltz swap)
- Lightning send via auto-detection of BOLT11 invoices in `sendTransaction()`
- Transaction history via `getTransactionHistory()` (SDK)
- Asset transfers via `transfer()` (Ark protocol)
- Balance fetching via SDK

`TODO` (known gaps):
- `getFeeRates()` currently returns placeholder values (`normal: 0n`, `fast: 0n`)
- Lightning swap lifecycle helpers are not implemented yet (needs evaluation whether these are needed):
  `waitForLightningPayment`, `getPendingLightningReceives`, `getPendingLightningSends`,
  `getSwapHistory`, `getLightningLimits`, `getLightningFees`
- Transaction routing enum includes `EMAIL`, but email payments are not implemented
- BIP21 helpers are available in `src/lib/bip21.js`, but `sendTransaction`/`quoteSendTransaction` currently expect direct destination values (Ark/BTC/BOLT11), not a BIP21 URI

## Repository Structure

```text
arkade-wdk/
├── src/
│   ├── lib/                               # address, bip21, bolt11, lnurl, fees, formatting, send routing
│   ├── wallet-manager-arkade.js           # WDK wallet manager implementation
│   ├── wallet-account-arkade.js           # WDK full account (extends read-only)
│   ├── wallet-account-read-only-arkade.js # WDK read-only account (extends WalletAccountReadOnly)
│   ├── types.js                           # ArkadeWalletConfig typedef
│   └── index.js                           # package exports
├── packages/
│   ├── pear-wrk-wdk/                      # submodule: bare-kit worklet runtime (HRPC schema + handlers)
│   └── wdk-react-native-provider/         # submodule: React Native provider (WDK service, contexts, UI wiring)
├── examples/
│   └── wdk-starter-react-native/          # submodule: Expo example app
├── patches/
│   ├── pear-wrk-wdk.patch
│   ├── wdk-react-native-provider.patch
│   └── wdk-starter-react-native.patch
└── scripts/
    ├── setup-dev.js                       # local dev setup helper
    ├── apply-patches.js                   # apply ./patches to each submodule
    └── generate-patches.js                # regenerate ./patches from submodule diffs
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
git submodule update --init --recursive
git submodule foreach 'git checkout main && git pull origin main'
node scripts/apply-patches.js
npm run setup:dev
```

## Quick Start

```javascript
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

```javascript
const { invoice, paymentHash } = await account.createLightningInvoice(50_000, 'Payment for coffee')
console.log(invoice) // BOLT11 invoice string
```

Pay to Lightning address / LNURL (using utilities from `src/lib/`):

```javascript
import { fetchInvoice, isLightningAddress } from '@arkade-os/wdk/src/lib/lnurl.js'

if (isLightningAddress('user@wallet.com')) {
  const invoice = await fetchInvoice('user@wallet.com', 1000, 'tip')
  await account.sendTransaction({ to: invoice, value: 1000n })
}
```

## API Reference

### WalletManagerArkade

```javascript
class WalletManagerArkade extends WalletManager {
  // inherited from @tetherto/wdk-wallet WalletManager
  static getRandomSeedPhrase(wordCount) // 12 | 24 → string
  static isValidSeedPhrase(seedPhrase)  // string → boolean

  constructor(seed, config)             // (string | Uint8Array, ArkadeWalletConfig?) → void
  getAccount(index)                     // (number?) → Promise<WalletAccountArkade>
  getAccountByPath(path)                // (string) → Promise<WalletAccountArkade>
  getFeeRates()                         // () → Promise<{ normal: bigint, fast: bigint }>
  dispose()                             // () → void
}
```

### WalletAccountReadOnlyArkade

```javascript
class WalletAccountReadOnlyArkade extends WalletAccountReadOnly {
  getAddress()                          // () → Promise<string>  (inherited from base)
  getBoardingAddress()                  // () → Promise<string>
  getBalance()                          // () → Promise<bigint>
  getTransactionHistory()               // () → Promise<ArkTransaction[]>
  verify(message, signature)            // (string, string) → Promise<boolean>
  getTransactionReceipt(hash)           // (string) → Promise<unknown | null>
  getTokenBalance(tokenAddress)         // (string) → Promise<bigint>
  quoteSendTransaction(tx)              // (Transaction) → Promise<{ fee: bigint }>
  quoteTransfer(options)                // ({ token, recipient, amount }) → Promise<{ fee: bigint }>
}
```

### WalletAccountArkade

```javascript
class WalletAccountArkade extends WalletAccountReadOnlyArkade {
  index                                 // number (readonly)
  path                                  // string (readonly)
  keyPair                               // { publicKey: Uint8Array, privateKey: Uint8Array | null } (readonly)
  arkadeSwaps                           // ArkadeSwaps | null (readonly)

  sendTransaction(tx)                   // (Transaction) → Promise<{ hash: string, fee: bigint }>
  quoteSendTransaction(tx)              // (Transaction) → Promise<{ fee: bigint }>
  transfer(options)                     // ({ token, recipient, amount }) → Promise<{ hash: string, fee: bigint }>
  sign(message)                         // (string) → Promise<string>
  toReadOnlyAccount()                   // () → Promise<WalletAccountReadOnlyArkade>
  dispose()                             // () → void
  createLightningInvoice(amount, desc)  // (number, string?) → Promise<{ invoice: string, paymentHash: string }>
}
```

### Internal Utilities (src/lib/)

These are available as direct imports from `src/lib/` but are not part of the public API surface:

- **`address.js`** — `isArkAddress`, `isBTCAddress`, `isLightningInvoice`, `decodeArkAddress`
- **`send.js`** — `detectTransactionType`, `quoteSend`, `send`, `TransactionType`
- **`bip21.js`** — `isBip21`, `decodeBip21`, `encodeBip21`
- **`bolt11.js`** — `decodeInvoice`, `isValidInvoice`
- **`lnurl.js`** — `isLnUrl`, `isLightningAddress`, `isValidLnUrl`, `getCallbackUrl`, `checkLnUrlConditions`, `fetchInvoice`, `fetchArkAddress`, `getLnUrlLimits`, `extractRecipientFromMetadata`
- **`fees.js`** — `calculateOffchainFee`, `calculateOnchainFee`, `calculateLightningFee`
- **`format.js`** — `fromSatoshis`, `toSatoshis`, `formatSats`, `formatSatsWithCommas`, `prettyNumber`

## Configuration

```javascript
/** @type {import('@arkade-os/wdk/src/types.js').ArkadeWalletConfig} */
const config = {
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

Or use the setup script which also links:

```bash
npm run setup:dev
```

### Patch management

Because the submodules are upstream repos, local modifications are tracked as patch files under `./patches/` rather than as commits in forks. This keeps the parent repo's changes visible without requiring write access to the upstream repos.

#### Apply patches (after a fresh clone or submodule update)

```bash
node scripts/apply-patches.js
```

Run with `--check` to verify patches apply cleanly without modifying the working tree:

```bash
node scripts/apply-patches.js --check
```

#### Regenerate patches (after editing submodule files)

```bash
node scripts/generate-patches.js
```

This compares each submodule's working tree against `origin/main` and overwrites the corresponding file in `./patches/`. Commit the updated patch files to the parent repo.

Specify a different base ref with `--base`:

```bash
node scripts/generate-patches.js --base origin/v2
```

#### Typical patch-update workflow

```bash
# 1. Edit files inside the submodule
cd packages/wdk-react-native-provider
# ... edit files ...

# 2. Regenerate the patch from the parent repo root
cd ../..
node scripts/generate-patches.js

# 3. Commit the updated patch to the parent repo
git add patches/wdk-react-native-provider.patch
git commit -m "Update wdk-react-native-provider patch"
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
