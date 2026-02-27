declare module '@arkade-os/boltz-swap' {
  import type { IWallet, ArkProvider, IndexerProvider, NetworkName } from '@arkade-os/sdk';

  export interface ArkadeSwapsConfig {
    wallet: IWallet;
    arkProvider?: ArkProvider;
    swapProvider: BoltzSwapProvider;
    indexerProvider?: IndexerProvider;
    swapManager?: boolean | (SwapManagerConfig & { autoStart?: boolean });
    swapRepository?: SwapRepository;
  }

  export interface SwapManagerConfig {
    pollInterval?: number;
  }

  export class SwapRepository {}

  export class ArkadeSwaps {
    constructor(config: ArkadeSwapsConfig);
    createLightningInvoice(params: CreateLightningInvoiceRequest): Promise<CreateLightningInvoiceResponse>;
    sendLightningPayment(params: SendLightningPaymentRequest): Promise<SendLightningPaymentResponse>;
    getFees(): Promise<FeesResponse>;
    dispose(): Promise<void>;
  }

  export class BoltzSwapProvider {
    constructor(config: { apiUrl: string; network: NetworkName });
    getFees(): Promise<FeesResponse>;
  }

  export interface CreateLightningInvoiceRequest {
    amount: number;
    description?: string;
  }

  export interface CreateLightningInvoiceResponse {
    invoice: string;
    paymentHash: string;
    preimage: string;
    pendingSwap: PendingReverseSwap;
  }

  export interface SendLightningPaymentRequest {
    invoice: string;
  }

  export interface SendLightningPaymentResponse {
    preimage: string;
  }

  export interface FeesResponse {
    submarine: { percentage: number; minerFees: number };
    reverse: { percentage: number; minerFees: number };
  }

  export interface PendingReverseSwap {
    id: string;
    invoice: string;
    preimage: string;
    claimPublicKey: string;
    lockupAddress: string;
  }
}
