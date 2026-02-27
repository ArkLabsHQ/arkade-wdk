import { jest } from '@jest/globals';

// Mock @arkade-os/boltz-swap to avoid runtime import failures
// (boltz-swap's bundle imports removed SDK exports like closeDatabase)
jest.unstable_mockModule('@arkade-os/boltz-swap', () => ({
  ArkadeSwaps: jest.fn().mockImplementation(() => ({
    createLightningInvoice: jest.fn(),
    sendLightningPayment: jest.fn(),
    getFees: jest.fn<() => Promise<unknown>>().mockResolvedValue({
      submarine: { percentage: 0.1, minerFees: 100 },
      reverse: { percentage: 0.1, minerFees: 100 },
    }),
    dispose: jest.fn(),
  })),
  BoltzSwapProvider: jest.fn(),
}));
