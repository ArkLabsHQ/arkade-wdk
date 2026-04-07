export * from './src/index.js' with { imports: 'bare-node-runtime/imports' }

// Keep a true default export in bare runtime so dynamic `import('@arkade-os/wdk')`
// can instantiate the manager class from `.default`.
export { default } from './src/index.js' with { imports: 'bare-node-runtime/imports' }

export { default as WalletManagerArkade } from './src/wallet-manager-arkade.js' with { imports: 'bare-node-runtime/imports' }
