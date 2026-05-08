/**
 * Tests for WDK (official @tetherto/wdk WdkManager)
 *
 * These tests verify that WalletManagerArkade integrates correctly
 * with the official WDK Manager.
 */
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import WdkManager from '@tetherto/wdk';
import WalletManagerArkade from '../wallet-manager-arkade.js';
import { WalletAccountReadOnlyArkade } from '../wallet-account-read-only-arkade.js';
import { WalletAccountArkade } from '../wallet-account-arkade.js';
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { Wallet } from '@arkade-os/sdk';

const validSeedPhrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Stub arkProvider so constructing WalletManagerArkade never fires a real fetch
const stubArkProvider = {
  getInfo: () => Promise.resolve({ network: 'testnet', fees: { txFeeRate: '1' } }),
};

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
      getBalance: mock.fn(() => Promise.resolve({ total: 100000, assets: [] })),
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

  it('subscribeToIncomingFunds delegates to wallet notifyIncomingFunds', async () => {
    const unsubscribe = mock.fn();
    const notifyIncomingFunds = mock.fn((_callback) => Promise.resolve(unsubscribe));
    const mockWallet = {
      notifyIncomingFunds,
    };
    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/0",
      mockWallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );
    const callback = mock.fn();

    const result = await account.subscribeToIncomingFunds(callback);

    assert.equal(notifyIncomingFunds.mock.callCount(), 1);
    assert.equal(notifyIncomingFunds.mock.calls[0].arguments[0], callback);
    assert.equal(result, unsubscribe);
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
    const account = new WalletAccountReadOnlyArkade('ark1testaddress', {}, {}, Promise.resolve({}));

    assert.ok(account instanceof WalletAccountReadOnly);
  });

  it('getAddress() returns address set at construction time', async () => {
    const account = new WalletAccountReadOnlyArkade('ark1myaddress', {}, {}, Promise.resolve({}));

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

describe('toReadOnlyAccount isolation', () => {
  /**
   * Mock signing wallet that exposes every method on IWallet — including
   * the signing surface — so the test can verify which of them survive the
   * projection into the read-only facade.
   */
  function makeSigningWalletMock() {
    const pubkey = new Uint8Array(33).fill(0xee);
    return {
      identity: {
        compressedPublicKey: () => Promise.resolve(pubkey),
        // Real signing identities expose .key (the 32-byte secret) and .sign.
        // The read-only projection must not surface either of these.
        key: new Uint8Array(32).fill(0xaa),
        sign: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
      },
      send: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
      sendBitcoin: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
      settle: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
      getAddress: mock.fn(() => Promise.resolve('ark1addrFromUnderlying')),
      getBoardingAddress: mock.fn(() => Promise.resolve('bc1boarding')),
      getBalance: mock.fn(() => Promise.resolve({ total: 12345, assets: [] })),
      getVtxos: mock.fn(() => Promise.resolve([])),
      getBoardingUtxos: mock.fn(() => Promise.resolve([])),
      getTransactionHistory: mock.fn(() => Promise.resolve([])),
      getContractManager: mock.fn(() => ({})),
      assetManager: {
        getAssetDetails: mock.fn((id) => Promise.resolve({ assetId: id })),
        issue: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
        reissue: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
        burn: mock.fn(() => Promise.reject(new Error('should not be reachable'))),
      },
    };
  }

  it('returns a WalletAccountReadOnlyArkade instance', async () => {
    const wallet = makeSigningWalletMock();
    const account = new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      wallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );

    const readonly = await account.toReadOnlyAccount();

    assert.ok(readonly instanceof WalletAccountReadOnlyArkade);
    assert.ok(readonly instanceof WalletAccountReadOnly);
  });

  it('facade does not expose signing methods', async () => {
    const wallet = makeSigningWalletMock();
    const account = new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      wallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );

    const readonly = await account.toReadOnlyAccount();
    const facade = /** @type {Record<string, unknown>} */ (readonly._wallet);

    assert.equal(facade.send, undefined);
    assert.equal(facade.sendBitcoin, undefined);
    assert.equal(facade.settle, undefined);
  });

  it('facade identity has no private-key material', async () => {
    const wallet = makeSigningWalletMock();
    const account = new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      wallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );

    const readonly = await account.toReadOnlyAccount();
    const identity = /** @type {Record<string, unknown>} */ (readonly._wallet.identity);

    assert.notEqual(identity, wallet.identity, 'must be a fresh ReadonlySingleKey, not the signing identity');
    assert.equal(identity.key, undefined, 'must not expose the .key secret bytes');
    assert.equal(typeof identity.sign, 'undefined', 'must not expose a .sign method');
  });

  it('facade assetManager exposes only getAssetDetails', async () => {
    const wallet = makeSigningWalletMock();
    const account = new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      wallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );

    const readonly = await account.toReadOnlyAccount();
    const am = /** @type {Record<string, unknown>} */ (readonly._wallet.assetManager);

    assert.equal(typeof am.getAssetDetails, 'function');
    assert.equal(am.issue, undefined);
    assert.equal(am.reissue, undefined);
    assert.equal(am.burn, undefined);
  });

  it('read-only methods proxy through to the underlying wallet', async () => {
    const wallet = makeSigningWalletMock();
    const account = new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      wallet,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      null
    );

    const readonly = await account.toReadOnlyAccount();

    assert.equal(await readonly.getBoardingAddress(), 'bc1boarding');
    assert.equal(await readonly.getBalance(), 12345n);
  });
});

describe('Per-account wallet isolation', () => {
  let walletCreateMock;

  /** Creates a mock wallet whose address is derived from the identity's public key. */
  function makeMockWallet() {
    let callCount = 0;
    walletCreateMock = mock.method(Wallet, 'create', async (config) => {
      const pubkey = await config.identity.xOnlyPublicKey();
      const addr = `ark1mock_${Buffer.from(pubkey).toString('hex').slice(0, 8)}`;
      callCount++;
      return {
        getAddress: () => Promise.resolve(addr),
        indexerProvider: {},
        dispose: mock.fn(),
        identity: config.identity,
        _callIndex: callCount,
      };
    });
  }

  afterEach(() => {
    walletCreateMock?.mock.restore();
  });

  it('different account indices produce distinct wallets', async () => {
    makeMockWallet();
    const manager = new WalletManagerArkade(validSeedPhrase, { arkProvider: stubArkProvider });

    const account0 = await manager.getAccount(0);
    const account1 = await manager.getAccount(1);

    const addr0 = await account0.getAddress();
    const addr1 = await account1.getAddress();

    assert.notEqual(addr0, addr1, 'accounts at different indices must have different addresses');
    assert.equal(walletCreateMock.mock.callCount(), 2, 'Wallet.create called once per index');
  });

  it('same account index returns cached instance', async () => {
    makeMockWallet();
    const manager = new WalletManagerArkade(validSeedPhrase, { arkProvider: stubArkProvider });

    const first = await manager.getAccount(0);
    const second = await manager.getAccount(0);

    assert.equal(first, second, 'same index must return the same cached account');
    assert.equal(walletCreateMock.mock.callCount(), 1, 'Wallet.create called only once');
  });

  it('dispose calls wallet.dispose() for each created wallet', async () => {
    makeMockWallet();
    const manager = new WalletManagerArkade(validSeedPhrase, { arkProvider: stubArkProvider });

    const account0 = await manager.getAccount(0);
    const account1 = await manager.getAccount(1);

    await manager.dispose();

    assert.equal(account0._wallet.dispose.mock.callCount(), 1);
    assert.equal(account1._wallet.dispose.mock.callCount(), 1);
  });
});
