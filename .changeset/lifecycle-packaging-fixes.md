---
'@alexmchan/memocache': minor
'@alexmchan/memocache-common': patch
'@alexmchan/memocache-store-redis': minor
'@alexmchan/memocache-store-libsql': patch
'@alexmchan/msw-testing': minor
---

Lifecycle, API, and packaging fixes:

- `cacheQuery` / `createCachedFunction` return types narrowed to `Promise<T>` / `Promise<Awaited<ReturnType<T>>>` — no more needless null-guards on consumers
- Removed dead `Result`/`Ok`/`Err`/`wrap` exports; the error module now re-exports `CacheError`/`BaseError` from the package root
- TTL store's dev-only `entries()` guard no longer throws `ReferenceError` in runtimes without `process` (edge/browser)
- Metrics middleware now delegates the wrapped store's optional `clear()` and `entries()`
- ioredis store: initialization errors on an injected client promise are caught and logged; `dispose()` only quits clients the store created itself (injected clients stay connected)
- libsql/sqlite store: cleanup interval is `unref()`'d so scripts exit promptly; `dispose()` closes self-created clients; expired-entry deletes log failures instead of crashing
- Upstash store: connection ping on construction is now opt-in via `verifyConnection` (default off — no paid REST call per cold start)
- Exports maps use the attw-recommended nested `types` conditions on all packages (attw clean on node10/node16-cjs/node16-esm/bundler); `@alexmchan/msw-testing` now ships real ESM alongside CJS
