# Examples

This directory contains example usage of the @arkade/wdk-core library.

## Running Examples

First, build the project:

```bash
npm install
npm run build
```

Then run the examples:

```bash
# Basic usage example
node --experimental-specifier-resolution=node examples/basic-usage.js

# Multi-account example
node --experimental-specifier-resolution=node examples/multi-account.js
```

Note: The examples are written in TypeScript. You can either:
1. Build the project and run the compiled JavaScript from `dist/`
2. Use `ts-node` to run TypeScript directly
3. Compile the examples separately

## Available Examples

### [basic-usage.ts](basic-usage.ts)

Demonstrates:
- Initializing WDK with a seed phrase
- Registering a Bitcoin wallet with Arkade
- Getting account addresses
- Checking balances
- Sending transactions
- Viewing transaction history
- Signing messages

### [multi-account.ts](multi-account.ts)

Demonstrates:
- Managing multiple accounts from a single seed phrase
- Organizing accounts by purpose (savings, spending, trading)
- Checking balances across multiple accounts
- Transferring between accounts

## Important Notes

1. **Never use the example seed phrase in production!** The seed phrase shown in examples is public knowledge.

2. **Server URL**: Update the `serverUrl` in examples to point to a valid Ark server:
   - For testnet: Use a testnet Ark server
   - For mainnet: Use a production Ark server

3. **Network**: Make sure your server URL matches the network setting (testnet/mainnet)

4. **Safety**: Transaction sending is commented out in examples to prevent accidental execution. Uncomment carefully after verifying addresses and amounts.
