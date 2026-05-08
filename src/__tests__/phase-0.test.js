/**
 * Phase 0 — library hardening tests
 *
 * Covers the changes that close the README "missing methods" gap:
 *   0.1 / 0.2  Lightning lifecycle delegations + waitForLightningPayment
 *   0.3        Real getFeeRates from arkInfo
 *   0.4        BIP21 propagation in send/quoteSend
 *   0.5        LNURL / Lightning-address routing
 *   0.6        ArkadeSwaps optional creation
 *   0.7        Lib helpers re-exported from src/index.js
 */
import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bech32, utf8 } from '@scure/base';

import * as wdkExports from '../index.js';
import { isArkAddress } from '../lib/address.js';
import { WalletAccountArkade } from '../wallet-account-arkade.js';
import WalletManagerArkade from '../wallet-manager-arkade.js';
import { send, quoteSend, resolveDestination, detectTransactionType, TransactionType } from '../lib/send.js';
import { ArkadeSwaps, BoltzSwapProvider } from '@arkade-os/boltz-swap';
import { ArkAddress, Wallet } from '@arkade-os/sdk';

const validSeedPhrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const stubArkProvider = {
  getInfo: () =>
    Promise.resolve({ network: 'regtest', fees: { txFeeRate: '3' } }),
};

// Generate a valid Ark address from raw key bytes — `ArkAddress.encode()` is
// strict about lengths, so this gives us something `isArkAddress` accepts
// without depending on a hand-pasted bech32m fixture that might rot.
const ARK_ADDR = new ArkAddress(
  new Uint8Array(32).fill(1),
  new Uint8Array(32).fill(2),
  'testnet'
).encode();
const BTC_ADDR = 'bc1qh96eg54ddu4q2cmn0n6g8uymuqlw402jndphu9';
// Sanity-check the fixture before any tests run. If this throws, the SDK
// changed its address format and the rest of this file would be misleading.
if (!isArkAddress(ARK_ADDR)) {
  throw new Error(`Test bootstrap: ARK_ADDR fixture is not a valid Ark address: ${ARK_ADDR}`);
}
// A reasonable BOLT11 invoice for tests. We don't need it to be currently
// valid; the parser only fails on structural errors.
const BOLT11 =
  'lnbc15u1p3xnhl2pp5jptserfk3zk4qy42tlucycrfwxhydvlemu9pqr93tuzlv9cc7g3sdqsvfhkcap3xyhx7un8cqzpgxqzjcsp5f8c52y2stc300gl6s4xswtjpc37hrnnr3c9wvtgjfuvqmpm35evq9qyyssqy4lgd8tj637qcjp05rdpxxykjenthxftej7a2zzmwrmrl70fyj9hvj0rewhzj7jfyuwkwcg9g2jpwtk3wkjtwnkdks84hsnu8xps5vsq4gj5hs';
const LNURL = bech32.encodeFromBytes(
  'lnurl',
  utf8.decode('https://domain.com/.well-known/lnurlp/user')
);

afterEach(() => {
  mock.restoreAll();
});

// ----------------------------------------------------------------------------
// 0.7 — root index re-exports
// ----------------------------------------------------------------------------

describe('0.7 — root index re-exports', () => {
  it('re-exports the three account/manager classes', () => {
    assert.equal(typeof wdkExports.default, 'function');
    assert.equal(typeof wdkExports.WalletAccountArkade, 'function');
    assert.equal(typeof wdkExports.WalletAccountReadOnlyArkade, 'function');
  });
});

// ----------------------------------------------------------------------------
// 0.1 + 0.2 — Lightning lifecycle delegations
// ----------------------------------------------------------------------------

