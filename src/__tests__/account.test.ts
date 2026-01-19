import { WalletAccountArkade, WalletAccountArkadeReadOnly } from '../bitcoin-arkade';
import { describe, expect, jest, test } from '@jest/globals';
import { SingleKey, TxType, Wallet as ArkadeWallet } from '@arkade-os/sdk';
import WalletManagerArkade from '../wallet-manager-arkade';
import { ArkadeWalletConfig } from '../types';
import WdkManager from '@tetherto/wdk';
import * as bip39 from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { hex } from '@scure/base';

const PATH = "m/86'/0/0'/0/0";
const DUMMY_TX_ID = '0864ea9d37cfd09ec57bd7c705f14e12daecc0f998d7e01ad87db680ad971044';
const DUMMY_TX_ID_2 = '14e12daecc0f998d7e01ad87db680ad9710440864ea9d37cfd09ec57bd7c705f';
const DUMMY_PREIMAGE = 'dummy-preimage';
const MNEMONIC = 'cook voyage document eight skate token alien guide drink uncle term abuse';
const DUMMY_LIGHTNING_INVOICE =
  'lnbc10u1p5k0r0wpp59085ah43zmwkdh2y0zt5hcpdaxgq6nzjfrvgy3wf782x50uv7f3qdquf35kw6r5de5kueeqf9h8vmmfvdjscqz3txqyyzzssp57vlg82yh946re04sn0zcpclg5247e2eykhmffzldqxn6h99dz9us9qxpqysgqgasm4ydw25k0hs3tlyc2umpnme82gclcuzl9359u3jkgq42k4w7p68602t88cpzq5mj77dnc7kq4n60hg2plvww94zgxq2fgmsvlp3qq6wmykh';
const DUMMY_VTXO = {
  virtualStatus: { state: 'settled' },
  createdAt: new Date(),
  txid: DUMMY_TX_ID,
  value: 1000,
  vout: 0,
};
const DUMMY_UTXO = {
  status: { confirmed: true },
  txid: DUMMY_TX_ID,
  value: 1000,
  vout: 0,
};

