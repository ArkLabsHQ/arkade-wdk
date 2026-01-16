/**
 * Tests for WDK (official @tetherto/wdk WdkManager)
 *
 * These tests verify that WalletManagerArkade integrates correctly
 * with the official WDK Manager.
 */
import WdkManager from '@tetherto/wdk';
import type { ArkadeWalletConfig } from '../types.js';
import WalletManagerArkade from '../wallet-manager-arkade.js';

describe('WDK Integration', () => {
  const validSeedPhrase =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

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

    // Note: Using 'as any' because our WalletConfig type differs from official WDK
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