describe('0.1 — Lightning lifecycle delegations', () => {
  /** Build a fake ArkadeSwaps that records each method call. */
  function makeMockSwaps(overrides = {}) {
    return {
      getPendingReverseSwaps: mock.fn(() => Promise.resolve([])),
      getPendingSubmarineSwaps: mock.fn(() => Promise.resolve([])),
      getSwapHistory: mock.fn(() => Promise.resolve([])),
      getLimits: mock.fn(() => Promise.resolve({ minimal: 1000, maximal: 1_000_000 })),
      getFees: mock.fn(() => Promise.resolve({ submarine: { percentage: 0.5, minerFees: 200 } })),
      createLightningInvoice: mock.fn(() =>
        Promise.resolve({ invoice: 'lnbc1...', paymentHash: 'deadbeef' })
      ),
      waitAndClaim: mock.fn(() => Promise.resolve({ txid: 'claim-tx' })),
      ...overrides,
    };
  }

  function makeAccount(swaps) {
    return new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      {},
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      swaps
    );
  }

  it('getPendingLightningReceives delegates to ArkadeSwaps.getPendingReverseSwaps', async () => {
    const swaps = makeMockSwaps();
    swaps.getPendingReverseSwaps.mock.mockImplementationOnce(() => Promise.resolve(['rev1']));
    const account = makeAccount(swaps);

    const result = await account.getPendingLightningReceives();

    assert.deepEqual(result, ['rev1']);
    assert.equal(swaps.getPendingReverseSwaps.mock.callCount(), 1);
  });

  it('getPendingLightningSends delegates to ArkadeSwaps.getPendingSubmarineSwaps', async () => {
    const swaps = makeMockSwaps();
    swaps.getPendingSubmarineSwaps.mock.mockImplementationOnce(() => Promise.resolve(['sub1']));
    const account = makeAccount(swaps);

    const result = await account.getPendingLightningSends();

    assert.deepEqual(result, ['sub1']);
    assert.equal(swaps.getPendingSubmarineSwaps.mock.callCount(), 1);
  });

  it('getSwapHistory delegates', async () => {
    const swaps = makeMockSwaps();
    swaps.getSwapHistory.mock.mockImplementationOnce(() => Promise.resolve(['s1', 's2']));
    const account = makeAccount(swaps);

    const result = await account.getSwapHistory();

    assert.deepEqual(result, ['s1', 's2']);
    assert.equal(swaps.getSwapHistory.mock.callCount(), 1);
  });

  it('getLightningLimits delegates to ArkadeSwaps.getLimits', async () => {
    const swaps = makeMockSwaps();
    const account = makeAccount(swaps);

    const result = await account.getLightningLimits();

    assert.deepEqual(result, { minimal: 1000, maximal: 1_000_000 });
    assert.equal(swaps.getLimits.mock.callCount(), 1);
  });

  it('getLightningFees delegates to ArkadeSwaps.getFees', async () => {
    const swaps = makeMockSwaps();
    const account = makeAccount(swaps);

    const result = await account.getLightningFees();

    assert.deepEqual(result, { submarine: { percentage: 0.5, minerFees: 200 } });
    assert.equal(swaps.getFees.mock.callCount(), 1);
  });

  it('throws when arkadeSwaps is null', async () => {
    const account = makeAccount(null);
    await assert.rejects(
      account.getPendingLightningReceives(),
      /Lightning support not configured/
    );
    await assert.rejects(account.getPendingLightningSends(), /Lightning support not configured/);
    await assert.rejects(account.getSwapHistory(), /Lightning support not configured/);
    await assert.rejects(account.getLightningLimits(), /Lightning support not configured/);
    await assert.rejects(account.getLightningFees(), /Lightning support not configured/);
  });
});

