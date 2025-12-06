/**
 * Basic usage example for @arkade/wdk-core
 */

import { WDK, BitcoinArkadeWallet } from '../src/index.js';

async function main() {
  // Example seed phrase (DO NOT use this in production!)
  const seedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  // Initialize WDK
  const wdk = new WDK(seedPhrase);

  // Register Bitcoin wallet with Arkade SDK
  wdk.registerWallet('bitcoin', BitcoinArkadeWallet, {
    serverUrl: 'https://ark-server.example.com',
    network: 'testnet',
  });

  // Get the first account (index 0)
  const account = await wdk.getAccount('bitcoin', 0);

  console.log('Account addresses:');
  console.log('  Ark address:', account.address);
  console.log('  Boarding address:', account.boardingAddress);

  // Get balance
  const balance = await account.getBalance();
  console.log('\nBalance:');
  console.log('  Available:', balance.available.toString(), 'sats');
  console.log('  Settled:', balance.settled.toString(), 'sats');
  console.log('  Preconfirmed:', balance.preconfirmed.toString(), 'sats');
  console.log('  Recoverable:', balance.recoverable.toString(), 'sats');
  console.log('  Total:', balance.total.toString(), 'sats');

  // Send transaction (commented out for safety)
  // const txid = await account.sendTransaction({
  //   to: 'tb1qrecipientaddresshere',
  //   amount: 10000n, // 10,000 sats
  // });
  // console.log('\nTransaction sent:', txid);

  // Get transaction history
  const transactions = await account.getTransactionHistory();
  console.log('\nTransaction history:');
  transactions.forEach((tx) => {
    console.log(`  ${tx.type} ${tx.amount} sats - ${tx.status} - ${tx.txid}`);
  });

  // Sign a message
  const message = 'Hello, Arkade WDK!';
  const signature = await account.signMessage(message);
  console.log('\nMessage signature:');
  console.log('  Message:', message);
  console.log('  Signature:', signature);
}

main().catch(console.error);
