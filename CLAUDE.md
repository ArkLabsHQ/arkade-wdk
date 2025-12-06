# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript implementation of the WDK (Wallet Development Kit) core using the Arkade Bitcoin SDK. The project bridges two ecosystems:

- **WDK**: A modular plug-in framework for multi-chain wallet development (from Tether.io)
- **Arkade SDK**: A Bitcoin wallet SDK with Ark protocol support for off-chain transactions

The goal is to provide a **WDK-compatible interface** that leverages Arkade's dual-layer transaction capabilities (on-chain Bitcoin + off-chain VTXOs). This implementation follows the official `@tetherto/wdk` and `@tetherto/wdk-wallet` API patterns.

## Architecture

### Core Design Pattern

The project integrates with the official WDK framework by extending the `WalletManager` base class:

1. **WDK Integration** - Uses official `WdkManager` from `@tetherto/wdk` package
2. **Wallet Managers** ([src/wallets/](src/wallets/)) - Extends official `WalletManager` class from `@tetherto/wdk-wallet`
3. **Wallet Accounts** - Implements official `IWalletAccount` interface
4. **Protocol Modules** - Implements official protocol interfaces (`ISwapProtocol`, etc.)
5. **Storage Adapters** - Pluggable persistence layer for wallet state

### Key Components

- [src/wallets/bitcoin-arkade.ts](src/wallets/bitcoin-arkade.ts) - `WalletManagerArkade` extending official `WalletManager` class
- [src/types.ts](src/types.ts) - Arkade-specific type extensions (imports official WDK types)
- [src/storage/memory-storage.ts](src/storage/memory-storage.ts) - In-memory storage adapter
- [src/utils/seed-phrase.ts](src/utils/seed-phrase.ts) - BIP39 seed phrase utilities

### Type System and Official WDK Integration

**Important**: This project uses official WDK types from `@tetherto/wdk` and `@tetherto/wdk-wallet` (v1.0.0-beta.4 and v1.0.0-beta.5) as devDependencies. The `WalletManagerArkade` class extends the official `WalletManager` base class and integrates seamlessly with the official `WdkManager`.

**Official WDK Types Used:**
- `IWalletAccount`, `IWalletAccountReadOnly` - Core wallet account interfaces
- `IWalletManager`, `WalletManager` - Wallet manager base class and interface
- `ISwapProtocol`, `IBridgeProtocol`, `ILendingProtocol` - Protocol interfaces
- `Transaction`, `TransactionResult`, `TransferResult` - Transaction types
- `WalletConfig` - Base configuration interface

**Arkade-Specific Extensions ([src/types.ts](src/types.ts)):**
- `ArkadeWalletConfig` - Extends `WalletConfig` with Arkade-specific properties (`serverUrl`, `host`, `port`, `network`)
- `Balance` - Detailed balance with VTXO states (available, settled, preconfirmed, recoverable)
- `Transfer` - Arkade-specific transfer format with `bigint` values
- `FeeRates` - Fee rates in `bigint` format

**Type Mapping Notes:**
- Official WDK types use `bigint` for amounts; our implementation handles conversion where needed
- Arkade SDK requires Bitcoin-specific config; we map `ArkadeWalletConfig` to Arkade's internal format
- Full integration tested with official `WdkManager` from `@tetherto/wdk`

### Official WDK Interface Implementation

The `WalletManagerArkade` class extends the official `WalletManager` base class from `@tetherto/wdk-wallet`:

```typescript
import WalletManager from '@tetherto/wdk-wallet';

export class WalletManagerArkade extends WalletManager {
  // Implements required abstract methods:
  // - getAccount(index?: number): Promise<IWalletAccount>
  // - getAccountByPath(path: string): Promise<IWalletAccount>
  // - getFeeRates(): Promise<FeeRates>
  // - dispose(): void

  // Implements required static methods:
  // - static getRandomSeedPhrase(): string
  // - static isValidSeedPhrase(seedPhrase: string): boolean
}
```

**Key Interfaces** (imported from `@tetherto/wdk-wallet`):
- `IWalletAccount` - Core wallet account interface with transaction methods
- `IWalletAccountReadOnly` - Read-only account for balance queries
- `IWalletManager` - Wallet manager interface (base for `WalletManager`)
- `WalletConfig` - Base configuration (extended by `ArkadeWalletConfig`)

**Protocol Interfaces** (imported from `@tetherto/wdk-wallet`):
- `ISwapProtocol` - Swap/exchange protocol interface
- `IBridgeProtocol` - Cross-chain bridge protocol interface
- `ILendingProtocol` - Lending/borrowing protocol interface

### Arkade-Specific Extensions

