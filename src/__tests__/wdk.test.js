/**
 * Tests for WDK (official @tetherto/wdk WdkManager)
 *
 * These tests verify that WalletManagerArkade integrates correctly
 * with the official WDK Manager.
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import WdkManager from '@tetherto/wdk';
import WalletManagerArkade from '../wallet-manager-arkade.js';
import { WalletAccountReadOnlyArkade } from '../wallet-account-read-only-arkade.js';
import { WalletAccountArkade } from '../wallet-account-arkade.js';
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';

const validSeedPhrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Stub arkProvider so constructing WalletManagerArkade never fires a real fetch
const stubArkProvider = { getInfo: () => Promise.resolve({ network: 'testnet', fees: { txFeeRate: '1' } }) };

describe('WDK Integration', () => {
  it('should create WdkManager instance with valid seed phrase', () => {
    assert.doesNotThrow(() => new WdkManager(validSeedPhrase));
  });

  it('should create WdkManager instance with Uint8Array seed', () => {
    const seed = new Uint8Array(64);
    assert.doesNotThrow(() => new WdkManager(seed));
  });

  it('should register WalletManagerArkade', () => {
    const wdk = new WdkManager(validSeedPhrase);
    const config = { arkProvider: stubArkProvider };

    assert.doesNotThrow(() => {
      wdk.registerWallet('bitcoin', WalletManagerArkade, config);
    });
  });

  it('should support method chaining', () => {
    const wdk = new WdkManager(validSeedPhrase);
    const config = { arkProvider: stubArkProvider };

    const result = wdk.registerWallet('bitcoin', WalletManagerArkade, config);
    assert.equal(result, wdk);
  });

  it('should dispose without errors', () => {
    const wdk = new WdkManager(validSeedPhrase);
    const config = { arkProvider: stubArkProvider };

    wdk.registerWallet('bitcoin', WalletManagerArkade, config);
    assert.doesNotThrow(() => wdk.dispose());
  });
});

describe('Asset Support', () => {
  it('getTokenBalance returns 0n for unknown asset', async () => {
    const mockWallet = {
      getBalance: mock.fn(() =>
        Promise.resolve({ total: 100000, assets: [] })
      ),
    };

    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      mockWallet,
      {},
      Promise.resolve({})
    );

    const balance = await account.getTokenBalance('unknown-asset-id');
    assert.equal(balance, 0n);
  });

  it('getTokenBalance returns correct balance for known asset', async () => {
    const mockWallet = {
      getBalance: mock.fn(() =>
        Promise.resolve({
          total: 100000,
          assets: [
            { assetId: 'asset-aaa', amount: 500 },
            { assetId: 'asset-bbb', amount: 1200 },
          ],
        })
      ),
    };

    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      mockWallet,
      {},
      Promise.resolve({})
    );

    assert.equal(await account.getTokenBalance('asset-aaa'), 500n);
    assert.equal(await account.getTokenBalance('asset-bbb'), 1200n);
  });

  it('transfer sends asset via wallet.send()', async () => {
    const mockSend = mock.fn(() => Promise.resolve('txid-abc123'));
    const mockWallet = { send: mockSend };
    const mockArkInfo = Promise.resolve({ fees: { txFeeRate: '2' } });

    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/0",
      mockWallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      mockArkInfo,
      null
    );

    const result = await account.transfer({
      token: 'asset-aaa',
      recipient: 'ark1recipient',
      amount: 100n,
    });

    assert.deepEqual(mockSend.mock.calls[0].arguments[0], {
      address: 'ark1recipient',
      assets: [{ assetId: 'asset-aaa', amount: 100 }],
    });
    assert.equal(result.hash, 'txid-abc123');
    assert.equal(result.fee, 300n); // 150 vB * 2 sat/vB
  });

  it('quoteTransfer returns offchain fee estimate', async () => {
    const mockArkInfo = Promise.resolve({ fees: { txFeeRate: '2' } });

    const account = new WalletAccountReadOnlyArkade('ark1testaddress', {}, {}, mockArkInfo);

    const result = await account.quoteTransfer({
      token: 'asset-aaa',
      recipient: 'ark1recipient',
      amount: 500n,
    });

    assert.equal(result.fee, 300n); // 150 vB * 2 sat/vB
  });
});

describe('Base class conformance', () => {
  it('read-only account extends WalletAccountReadOnly', () => {
    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      {},
      {},
      Promise.resolve({})
    );

    assert.ok(account instanceof WalletAccountReadOnly);
  });

  it('getAddress() returns address set at construction time', async () => {
    const account = new WalletAccountReadOnlyArkade(
      'ark1myaddress',
      {},
      {},
      Promise.resolve({})
    );

    assert.equal(await account.getAddress(), 'ark1myaddress');
  });

  it('full account has path, index, and keyPair', () => {
    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/5",
      {},
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );

    assert.equal(account.path, "m/86'/0'/0'/0/5");
    assert.equal(account.index, 5);
    assert.ok(account.keyPair.publicKey instanceof Uint8Array);
  });

  it('dispose securely erases private key', () => {
    const privateKey = new Uint8Array(32);
    privateKey.fill(0xab);

    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/0",
      {},
      { publicKey: new Uint8Array(33), privateKey },
      {},
      Promise.resolve({}),
      null
    );

    account.dispose();
    assert.ok(privateKey.every((b) => b === 0));
  });
});
