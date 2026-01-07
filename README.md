# @arkade-os/wdk

A WDK (Wallet Development Kit) implementation using the Arkade Bitcoin SDK with Ark protocol support. This library provides a WDK-compatible interface for building Bitcoin wallets with advanced features including off-chain transactions via VTXOs and Lightning Network integration via Boltz swaps.

## Features

- **WDK Compatible**: Extends official `@tetherto/wdk-wallet` base classes
- **Ark Protocol**: Dual-layer transactions (on-chain Bitcoin + off-chain VTXOs)
- **Lightning Network**: Send and receive via submarine/reverse swaps (Boltz)
- **LNURL Support**: Pay to Lightning addresses (user@domain.com)
- **Self-Custodial**: Private keys derived from BIP39 seed phrase
- **React Native Ready**: Full Expo integration with crypto polyfills
- **TypeScript**: Complete type safety

## Repository Structure

```
arkade-wdk/
├── src/                          # Core @arkade-os/wdk package
│   ├── lib/                      # Utilities (address, bip21, bolt11, lnurl, fees)
│   ├── wallet-manager-arkade.ts  # Main wallet manager
│   └── bitcoin-arkade.ts         # Wallet account implementation
├── packages/
│   └── wdk-react-native-provider/  # React Native provider (submodule)
├── examples/
│   └── wdk-starter-react-native/   # Example Expo app (submodule)
└── scripts/                      # Development setup
```

## Installation

```bash
# For Node.js/TypeScript projects
npm install @arkade-os/wdk @arkade-os/sdk

# For React Native/Expo - use the full setup
npm run setup:dev
```

## Quick Start

### Basic Usage with WdkManager

```typescript
import WdkManager from '@tetherto/wdk';
import { WalletManagerArkade } from '@arkade-os/wdk';

// Initialize with seed phrase
const seedPhrase = 'your twelve word seed phrase here';
const wdk = new WdkManager(seedPhrase);

// Register Arkade wallet for Bitcoin
wdk.registerWallet('bitcoin', WalletManagerArkade, {
  serverUrl: 'https://arkade.computer',
  network: 'bitcoin',
  swapProviderUrl: 'https://api.ark.boltz.exchange', // Optional: for Lightning
});

// Get account
const account = await wdk.getAccount('bitcoin', 0);

// Check balance
const balance = await account.getBalance(); // bigint in satoshis
console.log('Balance:', balance);

// Get addresses
const arkAddress = await account.getAddress();        // Off-chain Ark address
const boardingAddress = await account.getBoardingAddress(); // On-chain funding address
```

### Sending Transactions

```typescript
// Send to any destination (Ark, Bitcoin, or Lightning)
const result = await account.sendTransaction({
  to: 'ark1...', // or bc1..., or lnbc1...
  value: 10000n, // satoshis
});
console.log('Transaction:', result.hash);

// The library auto-detects the destination type:
// - Ark address -> off-chain VTXO transfer
// - Bitcoin address -> on-chain withdrawal
// - Lightning invoice -> submarine swap via Boltz
```

### Lightning Receive

```typescript
// Create a Lightning invoice to receive payment
const invoice = await account.createLightningInvoice(50000, 'Payment for coffee');
console.log('Invoice:', invoice.invoice);
console.log('Expires:', new Date(invoice.expiry * 1000));

// Wait for payment (blocking)
const { txid } = await account.waitForLightningPayment(invoice.pendingSwap);
console.log('Payment received! TXID:', txid);

// Or check pending receives
const pendingReceives = await account.getPendingLightningReceives();
```

### LNURL / Lightning Address

```typescript
import { isLightningAddress, fetchInvoice } from '@arkade-os/wdk';

// Check if it's a Lightning address
if (isLightningAddress('user@wallet.com')) {
  // Fetch invoice and pay
  const invoice = await fetchInvoice('user@wallet.com', 1000, 'tip');
  await account.sendTransaction({ to: invoice, value: 1000n });
}
```

### Detailed Balance

```typescript
const detailed = await account.getBalanceDetailed();
console.log({
  total: detailed.total,           // All funds
  settled: detailed.settled,       // Confirmed in Ark rounds
  preconfirmed: detailed.preconfirmed, // Pending confirmation
  pending: detailed.pending,       // In batches
  recoverable: detailed.recoverable,   // Can be recovered
});
```

## React Native / Expo Setup

### 1. Run Full Setup

```bash
npm run setup:dev
```

This initializes submodules, builds packages, and creates npm links.

### 2. Configure Environment