The `WalletAccountArkade` class implements `IWalletAccount` and exposes additional Arkade-specific functionality:
- `wallet` getter - Provides direct access to the underlying Arkade SDK `Wallet` instance for advanced features
- `getBoardingAddress()` - Get on-chain boarding address for funding the Ark protocol
- `getBalanceDetailed()` - Get detailed balance breakdown (available, settled, preconfirmed, recoverable)

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Watch mode for development
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Clean build artifacts
npm run clean
```

## Testing Strategy

Tests are located in [src/__tests__/](src/__tests__/) and use Jest with ts-jest for TypeScript support.

Run a single test file:
```bash
npm test -- wdk.test.ts
```

Run tests matching a pattern:
```bash
npm test -- --testNamePattern="registerWallet"
```

## Important Implementation Details

### WDK API Integration

The implementation integrates with the official `@tetherto/wdk` package:

**Using Official WdkManager:**
```typescript
import WdkManager from '@tetherto/wdk';
import { WalletManagerArkade } from '@arkade/wdk-core';

const wdk = new WdkManager(seedPhrase);

// Register Arkade wallet for Bitcoin
wdk.registerWallet('bitcoin', WalletManagerArkade, {
  serverUrl: 'https://ark-server.example.com',
  network: 'testnet'
} as any); // Type assertion needed for Arkade-specific config

// Get account
const account = await wdk.getAccount('bitcoin', 0);
const accountByPath = await wdk.getAccountByPath('bitcoin', "0'/0/5");

// Register protocol (if needed)
wdk.registerProtocol('bitcoin', 'swap-example', SwapProtocol, config);
```

**Account Methods (WDK-compatible):**
```typescript
// Standard WDK methods
const address = await account.getAddress();
const balance = await account.getBalance(); // Returns bigint (satoshis)
const result = await account.sendTransaction({
  to: 'address',
  value: 10000n // bigint satoshis
});
const transfers = await account.getTransfers({ limit: 10, offset: 0 });

// Arkade-specific methods (cast account to access)
const boardingAddress = await account.getBoardingAddress();
const detailedBalance = await account.getBalanceDetailed();

// Direct access to Arkade SDK Wallet for advanced features
const arkadeWallet = account.wallet;
const vtxos = await arkadeWallet.getVtxos();
const history = await arkadeWallet.getTransactionHistory();
```

### Seed Phrase Derivation

**Status**: ✅ **Implemented** - The [src/wallets/bitcoin-arkade.ts](src/wallets/bitcoin-arkade.ts) implementation properly derives keys from seed phrases using BIP32/BIP44.

**Implementation Details**:
- Uses `@scure/bip32` for HD key derivation
- Uses `@scure/bip39` for mnemonic to seed conversion
- Derives keys using BIP44 path: `m/44'/0'/account'/change/index` for Bitcoin
- Private method `derivePrivateKey()` handles the derivation
- Derived private key is passed to `InMemoryKey.fromPrivateKey()`
- Supports both string (mnemonic) and Uint8Array (raw seed) inputs

### Arkade SDK Integration

The Arkade SDK is exposed through the `wallet` getter on account instances:
- **Direct SDK Access**: `account.wallet` provides the underlying Arkade `Wallet` instance
- **Dual addresses**: `getAddress()` returns Ark protocol address, `getBoardingAddress()` returns on-chain address
- **Balance states**: Available, settled, preconfirmed, and recoverable funds via `getBalanceDetailed()`
- **VTXO management**: Access VTXOs directly via `account.wallet.getVtxos()`
- **Transaction history**: Get Ark-specific history via `account.wallet.getTransactionHistory()`
- **Unilateral exit**: Users can withdraw without server cooperation

### Transaction Types

Uses official WDK types from `@tetherto/wdk-wallet`:

**Transaction** (imported from official WDK):
```typescript
{
  to: string;        // Recipient address
  value: bigint;     // Amount in base units
  data?: string;     // Optional transaction data
  // ... other WDK-standard fields
}
```

**TransactionResult** (imported from official WDK):
```typescript
{
  hash: string;      // Transaction ID
  // ... other WDK-standard fields
}
```

**Arkade-Specific Transfer** ([src/types.ts](src/types.ts)):
```typescript
{
  txid: string;
  address: string;
  vout: number;
  height: number;
  value: bigint;     // Amount in satoshis (bigint)
  direction: 'incoming' | 'outgoing';
  fee?: bigint;
  recipient?: string;
}
```

### Storage Considerations

The `MemoryStorage` adapter is suitable for development only. For production:
- Browser: Implement using `localStorage` or `IndexedDB`
- Node.js: Implement using filesystem or database
- React Native: Use `@react-native-async-storage/async-storage`

All storage operations are async to support various backends.

## Extension Points

### Adding New Wallet Managers