describe('0.2 — waitForLightningPayment', () => {
  function makeAccount(swaps) {
    return new WalletAccountArkade(
      'ark1addr',
      "m/86'/0'/0'/0/0",
      {},
      { publicKey: new Uint8Array(33), privateKey: new Uint8Array(32) },
      {},
      Promise.resolve({}),
      swaps
    );
  }

  it('finds the matching pending reverse swap and calls waitAndClaim', async () => {
    // PendingReverseSwap stores the BOLT11 at `response.invoice`, not top-level.
    const swap = { id: 'r1', response: { invoice: 'lnbc1pXXXX' } };
    const swaps = {
      getPendingReverseSwaps: mock.fn(() => Promise.resolve([swap])),
      waitAndClaim: mock.fn(() => Promise.resolve({ txid: 'claim-tx' })),
    };
    const account = makeAccount(swaps);

    const result = await account.waitForLightningPayment('lnbc1pXXXX');

    assert.deepEqual(result, { txid: 'claim-tx' });
    assert.equal(swaps.waitAndClaim.mock.callCount(), 1);
    assert.equal(swaps.waitAndClaim.mock.calls[0].arguments[0], swap);
  });

  it('throws when no pending swap matches the invoice', async () => {
    const swaps = {
      getPendingReverseSwaps: mock.fn(() =>
        Promise.resolve([{ id: 'r2', response: { invoice: 'lnbc-other' } }])
      ),
      waitAndClaim: mock.fn(),
    };
    const account = makeAccount(swaps);

    await assert.rejects(
      account.waitForLightningPayment('lnbc-missing'),
      /No pending reverse swap found for invoice/
    );
    assert.equal(swaps.waitAndClaim.mock.callCount(), 0);
  });

  it('throws when Lightning is not configured', async () => {
    const account = makeAccount(null);
    await assert.rejects(
      account.waitForLightningPayment('lnbc1xxx'),
      /Lightning support not configured/
    );
  });
});

// ----------------------------------------------------------------------------
// 0.3 — getFeeRates from arkInfo
// ----------------------------------------------------------------------------

describe('0.3 — getFeeRates from arkInfo', () => {
  it('returns the txFeeRate as a bigint, with normal === fast (no Ark tiers)', async () => {
    const provider = {
      getInfo: () => Promise.resolve({ network: 'regtest', fees: { txFeeRate: '7' } }),
    };
    const manager = new WalletManagerArkade(validSeedPhrase, { arkProvider: provider });

    const rates = await manager.getFeeRates();

    assert.equal(rates.normal, 7n);
    assert.equal(rates.fast, 7n);
  });

  it('rounds fractional fee rates upward', async () => {
    const provider = {
      getInfo: () => Promise.resolve({ network: 'regtest', fees: { txFeeRate: '2.3' } }),
    };
    const manager = new WalletManagerArkade(validSeedPhrase, { arkProvider: provider });

    const rates = await manager.getFeeRates();

    assert.equal(rates.normal, 3n);
    assert.equal(rates.fast, 3n);
  });

  it('throws after dispose', async () => {
    const manager = new WalletManagerArkade(validSeedPhrase, { arkProvider: stubArkProvider });
    await manager.dispose();
    await assert.rejects(manager.getFeeRates(), /disposed/);
  });
});

// ----------------------------------------------------------------------------
// 0.4 — BIP21 propagation
// ----------------------------------------------------------------------------

