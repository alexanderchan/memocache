---
"@alexmchan/memocache": major
"@alexmchan/memocache-common": major
"@alexmchan/memocache-store-redis": major
"@alexmchan/memocache-store-libsql": major
---

## Bug Fixes

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