Create a new file in [src/wallets/](src/wallets/) extending the official `WalletManager` class:

```typescript
import WalletManager from '@tetherto/wdk-wallet';
import type { IWalletAccount } from '@tetherto/wdk-wallet';
import type { ArkadeWalletConfig, FeeRates } from '../types';

export class NewWalletManager extends WalletManager {
  constructor(seed: string | Uint8Array, config?: ArkadeWalletConfig) {
    super(seed, config);
    // Initialize with config and seed
  }

  // Implement required static methods
  static getRandomSeedPhrase(): string {
    // Generate BIP39 seed phrase
  }

  static isValidSeedPhrase(seedPhrase: string): boolean {
    // Validate BIP39 seed phrase
  }

  // Implement required instance methods
  async getAccount(index: number = 0): Promise<IWalletAccount> {
    // Get or create account at index
  }

  async getAccountByPath(path: string): Promise<IWalletAccount> {
    // Get or create account at BIP-44 path
  }

  async getFeeRates(): Promise<FeeRates> {
    // Return current network fee rates
  }

  dispose(): void {
    // Clean up sensitive data
  }
}
```

Export from [src/index.ts](src/index.ts) and register with official `WdkManager`:
```typescript
import WdkManager from '@tetherto/wdk';
const wdk = new WdkManager(seedPhrase);
wdk.registerWallet('new-chain', NewWalletManager, config);
```

### Adding Protocol Modules

Create a new file in [src/protocols/](src/protocols/) (directory doesn't exist yet) implementing the appropriate protocol interface:

```typescript
export class SwapProtocol implements ISwapProtocol {
  public readonly name = 'swap-uniswap';

  constructor(config?: unknown) {
    // Initialize with protocol-specific config
  }

  async execute(params: unknown): Promise<unknown> {
    // Implement swap logic
    // params would be typed based on the specific protocol
  }
}
```

Register with:
```typescript
wdk.registerProtocol('ethereum', 'swap-uniswap', SwapProtocol, config);
```

## Known Limitations

1. **Signature verification** ([src/wallets/bitcoin-arkade.ts:282](src/wallets/bitcoin-arkade.ts#L282)) - `verify()` method throws "not yet implemented" - requires BIP-137 Bitcoin message signing
2. **Random seed generation** ([src/utils/seed-phrase.ts:18](src/utils/seed-phrase.ts#L18)) - `getRandomSeedPhrase()` throws, needs proper BIP39 implementation using `@scure/bip39`
3. **Key derivation** ([src/wallets/bitcoin-arkade.ts:121](src/wallets/bitcoin-arkade.ts#L121)) - Currently generates random keys instead of deriving from seed phrase using BIP32/BIP44
4. **Fee estimation** ([src/wallets/bitcoin-arkade.ts:218](src/wallets/bitcoin-arkade.ts#L218)) - `quoteSendTransaction()` returns placeholder value, needs actual fee calculation
5. **Read-only accounts** - `WalletAccountReadOnlyArkade` methods not yet implemented
6. **No protocol modules** - Framework is ready but no swap/bridge/lending implementations exist yet

## Code Style

- Use TypeScript strict mode
- Official WDK types use `bigint` for amounts; convert internally as needed
- All async methods should be properly typed
- Use ES modules (`import`/`export`, not `require`)
- Target ES2022 for modern JavaScript features
- Import official types from `@tetherto/wdk-wallet` where available
- Follow WDK naming conventions: `IWalletAccount`, `IWalletManager`, `IProtocol`

## Dependencies

**Production:**
- `@arkade-os/sdk` - Core Bitcoin wallet functionality with Ark protocol
- `@scure/bip32` - BIP32 HD key derivation
- `@scure/bip39` - BIP39 mnemonic seed phrase support

**Development:**
- `@tetherto/wdk` (v1.0.0-beta.4) - Official WDK core with `WdkManager`
- `@tetherto/wdk-wallet` (v1.0.0-beta.5) - Official WDK wallet interfaces and base classes
- `@types/node` - Node.js type definitions
- TypeScript 5.3+ for latest features
- Jest for testing with ESM support via ts-jest

## Resources

- [WDK Documentation](https://docs.wallet.tether.io/sdk) - Official WDK design patterns and API reference
- [WDK Bitcoin Wallet API](https://docs.wallet.tether.io/sdk/wallet-modules/wallet-btc/api-reference) - Reference implementation
- [Arkade SDK](https://github.com/arkade-os/ts-sdk) - Underlying Bitcoin/Ark implementation
- [WDK Core Reference](https://github.com/tetherto/wdk-core) - Original WDK implementation
- [WDK Wallet Base](https://github.com/tetherto/wdk-wallet) - Base wallet interfaces
