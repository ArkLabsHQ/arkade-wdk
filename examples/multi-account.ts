/**
 * Example showing multi-account management
 */

import { WalletManagerArkade } from "../src/wallets/bitcoin-arkade";
import WDK from '@tetherto/wdk';
async function main() {
  const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const wdk = new WDK(seedPhrase);

  wdk.registerWallet('bitcoin', WalletManagerArkade, {
    serverUrl: 'https://ark-server.example.com',
    network: 'testnet',
  });

  // Create multiple accounts for different purposes
  const accounts = {
    savings: await wdk.getAccount('bitcoin', 0),
    spending: await wdk.getAccount('bitcoin', 1),
    trading: await wdk.getAccount('bitcoin', 2),
  };

  console.log('Account Addresses:');
  console.log('Savings account:', accounts.savings.address);
  console.log('Spending account:', accounts.spending.address);
  console.log('Trading account:', accounts.trading.address);

  // Check all balances
  console.log('\nBalances:');
  for (const [name, account] of Object.entries(accounts)) {
    const balance = await account.getBalance();
    console.log(`${name}:`, balance.total.toString(), 'sats');
  }

  // Transfer between accounts (commented for safety)
  // const txid = await accounts.savings.sendTransaction({
  //   to: accounts.spending.address,
  //   amount: 50000n,
  // });
  // console.log('\nTransfer sent:', txid);
}

main().catch(console.error);
