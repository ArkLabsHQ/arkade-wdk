# @arkade/wdk-core

A WDK (Wallet Development Kit) implementation using the Arkade Bitcoin SDK with Ark protocol support. This library provides a unified interface for building Bitcoin wallets with advanced features like off-chain transactions via virtual UTXOs (VTXOs).

## Features

- **Unified Wallet Interface**: Consistent API following WDK design principles
- **Ark Protocol Support**: Leverage Arkade's dual-layer transactions (on-chain and off-chain)
- **Self-Custodial**: Private keys remain under user control
- **Modular Architecture**: Extensible design for adding new wallet types and protocols
- **TypeScript**: Full type safety and excellent developer experience

## Installation

```bash
npm install @arkade/wdk-core @arkade-os/sdk
```

## Quick Start

```typescript
import { WDK, BitcoinArkadeWallet } from '@arkade/wdk-core';

// Initialize WDK with a BIP39 seed phrase
const seedPhrase = 'your twelve word seed phrase goes here and so on';
const wdk = new WDK(seedPhrase);

// Register Bitcoin wallet with Arkade
wdk.registerWallet('bitcoin', BitcoinArkadeWallet, {
  serverUrl: 'https://ark-server.example.com',
  network: 'testnet',
});

// Get account and check balance
const account = await wdk.getAccount('bitcoin', 0);
const balance = await account.getBalance();

console.log('Available balance:', balance.available);
console.log('Address:', account.address);
console.log('Boarding address:', account.boardingAddress);

// Send Bitcoin
const txid = await account.sendTransaction({
  to: 'recipient-address',
  amount: 100000n, // Amount in satoshis
});

console.log('Transaction sent:', txid);
```

## Architecture

This implementation follows the WDK architectural principles:

### Core Components

- **WDK**: Main orchestrator that manages wallet and protocol modules
- **WalletModule**: Interface for blockchain-specific implementations
- **ProtocolModule**: Interface for DeFi operations (swaps, bridges, lending)
- **StorageAdapter**: Pluggable storage for wallet state

### Bitcoin Implementation

The `BitcoinArkadeWallet` wraps the Arkade SDK to provide:

- **Dual-layer transactions**: On-chain and off-chain via VTXOs
- **Balance management**: Track available, settled, preconfirmed, and recoverable funds
- **Unilateral exit**: Users can independently withdraw without server cooperation
- **Transaction history**: Complete record of wallet activity

## API Reference

### WDK Class

```typescript
class WDK {
  constructor(seedPhrase: string);

  registerWallet(
    name: string,
    WalletClass: WalletModuleConstructor,
    config: WalletConfig
  ): this;

  registerProtocol(
    name: string,
    ProtocolClass: ProtocolModuleConstructor,
    config?: unknown
  ): this;

  getAccount(walletName: string, index?: number): Promise<WalletAccount>;
  executeProtocol(protocolName: string, params: unknown): Promise<unknown>;
  getWallet(name: string): WalletModule | undefined;
  getProtocol(name: string): ProtocolModule | undefined;
}
```

### WalletAccount Interface

```typescript
interface WalletAccount {
  address: string;
  boardingAddress: string;
  getBalance(): Promise<Balance>;
  sendTransaction(params: TransactionParams): Promise<string>;
  getTransactionHistory(): Promise<Transaction[]>;
  signMessage(message: string): Promise<string>;
  verifySignature(message: string, signature: string): Promise<boolean>;
}
```

### Balance Structure

```typescript
interface Balance {
  available: bigint;      // Immediately spendable funds
  settled: bigint;        // Settled but not yet spendable
  preconfirmed: bigint;   // Pending confirmation
  recoverable: bigint;    // Funds that can be recovered
  total: bigint;          // Sum of all balances
}
```

## Storage Adapters

The library includes a built-in `MemoryStorage` adapter for development. For production, implement custom storage:

```typescript
import { StorageAdapter } from '@arkade/wdk-core';

class CustomStorage implements StorageAdapter {
  async get(key: string): Promise<string | null> { /* ... */ }
  async set(key: string, value: string): Promise<void> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
  async clear(): Promise<void> { /* ... */ }
}

wdk.registerWallet('bitcoin', BitcoinArkadeWallet, {
  serverUrl: 'https://ark-server.example.com',
  storage: new CustomStorage(),
});
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format code
npm run format
```

## Roadmap

- [ ] Implement proper BIP32/BIP44 key derivation from seed phrase
- [ ] Add signature verification for Bitcoin messages
- [ ] Implement swap protocol modules
- [ ] Implement bridge protocol modules
- [ ] Add support for additional storage adapters (localStorage, IndexedDB, filesystem)
- [ ] Comprehensive test coverage
- [ ] Add VTXO lifecycle management utilities
- [ ] Support for custom fee strategies

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass
2. Code follows the existing style (run `npm run format`)
3. New features include appropriate tests
4. Documentation is updated

## License

Apache-2.0

## Resources

- [WDK Documentation](https://docs.wallet.tether.io/sdk)
- [Arkade SDK](https://github.com/arkade-os/ts-sdk)
- [WDK Core Reference](https://github.com/tetherto/wdk-core)
