import WalletManagerArkade from '../wallet-manager-arkade.js';
import { WalletAccountArkade } from '../bitcoin-arkade.js';
import { ArkadeWalletConfig } from '../types.js';
import WdkManager from '@tetherto/wdk';

const validSeedPhrase = 'cook voyage document eight skate token alien guide drink uncle term abuse';

describe('WalletManagerArkade', () => {
  let wdk: WdkManager;

  beforeEach(async () => {
    wdk = new WdkManager(validSeedPhrase);
    const config: ArkadeWalletConfig = {
      arkServerUrl: 'https://arkade.computer',
    };
    wdk = wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
  });

  afterEach(async () => {
    wdk.dispose();
  });

  describe('constructor', () => {
    test('should successfully initialize a wallet manager', async () => {
      const manager = new WalletManagerArkade(validSeedPhrase, {
        arkServerUrl: 'https://arkade.computer',
      });
      expect(manager).toBeInstanceOf(WalletManagerArkade);
      expect(manager.dispose).toBeDefined();
      expect(manager.getAccount).toBeDefined();
      expect(manager.getAccountByPath).toBeDefined();
      expect(manager.getFeeRates).toBeDefined();
    });

    test('should initialize with the same address', async () => {
      const manager = new WalletManagerArkade(validSeedPhrase, {
        arkServerUrl: 'https://arkade.computer',
      });
      const arkadeAccount0 = await manager.getAccount();
      const wdkAccount0 = await wdk.getAccount('bitcoin');
      expect(await arkadeAccount0.getAddress()).toBe(await wdkAccount0.getAddress());
    });
  });

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wdk.getAccount('bitcoin');
      expect(account).toBeInstanceOf(WalletAccountArkade);
      expect(account.path).toBe("m/86'/0/0'/0/0");
    });

    test('should return the account at the given index', async () => {
      const account = await wdk.getAccount('bitcoin', 3);
      expect(account).toBeInstanceOf(WalletAccountArkade);
      expect(account.path).toBe("m/86'/0/0'/0/3");
    });

    test('should throw if the index is a negative number', async () => {
      await expect(wdk.getAccount('bitcoin', -1)).rejects.toThrow('invalid child index: -1');
    });
  });

  describe('getAccountByPath', () => {
    test('should throw on invalid path', async () => {
      await expect(wdk.getAccountByPath('bitcoin', "0'/0/0")).rejects.toThrow(
        'Path must start with \"m\" or \"M\"'
      );
    });
  });

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      const feeRates = await wdk.getFeeRates('bitcoin');
      expect(feeRates.normal).toBe(0n);
      expect(feeRates.fast).toBe(0n);
    });
  });
});