describe('WalletAccountArkade', () => {
  let account: WalletAccountArkade;
  let arkadeWallet: ArkadeWallet;
  let wdk: WdkManager;
  let seed: Uint8Array<ArrayBufferLike>;
  let hdKey: HDKey;

  beforeEach(async () => {
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
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(async () => {
    jest.clearAllMocks();
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

  describe('claimDeposit', () => {
    test('should return undefined with no coin found', async () => {
      const result = await account.claimDeposit('non-existent-tx-id');
      expect(result).toBeUndefined();
    });
    test('should return tx id', async () => {
      const address = await account.wallet.getBoardingAddress();
      account.wallet.settle = jest.fn().mockResolvedValue(DUMMY_TX_ID as never) as any;
      account.wallet.getBoardingUtxos = jest.fn().mockResolvedValue([DUMMY_UTXO] as never) as any;
      const result = await account.claimDeposit(DUMMY_TX_ID);
      expect(result).toBeDefined();
      expect(result?.length).toBe(1);
      expect(result?.[0].id).toBe(DUMMY_TX_ID);
      expect(result?.[0].address).toBe(address);
    });
  });

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

  describe('dispose', () => {
    test('should dispose without errors', async () => {
      expect(() => account.dispose()).not.toThrow();
    });

    test('should clean private key', async () => {
      const emptyPrivateKey = new Uint8Array(hdKey.privateKey!.length).fill(0);
      expect(account.keyPair.privateKey).not.toEqual(emptyPrivateKey);
      expect(() => account.dispose()).not.toThrow();
      expect(account.keyPair.privateKey).toEqual(emptyPrivateKey);
    });

    test('should nullify wallet', async () => {
      expect(account.wallet).not.toBeNull();
      expect(() => account.dispose()).not.toThrow();
      expect(account.wallet).toBeNull();
    });
  });

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
      expect(Number(accountBalance)).toBe(arkadeBalance.total);
    });
  });

  describe('getLatestDepositTxId', () => {
    test('should return null with no deposits', async () => {
      const address = await account.getSingleUseDepositAddress();
      const txId = await account.getLatestDepositTxId(address);
      expect(txId).toBeNull();
    });

    test('should return latest deposit tx id', async () => {
      account.wallet.getBoardingUtxos = jest.fn().mockResolvedValue([
        { ...DUMMY_UTXO, txid: 'txid-1' },
        { ...DUMMY_UTXO, txid: 'txid-2' },
      ] as never) as any;
      const address = await account.getSingleUseDepositAddress();
      const txId = await account.getLatestDepositTxId(address);
      expect(txId).toBe('txid-1');
    });
  });

  describe('getLightningReceiveRequest', () => {
    test('should throw if lightning support is not configured', async () => {
      const wdk = new WdkManager(MNEMONIC);
      const config: ArkadeWalletConfig = {
        arkServerUrl: 'https://arkade.computer',
      };
      wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
      const account = (await wdk.getAccount('bitcoin', 0)) as unknown as WalletAccountArkade;
      await expect(account.getLightningReceiveRequest('id')).rejects.toThrow(
        'Lightning support not configured. Provide swapProviderUrl in wallet config.'
      );
    });
  });

  describe('getLightningSendFeeEstimate', () => {
    test('should throw if lightning support is not configured', async () => {
      const wdk = new WdkManager(MNEMONIC);
      const config: ArkadeWalletConfig = {
        arkServerUrl: 'https://arkade.computer',
      };
      wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
      const account = (await wdk.getAccount('bitcoin', 0)) as unknown as WalletAccountArkade;
      await expect(account.getLightningSendFeeEstimate({ invoice: 'invoice' })).rejects.toThrow(
        'Lightning support not configured. Provide swapProviderUrl in wallet config.'
      );
    });
  });

  describe('getSingleUseDepositAddress', () => {
    test('should return a valid address', async () => {
      const address = await account.getSingleUseDepositAddress();
      expect(address).toMatch(/^bc1/);
    });
  });

  describe('getTokenBalance', () => {
    test('should throw', async () => {
      await expect(account.getTokenBalance('ARK')).rejects.toThrow(
        'getTokenBalance not applicable to Bitcoin wallets'
      );
    });
  });

  describe('getTransactionReceipt', () => {
    test('should return transaction receipt', async () => {
      account.wallet.getBoardingTxs = jest.fn().mockResolvedValue({
        boardingTxs: [
          {
            txid: DUMMY_TX_ID,
            status: { confirmed: true, block_time: 21 },
          },
        ],
      } as never) as any;
      const receipt = await account.getTransactionReceipt(DUMMY_TX_ID);
      expect(receipt).toBeDefined();
      expect(receipt?.hash).toBe(DUMMY_TX_ID);
      expect(receipt?.blockNumber).toBe(21);
      expect(receipt?.status).toBe('confirmed');
      expect(receipt?.gasUsed).toBe(0);
    });
  });

  describe('getTransfers', () => {
    beforeEach(() => {
      account.wallet.getTransactionHistory = jest.fn().mockResolvedValue([
        {
          key: {
            boardingTxid: DUMMY_TX_ID,
            commitmentTxid: '',
            arkTxid: '',
          },
          amount: 2100,
          createdAt: new Date('2026-01-01T00:00:00Z').getTime(),
          type: TxType.TxReceived,
        },
        {
          key: {
            boardingTxid: '',
            commitmentTxid: '',
            arkTxid: DUMMY_TX_ID_2,
          },
          amount: 1100,
          createdAt: new Date('2026-01-01T00:00:00Z').getTime(),
          type: TxType.TxSent,
        },
      ] as never) as any;
    });

    test('should return transfers', async () => {
      const transfers = await account.getTransfers();
      expect(Array.isArray(transfers)).toBe(true);
      expect(transfers.length).toEqual(2);
    });

    test('should filter incoming transfers', async () => {
      const transfers = await account.getTransfers({ direction: 'incoming' });
      expect(Array.isArray(transfers)).toBe(true);
      expect(transfers.length).toEqual(1);
      expect(transfers[0].direction).toBe('incoming');
    });

    test('should filter outgoing transfers', async () => {
      const transfers = await account.getTransfers({ direction: 'outgoing' });
      expect(Array.isArray(transfers)).toBe(true);
      expect(transfers.length).toEqual(1);
      expect(transfers[0].direction).toBe('outgoing');
    });

    test('should apply limit and skip', async () => {
      const transfers = await account.getTransfers({ limit: 1, skip: 1 });
      expect(Array.isArray(transfers)).toBe(true);
      expect(transfers.length).toEqual(1);
    });
  });

  describe('getUtxosForDepositAddress', () => {
    test('should return empty array for address with no UTXOs', async () => {
      const address = await account.getSingleUseDepositAddress();
      const utxos = await account.getUtxosForDepositAddress(address);
      expect(Array.isArray(utxos)).toBe(true);
      expect(utxos.length).toBe(0);
    });
  });

  describe('keyPair', () => {
    test('should have correct key pair', async () => {
      const derivedPrivateKey = hex.encode(hdKey.privateKey!);
      const accountPrivateKey = hex.encode(account.keyPair.privateKey!);
      expect(accountPrivateKey).toBe(derivedPrivateKey);
    });
  });

  describe('path', () => {
    test('should have correct derivation path', async () => {
      expect(account.path).toBe(PATH);
    });
  });

  describe('payLightningInvoice', () => {
    test('should throw if lightning support is not configured', async () => {
      const wdk = new WdkManager(MNEMONIC);
      const config: ArkadeWalletConfig = {
        arkServerUrl: 'https://arkade.computer',
      };
      wdk.registerWallet('bitcoin', WalletManagerArkade as any, config as any);
      const account = (await wdk.getAccount('bitcoin', 0)) as unknown as WalletAccountArkade;
      await expect(account.payLightningInvoice('invoice')).rejects.toThrow(
        'Lightning support not configured. Provide swapProviderUrl in wallet config.'
      );
    });
  }); // TODO: implement tests for path

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
      account.wallet.settle = jest.fn().mockResolvedValue(DUMMY_TX_ID as never) as any;
      account.wallet.getVtxos = jest.fn().mockResolvedValue([DUMMY_VTXO] as never) as any;
      const tx = { to: await arkadeWallet.getBoardingAddress(), value: BigInt(DUMMY_VTXO.value) };
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

  describe('withdraw', () => {
    test('should withdraw onchain successfully', async () => {
      account.wallet.settle = jest.fn().mockResolvedValue(DUMMY_TX_ID as never) as any;
      account.wallet.getVtxos = jest.fn().mockResolvedValue([DUMMY_VTXO] as never) as any;
      const tx = { to: await arkadeWallet.getBoardingAddress(), value: DUMMY_VTXO.value };
      const result = await account.withdraw(tx);
      expect(result).toBeDefined();
      expect(result?.id).toBe(DUMMY_TX_ID);
      expect(result?.fee).toBe(0);
    });
  });
});
