import 'bare-node-runtime/global'

export * from './dist/index.js' with { imports: 'bare-node-runtime/imports' }

export { default as WalletManagerArkade } from './dist/wallet-manager-arkade.js' with { imports: 'bare-node-runtime/imports' }