describe('0.4 — BIP21 propagation in send / quoteSend', () => {
  const arkInfo = Promise.resolve({ fees: { txFeeRate: '2' } });

  function makeWallet() {
    return {
      sendBitcoin: mock.fn(() => Promise.resolve('txid-abc')),
    };
  }

  it('detectTransactionType resolves BIP21 wrapping a BTC address', () => {
    const uri = `bitcoin:${BTC_ADDR}?amount=0.001`;
    assert.equal(detectTransactionType(uri), TransactionType.BITCOIN_ONCHAIN);
  });

  it('detectTransactionType resolves BIP21 wrapping an Ark address (?ark=)', () => {
    const uri = `bitcoin:${BTC_ADDR}?ark=${ARK_ADDR}`;
    assert.equal(detectTransactionType(uri), TransactionType.ARK_OFFCHAIN);
  });

  it('BIP21 ?ark= takes priority over ?lightning=LNURL', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('LNURL endpoint must not be queried when ?ark= is present');
    });
    const wallet = makeWallet();
    const lightning = {
      sendLightningPayment: mock.fn(),
      getFees: mock.fn(),
    };
    const uri = `bitcoin:${BTC_ADDR}?ark=${ARK_ADDR}&lightning=${LNURL}`;

    assert.equal(resolveDestination(uri).resolved, ARK_ADDR);
    assert.equal(detectTransactionType(uri), TransactionType.ARK_OFFCHAIN);

    const result = await send({
      to: uri,
      amount: 1234n,
      wallet,
      arkInfo,
      lightning,
    });

    assert.equal(wallet.sendBitcoin.mock.callCount(), 1);
    assert.deepEqual(wallet.sendBitcoin.mock.calls[0].arguments[0], {
      address: ARK_ADDR,
      amount: 1234,
    });
    assert.equal(lightning.sendLightningPayment.mock.callCount(), 0);
    assert.equal(result.type, TransactionType.ARK_OFFCHAIN);
  });

  it('detectTransactionType resolves BIP21 wrapping a BOLT11 invoice (?lightning=)', () => {
    const uri = `bitcoin:${BTC_ADDR}?lightning=${BOLT11}`;
    assert.equal(detectTransactionType(uri), TransactionType.LIGHTNING);
  });

  it('resolveDestination strips the BIP21 wrapper to the inner address', () => {
    const uri = `bitcoin:${BTC_ADDR}?amount=0.001`;
    const { resolved, bip21Sats } = resolveDestination(uri);
    assert.equal(resolved, BTC_ADDR);
    assert.equal(bip21Sats, 100_000); // 0.001 BTC = 100k sats
  });

  it('resolveDestination passes plain destinations through unchanged', () => {
    const { resolved, bip21Sats } = resolveDestination(BTC_ADDR);
    assert.equal(resolved, BTC_ADDR);
    assert.equal(bip21Sats, undefined);
  });

  it('send (BTC) calls wallet.sendBitcoin with the inner address from a BIP21 URI', async () => {
    const wallet = makeWallet();
    const uri = `bitcoin:${BTC_ADDR}?amount=0.0005`;

    const result = await send({
      to: uri,
      amount: 0n, // unset → take from URI
      wallet,
      arkInfo,
      lightning: null,
    });

    assert.equal(wallet.sendBitcoin.mock.callCount(), 1);
    const callArg = wallet.sendBitcoin.mock.calls[0].arguments[0];
    assert.equal(callArg.address, BTC_ADDR, 'must NOT pass through the bip21 URI');
    assert.equal(callArg.amount, 50_000); // 0.0005 BTC
    assert.equal(result.type, TransactionType.BITCOIN_ONCHAIN);
  });

  it('send (Ark) routes BIP21 ?ark= to the inner ark address', async () => {
    const wallet = makeWallet();
    const uri = `bitcoin:${BTC_ADDR}?ark=${ARK_ADDR}`;

    const result = await send({
      to: uri,
      amount: 1234n,
      wallet,
      arkInfo,
      lightning: null,
    });

    const callArg = wallet.sendBitcoin.mock.calls[0].arguments[0];
    assert.equal(callArg.address, ARK_ADDR);
    assert.equal(callArg.amount, 1234);
    assert.equal(result.type, TransactionType.ARK_OFFCHAIN);
  });

  it('send reconciles options.amount with BIP21 ?amount= and throws on mismatch', async () => {
    const wallet = makeWallet();
    const uri = `bitcoin:${BTC_ADDR}?amount=0.001`; // 100_000 sats

    await assert.rejects(
      send({ to: uri, amount: 50_000n, wallet, arkInfo, lightning: null }),
      /Amount mismatch/
    );
    assert.equal(wallet.sendBitcoin.mock.callCount(), 0, 'must short-circuit before sending');
  });

  it('quoteSend on a BIP21 BTC URI returns the on-chain fee', async () => {
    const result = await quoteSend({
      to: `bitcoin:${BTC_ADDR}?amount=0.001`,
      amount: 0n,
      wallet: makeWallet(),
      arkInfo,
      lightning: null,
    });
    // calculateOnchainFee uses 165 vB * 2 sat/vB = 330 sats
    assert.equal(result.fee, 330n);
  });

  it('quoteSend on a BIP21 Ark URI returns the off-chain fee', async () => {
    const result = await quoteSend({
      to: `bitcoin:${BTC_ADDR}?ark=${ARK_ADDR}`,
      amount: 0n,
      wallet: makeWallet(),
      arkInfo,
      lightning: null,
    });
    // calculateOffchainFee uses 150 vB * 2 sat/vB = 300 sats
    assert.equal(result.fee, 300n);
  });
});

