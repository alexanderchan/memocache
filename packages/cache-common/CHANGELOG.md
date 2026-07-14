# @alexmchan/memocache

## 2.0.0

### Major Changes

- 5a18615: Remove libsql in favor of node:sql

### Patch Changes

- 1e3a54a: Lifecycle, API, and packaging fixes:
  - `cacheQuery` / `createCachedFunction` return types narrowed to `Promise<T>` / `Promise<Awaited<ReturnType<T>>>` — no more needless null-guards on consumers
  - Removed dead `Result`/`Ok`/`Err`/`wrap` exports; the error module now re-exports `CacheError`/`BaseError` from the package root
  - TTL store's dev-only `entries()` guard no longer throws `ReferenceError` in runtimes without `process` (edge/browser)
  - Metrics middleware now delegates the wrapped store's optional `clear()` and `entries()`
  - ioredis store: initialization errors on an injected client promise are caught and logged; `dispose()` only quits clients the store created itself (injected clients stay connected)
  - libsql/sqlite store: cleanup interval is `unref()`'d so scripts exit promptly; `dispose()` closes self-created clients; expired-entry deletes log failures instead of crashing
  - Upstash store: connection ping on construction is now opt-in via `verifyConnection` (default off — no paid REST call per cold start)
  - Exports maps use the attw-recommended nested `types` conditions on all packages (attw clean on node10/node16-cjs/node16-esm/bundler); `@alexmchan/msw-testing` now ships real ESM alongside CJS

- e7dc3cb: SWR correctness and packaging fixes:
  - `cacheQuery` no longer loses a stale hit from a higher-priority store when a lower-priority store misses — the stale value is served and revalidated in the background instead of blocking on the origin
  - A store whose `get()` rejects (e.g. Redis down) is skipped with a logged error instead of failing the whole read (matches upstream unkey fix #3303)
  - Background revalidation is now registered with `context.waitUntil` so edge runtimes don't kill it after the response
  - Request-dedup map uses guarded deletes so an awaiting reader can no longer evict a newer in-flight promise
  - Encryption middleware: the shared encrypt memoizer now compares the CryptoKey, so two stores with different keys no longer share ciphertext; undecryptable entries (key rotation, corruption) degrade to a cache miss instead of throwing
  - `DefaultStatefulContext` drops settled promises instead of retaining them forever in long-running processes
  - Upstash store now round-trips values through superjson for parity with the other stores (Dates/Maps survive); entries written by older versions are treated as cache misses
  - Packaging: `files: ["dist"]` on all published packages, removed unused `@libsql/client` dependency from `@alexmchan/memocache` and unused `@upstash/redis` from the libsql store, workspace root marked private

- e94b1bd: Two audit-review follow-ups:
  - **Memory store value immutability (`@alexmchan/memocache`).** The in-memory TTL store returned the stored object by reference while serialized tiers (Redis) return copies, so mutating a value read back silently corrupted the shared entry — and the behavior differed by which tier hit. Returned values are now deep-frozen in development (mutation throws loudly instead of corrupting the cache), and a new `cloneOnGet` option returns a `structuredClone` for callers that need mutable results. Production behavior/perf is unchanged by default; the immutability contract is now documented.
  - **`createRedisStore` localhost warning (`@alexmchan/memocache-store-redis`).** Constructing the store without a `redisClient` still defaults to ioredis's `localhost:6379`, but now logs a warning so a silent misconnection in production is visible.
  - **`hashKey` `undefined`/`null` edge documented (`@alexmchan/memocache-common`).** `JSON.stringify` collapses `undefined` to `null`, so `['x', undefined]` and `['x', null]` share a key — now called out in JSDoc and the reference docs.

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
