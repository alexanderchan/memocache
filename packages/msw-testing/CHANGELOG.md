# @alexmchan/msw-testing

## 3.0.0

### Major Changes

- 5a18615: Remove libsql in favor of node:sql

### Minor Changes

- 1e3a54a: Lifecycle, API, and packaging fixes:
  - `cacheQuery` / `createCachedFunction` return types narrowed to `Promise<T>` / `Promise<Awaited<ReturnType<T>>>` — no more needless null-guards on consumers
  - Removed dead `Result`/`Ok`/`Err`/`wrap` exports; the error module now re-exports `CacheError`/`BaseError` from the package root
  - TTL store's dev-only `entries()` guard no longer throws `ReferenceError` in runtimes without `process` (edge/browser)
  - Metrics middleware now delegates the wrapped store's optional `clear()` and `entries()`
  - ioredis store: initialization errors on an injected client promise are caught and logged; `dispose()` only quits clients the store created itself (injected clients stay connected)
  - libsql/sqlite store: cleanup interval is `unref()`'d so scripts exit promptly; `dispose()` closes self-created clients; expired-entry deletes log failures instead of crashing
  - Upstash store: connection ping on construction is now opt-in via `verifyConnection` (default off — no paid REST call per cold start)
  - Exports maps use the attw-recommended nested `types` conditions on all packages (attw clean on node10/node16-cjs/node16-esm/bundler); `@alexmchan/msw-testing` now ships real ESM alongside CJS

### Patch Changes

- e7dc3cb: SWR correctness and packaging fixes:
  - `cacheQuery` no longer loses a stale hit from a higher-priority store when a lower-priority store misses — the stale value is served and revalidated in the background instead of blocking on the origin
  - A store whose `get()` rejects (e.g. Redis down) is skipped with a logged error instead of failing the whole read (matches upstream unkey fix #3303)
  - Background revalidation is now registered with `context.waitUntil` so edge runtimes don't kill it after the response
  - Request-dedup map uses guarded deletes so an awaiting reader can no longer evict a newer in-flight promise
  - Encryption middleware: the shared encrypt memoizer now compares the CryptoKey, so two stores with different keys no longer share ciphertext; undecryptable entries (key rotation, corruption) degrade to a cache miss instead of throwing
  - `DefaultStatefulContext` drops settled promises instead of retaining them forever in long-running processes
  - Upstash store now round-trips values through superjson for parity with the other stores (Dates/Maps survive); entries written by older versions are treated as cache misses
  - Packaging: `files: ["dist"]` on all published packages, removed unused `@libsql/client` dependency from `@alexmchan/memocache` and unused `@upstash/redis` from the libsql store, workspace root marked private

## 2.0.0

### Major Changes

- 0a1979c: initial creation