// ----------------------------------------------------------------------------
// 0.5 — LNURL routing
// ----------------------------------------------------------------------------

describe('0.5 — LNURL routing', () => {
  const arkInfo = Promise.resolve({ fees: { txFeeRate: '2' } });

  function makeWallet() {
    return {
      sendBitcoin: mock.fn(() => Promise.resolve('txid-lnurl')),
    };
  }

  function makeLightning() {
    return {
      sendLightningPayment: mock.fn(() => Promise.resolve({ preimage: 'preimage-lnurl' })),
      getFees: mock.fn(() =>
        Promise.resolve({ submarine: { percentage: 0.5, minerFees: 200 } })
      ),
    };
  }

  function jsonResponse(data, ok = true, status = 200) {
    return {
      ok,
      status,
      json: () => Promise.resolve(data),
    };
  }

  it('detectTransactionType classifies Lightning addresses and LNURL as EMAIL', () => {
    assert.equal(detectTransactionType('user@domain.com'), TransactionType.EMAIL);
    assert.equal(detectTransactionType(LNURL), TransactionType.EMAIL);
  });

  it('detectTransactionType resolves BIP21 ?lightning=LNURL as EMAIL', () => {
    const uri = `bitcoin:${BTC_ADDR}?lightning=${LNURL}`;
    assert.equal(detectTransactionType(uri), TransactionType.EMAIL);
  });

  it('send and quoteSend require Lightning support for Lightning addresses', async () => {
    await assert.rejects(
      send({
        to: 'user@domain.com',
        amount: 1000n,
        wallet: makeWallet(),
        arkInfo,
        lightning: null,
      }),
      /Lightning support not configured/
    );

    await assert.rejects(
      quoteSend({
        to: 'user@domain.com',
        amount: 1000n,
        wallet: makeWallet(),
        arkInfo,
        lightning: null,
      }),
      /Lightning support not configured/
    );
  });

  it('send routes to Ark when the LNURL endpoint advertises an Ark address', async () => {
    mock.method(globalThis, 'fetch', async () =>
      jsonResponse({ address: ARK_ADDR, expiryDate: '', hint: '' })
    );
    const wallet = makeWallet();
    const lightning = makeLightning();

    const result = await send({
      to: 'user@domain.com',
      amount: 1234n,
      wallet,
      arkInfo,
      lightning,
    });

    assert.equal(wallet.sendBitcoin.mock.callCount(), 1);
    assert.deepEqual(wallet.sendBitcoin.mock.calls[0].arguments[0], {
      address: ARK_ADDR,
      amount: 1234,
    });
    assert.equal(lightning.sendLightningPayment.mock.callCount(), 0);
    assert.equal(result.type, TransactionType.ARK_OFFCHAIN);
    assert.equal(result.fee, 300n);
  });

  it('quoteSend returns the Ark fee when the LNURL endpoint advertises an Ark address', async () => {
    mock.method(globalThis, 'fetch', async () =>
      jsonResponse({ address: ARK_ADDR, expiryDate: '', hint: '' })
    );

    const result = await quoteSend({
      to: 'user@domain.com',
      amount: 1234n,
      wallet: makeWallet(),
      arkInfo,
      lightning: makeLightning(),
    });

    assert.equal(result.fee, 300n);
  });

  it('send falls back to a fetched BOLT11 invoice when Ark lookup fails', async () => {
    mock.method(globalThis, 'fetch', async (url) => {
      const href = String(url);
      if (href.endsWith('?method=ark')) return jsonResponse({}, false, 404);
      if (href.endsWith('/.well-known/lnurlp/user')) {
        return jsonResponse({
          minSendable: 1000,
          maxSendable: 2_000_000,
          callback: 'https://domain.com/lnurl-callback',
          metadata: '[]',
        });
      }
      if (href === 'https://domain.com/lnurl-callback?amount=1500000') {
        return jsonResponse({ pr: BOLT11 });
      }
      throw new Error(`Unexpected fetch URL: ${href}`);
    });
    const wallet = makeWallet();
    const lightning = makeLightning();

    const result = await send({
      to: 'user@domain.com',
      amount: 1500n,
      wallet,
      arkInfo,
      lightning,
    });

    assert.equal(wallet.sendBitcoin.mock.callCount(), 0);
    assert.equal(lightning.sendLightningPayment.mock.callCount(), 1);
    assert.deepEqual(lightning.sendLightningPayment.mock.calls[0].arguments[0], {
      invoice: BOLT11,
    });
    assert.equal(result.type, TransactionType.LIGHTNING);
    assert.equal(result.txid, 'preimage-lnurl');
    assert.equal(result.fee, 207n);
  });

  it('quoteSend falls back to Lightning fees when Ark lookup fails', async () => {
    mock.method(globalThis, 'fetch', async () => jsonResponse({}, false, 404));

    const result = await quoteSend({
      to: 'user@domain.com',
      amount: 1500n,
      wallet: makeWallet(),
      arkInfo,
      lightning: makeLightning(),
    });

    assert.equal(result.fee, 207n);
  });
});

