/**
 * Tests for WDK (official @tetherto/wdk WdkManager)
 *
 * These tests verify that WalletManagerArkade integrates correctly
 * with the official WDK Manager.
 */
import { jest, describe, it, expect } from '@jest/globals';
import WdkManager from '@tetherto/wdk';
import type { ArkadeWalletConfig } from '../types.js';
import WalletManagerArkade from '../wallet-manager-arkade.js';

describe('WDK Integration', () => {
  const validSeedPhrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('should create WdkManager instance with valid seed phrase', () => {
    expect(() => new WdkManager(validSeedPhrase)).not.toThrow();
  });

  it('should create WdkManager instance with Uint8Array seed', () => {
    const seed = new Uint8Array(64);
    expect(() => new WdkManager(seed)).not.toThrow();
  });

  it('should register WalletManagerArkade', () => {
    const wdk = new WdkManager(validSeedPhrase);
    const config: ArkadeWalletConfig = {
      arkServerUrl: 'https://test.example.com',
    };

    expect(() => {
      wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
    }).not.toThrow();
  });

  it('should support method chaining', () => {
    const wdk = new WdkManager(validSeedPhrase);
    const config: ArkadeWalletConfig = {
      arkServerUrl: 'https://test.example.com',
    };

    const result = wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
    expect(result).toBe(wdk);
  });

  it('should dispose without errors', () => {
    const wdk = new WdkManager(validSeedPhrase);
    const config: ArkadeWalletConfig = {
      arkServerUrl: 'https://test.example.com',
    };

    wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
    expect(() => wdk.dispose()).not.toThrow();
  });
});

describe('Asset Support', () => {
  it('getTokenBalance returns 0n for unknown asset', async () => {
    const { WalletAccountReadOnlyArkade } = await import('../wallet-account-read-only-arkade.js');

    const mockWallet = {
      getBalance: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        total: 100000,
        assets: [],
      }),
    };

    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      mockWallet as any,
      {} as any,
      Promise.resolve({} as any),
    );

    const balance = await account.getTokenBalance('unknown-asset-id');
    expect(balance).toBe(0n);
  });

  it('getTokenBalance returns correct balance for known asset', async () => {
    const { WalletAccountReadOnlyArkade } = await import('../wallet-account-read-only-arkade.js');

    const mockWallet = {
      getBalance: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        total: 100000,
        assets: [
          { assetId: 'asset-aaa', amount: 500 },
          { assetId: 'asset-bbb', amount: 1200 },
        ],
      }),
    };

    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      mockWallet as any,
      {} as any,
      Promise.resolve({} as any),
    );

    expect(await account.getTokenBalance('asset-aaa')).toBe(500n);
    expect(await account.getTokenBalance('asset-bbb')).toBe(1200n);
  });

  it('transfer sends asset via wallet.send()', async () => {
    const { WalletAccountArkade } = await import('../wallet-account-arkade.js');

    const mockSend = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('txid-abc123');

    const mockWallet = { send: mockSend };

    const mockArkInfo = Promise.resolve({
      fees: { txFeeRate: '2' },
    } as any);

    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/0",
      mockWallet as any,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {} as any,
      mockArkInfo,
      null,
    );

    const result = await account.transfer({
      token: 'asset-aaa',
      recipient: 'ark1recipient',
      amount: 100n,
    });

    expect(mockSend).toHaveBeenCalledWith({
      address: 'ark1recipient',
      assets: [{ assetId: 'asset-aaa', amount: 100 }],
    });
    expect(result.hash).toBe('txid-abc123');
    expect(result.fee).toBe(300n); // 150 vB * 2 sat/vB
  });

  it('quoteTransfer returns offchain fee estimate', async () => {
    const { WalletAccountReadOnlyArkade } = await import('../wallet-account-read-only-arkade.js');

    const mockArkInfo = Promise.resolve({
      fees: { txFeeRate: '2' },
    } as any);

    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      {} as any,
      {} as any,
      mockArkInfo,
    );

    const result = await account.quoteTransfer({
      token: 'asset-aaa',
      recipient: 'ark1recipient',
      amount: 500n,
    });

    expect(result.fee).toBe(300n); // 150 vB * 2 sat/vB
  });
});

describe('Base class conformance', () => {
  it('read-only account extends WalletAccountReadOnly', async () => {
    const { WalletAccountReadOnly } = await import('@tetherto/wdk-wallet');
    const { WalletAccountReadOnlyArkade } = await import('../wallet-account-read-only-arkade.js');

    const account = new WalletAccountReadOnlyArkade(
      'ark1testaddress',
      {} as any,
      {} as any,
      Promise.resolve({} as any),
    );

    expect(account).toBeInstanceOf(WalletAccountReadOnly);
  });

  it('getAddress() returns address set at construction time', async () => {
    const { WalletAccountReadOnlyArkade } = await import('../wallet-account-read-only-arkade.js');

    const account = new WalletAccountReadOnlyArkade(
      'ark1myaddress',
      {} as any,
      {} as any,
      Promise.resolve({} as any),
    );

    expect(await account.getAddress()).toBe('ark1myaddress');
  });

  it('full account has path, index, and keyPair', async () => {
    const { WalletAccountArkade } = await import('../wallet-account-arkade.js');

    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/5",
      {} as any,
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {} as any,
      Promise.resolve({} as any),
      null,
    );

    expect(account.path).toBe("m/86'/0'/0'/0/5");
    expect(account.index).toBe(5);
    expect(account.keyPair.publicKey).toBeInstanceOf(Uint8Array);
  });

  it('dispose securely erases private key', async () => {
    const { WalletAccountArkade } = await import('../wallet-account-arkade.js');
    const privateKey = new Uint8Array(32);
    privateKey.fill(0xAB);

    const account = new WalletAccountArkade(
      'ark1testaddress',
      "m/86'/0'/0'/0/0",
      {} as any,
      { publicKey: new Uint8Array(33), privateKey },
      {} as any,
      Promise.resolve({} as any),
      null,
    );

    account.dispose();
    expect(privateKey.every(b => b === 0)).toBe(true);
  });
});
