# @alexmchan/memocache

## 1.0.0

### Major Changes

- bc88cbf: ## Bug Fixes
  - **`DefaultStatefulContext.waitUntil`**: Now accumulates all promises in an array; `flush()` uses `Promise.allSettled` so no promise is silently dropped
  - **`cacheQuery` context on cache miss**: Store writes now correctly use `_context` (the resolved fallback) instead of the raw `context` parameter which could be `undefined`
  - **`revalidateInBackground` waitUntil ordering**: `waitUntil` is now called before `await` so edge runtimes track the promise while it is still in-flight
  - **`setCacheData` value envelope**: Values are now wrapped in `{ value, age }` so data set manually is readable via `cacheQuery`. The function also accepts an optional `ttl` parameter
  - **`getStores()` race condition**: Concurrent callers now share a single initialization promise (`??=`) instead of potentially pushing stores twice
  - **Redis `dispose`**: Removed erroneous `disconnect()` before `quit()` to prevent erroring on an already-closed socket
  - **Redis `[Symbol.asyncDispose]`**: Now properly `await`s disposal
  - **`localOptions` spread order**: Defaults no longer get overwritten by `undefined` values passed by the caller
  - **SQLite `tableName` SQL injection**: Table name is now validated against `/^[a-zA-Z_][a-zA-Z0-9_]*$/`

  ## Breaking Changes
  - **`setCacheData`** previously stored values raw; it now wraps them in `{ value, age }`. Any code that called `setCacheData` and then read directly from the store (bypassing `cacheQuery`) will need to unwrap `result.value`
  - **`cacheQuery`** return type is now `Promise<T | undefined>` (was `Promise<T>`)
  - Package dependencies bumped to latest major versions (vitest v4, tsup v8, typescript v5.9)

  ## DX Improvements
  - `createCache()` can now be called with no arguments — all options have defaults
  - `createCachedFunction` now exposes `getCacheKey(...args)` for debugging the full resolved cache key
  - `CacheStore` type is now re-exported from `@alexmchan/memocache` (no need to import from `@alexmchan/memocache-common`)
  - Migrated to Biome for formatting and linting

## 0.7.0

### Minor Changes

- f14d8c7: split packages

## 0.6.0

### Minor Changes

- 2ff3f6e: add cjs to builds because jest is broken

## 0.5.10

## 0.5.9

## 0.5.8

## 0.5.7

## 0.5.6

## 0.5.5

### Patch Changes

- 5b09e1b: fix types

## 0.5.4

### Patch Changes

- cc638c3: try alternative export

## 0.5.3

### Patch Changes

- cce4dee: internal common package refactor

## 0.5.2

## 0.5.1

### Patch Changes

- 174b972: update naming

## 0.5.0

### Minor Changes

- be24ec8: extract redis store and common

## 0.4.11

### Patch Changes

- 9971691: testing require codeowners

## 0.4.10

### Patch Changes

- ba91c5c: clean up publish

## 0.4.9

### Patch Changes

- 1ba6f01: test with more branch restrictions

## 0.4.8

### Patch Changes

- 8676b88: test release

## 0.4.7

### Patch Changes

- d6dac31: test new publish
- 6f7cd44: test release

## 0.4.6

### Patch Changes

- 26d8c7b: publish
- f51ba95: deploy

## 0.4.5

### Patch Changes

- 38738d5: release

## 0.4.0

### Minor Changes

- fc76fab: initial release

### Patch Changes

- c6464fd: minor
