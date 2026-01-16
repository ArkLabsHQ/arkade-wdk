import { WalletAccountArkade, WalletAccountArkadeReadOnly } from '../bitcoin-arkade';
import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import { SingleKey, Wallet as ArkadeWallet } from '@arkade-os/sdk';
import WalletManagerArkade from '../wallet-manager-arkade';
import { ArkadeWalletConfig } from '../types';
import WdkManager from '@tetherto/wdk';
import * as bip39 from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { hex } from '@scure/base';

const PATH = "m/86'/0/0'/0/0";
const DUMMY_TX_ID = 'dummy-tx-id';
const DUMMY_PREIMAGE = 'dummy-preimage';
const MNEMONIC = 'cook voyage document eight skate token alien guide drink uncle term abuse';
const DUMMY_LIGHTNING_INVOICE =
  'lnbc10u1p5k0r0wpp59085ah43zmwkdh2y0zt5hcpdaxgq6nzjfrvgy3wf782x50uv7f3qdquf35kw6r5de5kueeqf9h8vmmfvdjscqz3txqyyzzssp57vlg82yh946re04sn0zcpclg5247e2eykhmffzldqxn6h99dz9us9qxpqysgqgasm4ydw25k0hs3tlyc2umpnme82gclcuzl9359u3jkgq42k4w7p68602t88cpzq5mj77dnc7kq4n60hg2plvww94zgxq2fgmsvlp3qq6wmykh';