```bash
cd examples/wdk-starter-react-native
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_WDK_INDEXER_BASE_URL=https://wdk-api.tether.io
EXPO_PUBLIC_WDK_INDEXER_API_KEY=your_api_key
EXPO_PUBLIC_ARKADE_SERVER_URL=https://arkade.computer
EXPO_PUBLIC_ARKADE_NETWORK=bitcoin
EXPO_PUBLIC_ARKADE_SWAP_URL=https://api.ark.boltz.exchange
```

### 3. Crypto Polyfill

The example app includes a crypto polyfill for MuSig2 signing. It must be imported first in `_layout.tsx`:

```typescript
// src/polyfills/arkade-crypto.ts
import * as Crypto from 'expo-crypto';

if (!global.crypto) {
  (global as any).crypto = {};
}
if (!(global.crypto as any).getRandomValues) {
  (global.crypto as any).getRandomValues = Crypto.getRandomValues;
}
```

### 4. Run the App

```bash
npm run android  # or npm run ios
```

## API Reference

### WalletManagerArkade

```typescript
class WalletManagerArkade extends WalletManager {
  static getRandomSeedPhrase(): string;
  static isValidSeedPhrase(seedPhrase: string): boolean;

  getAccount(index?: number): Promise<WalletAccountArkade>;
  getAccountByPath(path: string): Promise<WalletAccountArkade>;
  getFeeRates(): Promise<FeeRates>;
  dispose(): void;
}
```

### WalletAccountArkade

```typescript
class WalletAccountArkade implements IWalletAccount {
  // Standard WDK methods
  getAddress(): Promise<string>;
  getBalance(): Promise<bigint>;
  sendTransaction(tx: Transaction): Promise<TransactionResult>;
  sign(message: string): Promise<string>;
  verify(message: string, signature: string): Promise<boolean>;

  // Arkade-specific methods
  arkadeWallet: IWallet;                    // Direct SDK access
  getBoardingAddress(): Promise<string>;
  getBalanceDetailed(): Promise<DetailedBalance>;
  getTransfers(options?): Promise<unknown[]>;
  hasLightningSupport(): boolean;

  // Lightning methods
  createLightningInvoice(amount: number, description?: string): Promise<LightningInvoice>;
  waitForLightningPayment(pendingSwap): Promise<{ txid: string }>;
  getPendingLightningReceives(): Promise<PendingReverseSwap[]>;
  getPendingLightningSends(): Promise<PendingSubmarineSwap[]>;
  getSwapHistory(): Promise<SwapHistory[]>;
  getLightningLimits(): Promise<{ min: number; max: number }>;
  getLightningFees(): Promise<{ sendFeePercent: number; receiveFeePercent: number }>;
}
```

### Utility Functions

```typescript
// Address detection
isArkAddress(addr: string): boolean
isBTCAddress(addr: string): boolean
isLightningInvoice(invoice: string): boolean

// BIP21 URIs
isBip21(uri: string): boolean
decodeBip21(uri: string): Bip21Decoded
encodeBip21(address, arkAddress, invoice, sats): string

// BOLT11 invoices
decodeInvoice(invoice: string): DecodedInvoice
isValidInvoice(invoice: string): boolean

// LNURL
isLightningAddress(addr: string): boolean
isValidLnUrl(data: string): boolean
fetchInvoice(lnurl: string, sats: number, note?: string): Promise<string>
getLnUrlLimits(lnurl: string): Promise<{ minSats, maxSats }>

// Formatting
fromSatoshis(sats: bigint): number
toSatoshis(btc: number): number
formatSats(sats: bigint): string
```

## Development

```bash
# Install and build
npm install
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Lint and format
npm run lint
npm run format

# Full dev setup (with submodules)
npm run setup:dev
```

### After Making Changes

```bash
# Rebuild core package
npm run build

# Rebuild provider (if changed)
cd packages/wdk-react-native-provider
npm run prepare
```

## Configuration

### ArkadeWalletConfig

```typescript
interface ArkadeWalletConfig {
  serverUrl: string;           // Ark server URL
  network: 'bitcoin' | 'testnet' | 'signet' | 'mutinynet' | 'regtest';
  swapProviderUrl?: string;    // Boltz API URL for Lightning
}
```

## License

Apache-2.0

## Resources

- [WDK Documentation](https://docs.wallet.tether.io/sdk)
- [Arkade SDK](https://github.com/arkade-os/ts-sdk)
- [Ark Protocol](https://ark-protocol.org)
- [Boltz Exchange](https://boltz.exchange)
