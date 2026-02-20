# AGENTS.md

Guidance for coding agents working in this repository.

## 1) Purpose and Current Scope

- This repo's primary package is `@arkade-os/wdk`, a WDK-compatible Bitcoin wallet adapter on top of `@arkade-os/sdk`.
- It supports Ark + optional Lightning (`@arkade-os/boltz-swap`) and exports utility helpers (`src/lib/*`).
- Submodules under `packages/` and `examples/` are local development surfaces for RN integration and validation.
- Current state: the RN example is the integration playground, but it does not yet route Bitcoin through `@arkade-os/wdk` by default.

## 2) Repository Map

- Root adapter:
  - `src/wallet-manager-arkade.ts`
  - `src/wallet-account-arkade.ts`
  - `src/lib/*`
  - `src/index.ts`
- Build output:
  - `dist/` (generated, ignored by git)
- Dev tooling:
  - `scripts/setup-dev.js`
- Submodules:
  - `packages/pear-wrk-wdk`
  - `packages/wdk-react-native-provider`
  - `examples/wdk-starter-react-native`

## 3) Runtime Dependency Flow (Important)

Current RN path:

1. `examples/wdk-starter-react-native` uses `@tetherto/wdk-react-native-provider`.
2. `@tetherto/wdk-react-native-provider` uses `@tetherto/pear-wrk-wdk`.
3. `@tetherto/pear-wrk-wdk` resolves Bitcoin via `@wdk/wallet-btc`.

Implication:

- Editing `@arkade-os/wdk` alone does not automatically affect the RN example behavior yet.
- If you are asked to validate `@arkade-os/wdk` behavior in-app, plan an explicit integration step in the submodules.

## 4) Setup and Daily Commands

Root package:

- Install: `npm install`
- Build: `npm run build`
- Watch: `npm run dev`
- Lint: `npm run lint`
- Format: `npm run format`
- Test: `npm test`

Full local workspace (root + submodules + links):

- `npm run setup:dev`

Note:

- `scripts/setup-dev.js` still references `@wdk/bare` naming in link commands/messages while the submodule package is `@tetherto/pear-wrk-wdk`. Treat setup results as "best effort" and verify links explicitly when needed.

## 5) Known Issues / Footguns

- Jest config references `src/__tests__/setup.ts`, but that file is currently missing; `npm test` fails on config validation until fixed.
- `getFeeRates()` in `WalletManagerArkade` returns placeholder values (`0n`/`0n`).
- `WalletAccountArkade.initialize()` is currently a no-op.
- Several convenience methods historically documented are not implemented on `WalletAccountArkade` yet (see `README.md` TODO section).
- Running install/setup inside submodules may update lockfiles and leave submodules dirty; this is expected during local development.

## 6) Submodule Workflow Expectations

- Submodules are independent git repositories.
- Treat changes in each submodule as separate deliverables:
  - `packages/pear-wrk-wdk` PR
  - `packages/wdk-react-native-provider` PR
  - `examples/wdk-starter-react-native` PR (if required)
- Do not assume root commits can include upstream submodule code changes.
- Before editing, check:
  - `git status --short` at root
  - `git -C <submodule> status --short` in each submodule you touch

## 7) Coding Standards

- Language/runtime:
  - TypeScript, Node ESM (`"type": "module"`)
  - Target ES2022
- Formatting:
  - 2 spaces
  - single quotes
  - semicolons enabled
  - print width 100
- Linting:
  - `@typescript-eslint` rules are enabled
  - no unused vars (except args prefixed with `_`)
- Keep imports/exports ESM-compatible and preserve `.js` extension style in source imports where already used.

## 8) Recommended Verification Matrix

For root-only adapter changes:

1. `npm run build`
2. `npm run lint`
3. Optional targeted runtime check via a small local script or consumer test harness

For RN integration changes (submodules):

1. Build relevant package(s) in `packages/*`
2. Re-link dependencies if needed
3. Run example app checks in `examples/wdk-starter-react-native`:
   - `npm run typecheck` (if available in that submodule)
   - `npm run android` or `npm run ios` for manual validation

## 9) Change Strategy Guidance

- Prefer minimal, reversible changes.
- Keep README/API docs synchronized with real implementation state (no aspirational APIs without explicit TODO labels).
- If behavior is intentionally not implemented yet, mark it clearly in docs and/or code comments with concrete TODO scope.
- If a task touches root adapter + submodule runtime wiring, separate commits by repository boundary.

## 10) Quick Checklist Before Hand-off

- Root build passes (`npm run build`).
- Any known expected failures (like current Jest config issue) are called out explicitly.
- Docs updated for any API/behavior changes.
- `git status --short` is reviewed at root and in touched submodules.
- No accidental lockfile churn committed unless intentionally part of the change.