describe('WalletAccountArkade', () => {
  let account: WalletAccountArkade;
  let arkadeWallet: ArkadeWallet;
  let wdk: WdkManager;
  let seed: Uint8Array<ArrayBufferLike>;
  let hdKey: HDKey;

  beforeAll(async () => {
    seed = await bip39.mnemonicToSeed(MNEMONIC);
    hdKey = HDKey.fromMasterSeed(seed).derive(PATH);
    arkadeWallet = await ArkadeWallet.create({
      arkServerUrl: 'https://arkade.computer',
      identity: SingleKey.fromPrivateKey(hdKey.privateKey!),
    });

    wdk = new WdkManager(MNEMONIC);
    const config: ArkadeWalletConfig = {
      arkServerUrl: 'https://arkade.computer',
      swapProviderUrl: 'https://api.ark.boltz.exchange',
    };
    wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
    account = (await wdk.getAccount('bitcoin', 0)) as unknown as WalletAccountArkade;

    console.log = jest.fn();
  });

  afterAll(async () => {
    wdk.dispose();
  });

  describe('constructor', () => {
    test('should successfully initialize a read only arkade account', async () => {
      expect(account).toBeInstanceOf(WalletAccountArkade);
      expect(account.path).toBe(PATH);
      expect(account.keyPair).toBeDefined();
      expect(account.getAddress).toBeDefined();
      expect(account.getBalance).toBeDefined();
      expect(account.getLatestDepositTxId).toBeDefined();
      expect(account.getSingleUseDepositAddress).toBeDefined();
      expect(account.getTokenBalance).toBeDefined();
      expect(account.getTransactionReceipt).toBeDefined();
      expect(account.getTransfers).toBeDefined();
      expect(account.getUtxosForDepositAddress).toBeDefined();
      expect(account.quoteSendTransaction).toBeDefined();
      expect(account.quoteTransfer).toBeDefined();
      expect(account.verify).toBeDefined();
    });

    test('should successfully initialize a regular arkade account', async () => {
      expect(account).toBeInstanceOf(WalletAccountArkade);
      expect(account.path).toBe(PATH);
      expect(account.keyPair).toBeDefined();
      expect(account.claimDeposit).toBeDefined();
      expect(account.createLightningInvoice).toBeDefined();
      expect(account.dispose).toBeDefined();
      expect(account.getLightningReceiveRequest).toBeDefined();
      expect(account.getLightningSendFeeEstimate).toBeDefined();
      expect(account.payLightningInvoice).toBeDefined();
      expect(account.sendTransaction).toBeDefined();
      expect(account.sign).toBeDefined();
      expect(account.toReadOnlyAccount).toBeDefined();
      expect(account.transfer).toBeDefined();
      expect(account.withdraw).toBeDefined();
    });

    test('pubkeys should match', async () => {
      const derivedPubkey = hex.encode(hdKey.publicKey!);
      const accountPubkey = hex.encode(account.keyPair.publicKey);
      const arkadePubkey = hex.encode(await arkadeWallet.identity.compressedPublicKey());
      expect(accountPubkey).toBe(derivedPubkey);
      expect(accountPubkey).toBe(arkadePubkey);
    });
  });

  describe('claimDeposit', () => {}); // TODO: implement tests for claimDeposit

  describe('createLightningInvoice', () => {
    test('should throw if lightning support is not configured', async () => {
      const wdk = new WdkManager(MNEMONIC);
      const config: ArkadeWalletConfig = {
        arkServerUrl: 'https://arkade.computer',
      };
      wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
      const account = (await wdk.getAccount('bitcoin', 0)) as unknown as WalletAccountArkade;
      await expect(account.createLightningInvoice(1000, 'Test invoice')).rejects.toThrow(
        'Lightning support not configured. Provide swapProviderUrl in wallet config.'
      );
    });

    test('should generate lightning invoice', async () => {
      const invoice = await account.createLightningInvoice(1000, 'Test invoice');
      expect(invoice).toMatch(/^lnbc10u/);
    });
  });

  describe('dispose', () => {}); // TODO: implement tests for dispose

  describe('getAddress', () => {
    test('should return the same address', async () => {
      const accountAddress = await account.getAddress();
      const arkadeAddress = await arkadeWallet.getAddress();
      expect(accountAddress).toBe(arkadeAddress);
    });
    test('should return address in correct format', async () => {
      const accountAddress = await account.getAddress();
      expect(accountAddress).toMatch(/^t*ark[a-z0-9]{100,120}$/);
    });
  });

  describe('getBalance', () => {
    test('should return the correct balance', async () => {
      const accountBalance = await account.getBalance();
      const arkadeBalance = await arkadeWallet.getBalance();
      expect(accountBalance).toBe(BigInt(arkadeBalance.total));
    });
  });

  describe('getLatestDepositTxId', () => {}); // TODO: implement tests for getLatestDepositTxId

  describe('getLightningReceiveRequest', () => {}); // TODO: implement tests for path

  describe('getLightningSendFeeEstimate', () => {}); // TODO: implement tests for path

  describe('getSingleUseDepositAddress', () => {}); // TODO: implement tests for getSingleUseDepositAddress

  describe('getTokenBalance', () => {}); // TODO: implement tests for getTokenBalance

  describe('getTransactionReceipt', () => {}); // TODO: implement tests for getTransactionReceipt

  describe('getTransfers', () => {}); // TODO: implement tests for getTransfers

  describe('getUtxosForDepositAddress', () => {}); // TODO: implement tests for getUtxosForDeposit

  describe('keyPair', () => {
    test('should have correct key pair', async () => {
      const derivedPrivateKey = hex.encode(hdKey.privateKey!);
      const accountPrivateKey = hex.encode(account.keyPair.privateKey!);
      expect(accountPrivateKey).toBe(derivedPrivateKey);
    });
  });

  describe('path', () => {}); // TODO: implement tests for path

  describe('payLightningInvoice', () => {}); // TODO: implement tests for path

  describe('quoteSendTransaction', () => {
    test('should return a valid quote', async () => {
      const tx = { to: await arkadeWallet.getAddress(), value: 1000n };
      const quote = await account.quoteSendTransaction(tx);
      expect(typeof quote.fee).toBe('bigint');
    });

    test('should return quote for offchain transaction', async () => {
      const tx = { to: await arkadeWallet.getAddress(), value: 1000n };
      const quote = await account.quoteSendTransaction(tx);
      expect(quote.fee).toBe(0n);
    });

    test('should return quote for onchain transaction', async () => {
      const tx = { to: await arkadeWallet.getBoardingAddress(), value: 1000n };
      const quote = await account.quoteSendTransaction(tx);
      expect(quote.fee).toBe(0n);
    });

    test('should return quote for lightning invoice', async () => {
      const tx = { to: await account.createLightningInvoice(1000), value: 1000n };
      const quote = await account.quoteSendTransaction(tx);
      expect(quote.fee).toBe(2n);
    });
  });

  describe('sendTransaction', () => {
    test('should send an offchain transaction successfully', async () => {
      account.wallet.sendBitcoin = jest.fn().mockResolvedValue(DUMMY_TX_ID as never) as any;
      const tx = { to: await arkadeWallet.getAddress(), value: 1000n };
      const result = await account.sendTransaction(tx);
      expect(result.hash).toBe(DUMMY_TX_ID);
      expect(result.fee).toBe(0n);
    });

    test('should send an onchain transaction successfully', async () => {
      account.wallet.sendBitcoin = jest.fn().mockResolvedValue(DUMMY_TX_ID as never) as any;
      const tx = { to: await arkadeWallet.getBoardingAddress(), value: 1000n };
      const result = await account.sendTransaction(tx);
      expect(result.hash).toBe(DUMMY_TX_ID);
      expect(result.fee).toBe(0n);
    });

    test('should send a lightning payment successfully', async () => {
      if (!account.arkadeLightning) return;
      account.arkadeLightning.sendLightningPayment = jest
        .fn()
        .mockResolvedValue({ preimage: DUMMY_PREIMAGE, txid: DUMMY_TX_ID } as never) as any;
      const tx = { to: DUMMY_LIGHTNING_INVOICE, value: 1000n };
      const result = await account.sendTransaction(tx);
      expect(result.hash).toBe(DUMMY_PREIMAGE);
      expect(result.fee).toBe(2n);
    });
  });

  describe('sign', () => {
    test('should sign a message correctly', async () => {
      const message = 'Hello, Arkade!';
      const signature = await account.sign(message);
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });
  });

  describe('toReadOnlyAccount', () => {
    test('should return a read only account', async () => {
      const readOnlyAccount = await account.toReadOnlyAccount();
      expect(readOnlyAccount).toBeInstanceOf(WalletAccountArkadeReadOnly);
      expect(readOnlyAccount.path).toBe(account.path);
      expect(readOnlyAccount.keyPair).toBeDefined();
      expect(readOnlyAccount.getAddress).toBeDefined();
      expect(readOnlyAccount.getBalance).toBeDefined();
      expect(readOnlyAccount.getTransactionReceipt).toBeDefined();
      expect(readOnlyAccount.getTokenBalance).toBeDefined();
      expect(readOnlyAccount.quoteSendTransaction).toBeDefined();
      expect(readOnlyAccount.quoteTransfer).toBeDefined();
      expect(readOnlyAccount.verify).toBeDefined();
      expect(readOnlyAccount).not.toHaveProperty('createLightningInvoice');
      expect(readOnlyAccount).not.toHaveProperty('sendTransaction');
      expect(readOnlyAccount).not.toHaveProperty('sign');
      expect(readOnlyAccount).not.toHaveProperty('toReadOnlyAccount');
      expect(readOnlyAccount).not.toHaveProperty('transfer');
    });
  });

  describe('transfer', () => {
    test('should throw when trying to transfer tokens', async () => {
      await expect(
        account.transfer({
          token: 'ARK',
          recipient: await arkadeWallet.getAddress(),
          amount: 1000n,
        })
      ).rejects.toThrow('transfer not applicable to Bitcoin wallets - use sendTransaction instead');
    });
  });

  describe('verify', () => {
    test('should verify a message correctly', async () => {
      const message = 'Hello, Arkade!';
      const signature = await account.sign(message);
      const isValid = await account.verify(message, signature);
      expect(isValid).toBe(true);
    });
  });

  describe('withdraw', () => {}); // TODO: implement tests for path
});
