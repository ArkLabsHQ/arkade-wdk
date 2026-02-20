export * from './dist/index.js' with { imports: 'bare-node-runtime/imports' }

// Keep a true default export in bare runtime so dynamic `import('@arkade-os/wdk')`
// can instantiate the manager class from `.default`.
export { default } from './dist/index.js' with { imports: 'bare-node-runtime/imports' }

export { default as WalletManagerArkade } from './dist/wallet-manager-arkade.js' with { imports: 'bare-node-runtime/imports' }