// ----------------------------------------------------------------------------
// 0.6 — ArkadeSwaps optional creation
// ----------------------------------------------------------------------------

describe('0.6 — ArkadeSwaps optional creation', () => {
  /** Mock @arkade-os/sdk Wallet.create so we don't try to talk to a real Ark server. */
  function mockWalletCreate() {
    return mock.method(Wallet, 'create', async (config) => {
      const pubkey = await config.identity.xOnlyPublicKey();
      return {
        getAddress: () => Promise.resolve(`ark1mock_${Buffer.from(pubkey).toString('hex').slice(0, 8)}`),
        indexerProvider: {},
        dispose: mock.fn(),
        identity: config.identity,
      };
    });
  }

  it('does not create ArkadeSwaps when swapProviderUrl is omitted', async () => {
    mockWalletCreate();
    const swapsCreate = mock.method(ArkadeSwaps, 'create', async () => ({ dispose: mock.fn() }));

    const manager = new WalletManagerArkade(validSeedPhrase, {
      arkProvider: stubArkProvider,
    });

    const account = await manager.getAccount(0);

    assert.equal(swapsCreate.mock.callCount(), 0);
    assert.equal(account.arkadeSwaps, null);
  });

  it('passes through swapProviderUrl when Lightning is configured', async () => {
    mockWalletCreate();
    const mockSwaps = { dispose: mock.fn() };
    const swapsCreate = mock.method(ArkadeSwaps, 'create', async () => mockSwaps);
    const swapProviderUrl = 'https://example.invalid/boltz';

    const manager = new WalletManagerArkade(validSeedPhrase, {
      arkProvider: stubArkProvider,
      swapProviderUrl,
    });

    const account = await manager.getAccount(0);

    assert.equal(swapsCreate.mock.callCount(), 1);
    const createConfig = swapsCreate.mock.calls[0].arguments[0];
    assert.ok(createConfig.swapProvider, 'must pass an explicit swapProvider (carries referralId)');
    assert.equal(
      createConfig.swapProvider.getApiUrl(),
      new BoltzSwapProvider({ apiUrl: swapProviderUrl, network: 'regtest' }).getApiUrl()
    );
    assert.equal(account.arkadeSwaps, mockSwaps);
  });
});
