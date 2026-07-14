---
title: API Reference
description: Core memocache APIs for creating caches, memoizing functions, and managing entries.
---

# API reference

## `createCache(options?)`

Creates a cache instance.

- `stores`: ordered list of cache stores, read from first to last
- `getStoresAsync`: async store factory for environments that need lazy imports
- `context`: background task coordinator used for writes and revalidation
- `defaultTTL`: default expiration window, default `5 * Time.Minute`
- `defaultFresh`: default freshness window, default `30 * Time.Second`
- `defaultStaleIfError`: default stale-if-error window, default `0` (off) — see [stale-if-error](#stale-if-error-and-negative-caching)
- `defaultNullTTL`: default negative-caching window, default unset (nullish results are cached like any other value)
- `revalidateBackoff`: backoff for failed revalidations, default `{ initialMs: 1 * Time.Second, maxMs: 30 * Time.Second }`; pass `false` to disable. When a revalidation rejects, further attempts for that key are skipped (the stale value keeps being served) until an exponential backoff with jitter elapses. Only applies when a stale value exists to serve — a cold miss always retries the origin, and rejections are never cached.
- `logger`: logger for background/store errors

Returns:

- `createCachedFunction(fn, options?)`
- `cacheQuery({ queryFn, queryKey, options? })`
- `invalidate({ queryKey })`
- `setCacheData({ queryKey, value, ttl? })`
- `dispose()`

If you do not pass `stores` or `getStoresAsync`, memocache creates a default in-memory TTL store.

## `createCachedFunction(fn, options?)`

Wraps a function in cache lookup and revalidation logic.

- `cachePrefix`: optional stable prefix for the function key
- `ttl`: override entry TTL for this function
- `fresh`: override freshness window for this function
- `staleIfError`: stale-if-error window for this function, see below
- `nullTTL`: negative-caching window for this function, see below

By default, memocache builds a prefix from `fn.name + fn.toString()`. That is convenient, but it has two hazards — **prefer passing an explicit `cachePrefix`.**

:::caution[Always set `cachePrefix` in production]

1. **Closure collision (wrong-data bug).** Two closures produced by the same factory have identical source but capture different state, so they derive the _same_ prefix and read/write each other's entries:

   ```ts
   const getForTenant = (tenantId: string) =>
     cache.createCachedFunction(async (id: string) => fetchItem(tenantId, id))
   // ⚠️ these two share a cache namespace — tenant B can read tenant A's data
   const a = getForTenant('tenant-a')
   const b = getForTenant('tenant-b')
   ```

   Give each closure its own `cachePrefix` (e.g. include `tenantId`).

2. **Keyspace rotation across deploys.** Bundler minification changes `fn.toString()` per build, so every deploy — and each side of a rolling deploy — uses a fresh keyspace, doubling origin load mid-rollout.

In development, memocache logs a warning when a cached function is created without an explicit `cachePrefix`.

:::

```ts
const cachedUser = cache.createCachedFunction(
  async ({ customerId, userId }) => getUser({ customerId, userId }),
  { cachePrefix: '/users/by-id', fresh: 15 * Time.Second },
)
```

The returned function also has:

- `.invalidate(...args)`
- `.getCachePrefix()`
- `.getCacheKey(...args)`

```ts
await cachedUser({ customerId: 'c1', userId: 'u1' })
await cachedUser.invalidate({ customerId: 'c1', userId: 'u1' })
```

## `cacheQuery({ queryFn, queryKey, options? })`

Runs an explicit cache query with a caller-provided key.

Use this when:

- you want cache keys to match an existing convention
- you want a query-key shape similar to TanStack Query
- you do not want the function source to affect the namespace

```ts
function getItems({ storeId, customerId }) {
  return cache.cacheQuery({
    queryKey: ['/items', { storeId, customerId }],
    queryFn: async () => fetchItems({ storeId, customerId }),
    options: {
      fresh: 30 * Time.Second,
      ttl: 5 * Time.Minute,
    },
  })
}
```

:::note[Key edge case: `undefined` vs `null`]
Query keys are serialized with `JSON.stringify`, which collapses `undefined` to `null` in arrays. So `['user', undefined]` and `['user', null]` hash to the same key and share a cache entry. If you need to distinguish them, encode the difference explicitly (e.g. a sentinel string).
:::

## Stale-if-error and negative caching

Both options are available per-query (`cacheQuery` options, `createCachedFunction` options) and as cache-wide defaults (`defaultStaleIfError`, `defaultNullTTL`).

- `staleIfError` (default `0`, off): extra window past `ttl` during which the entry is kept in storage and served **only if revalidation fails** ([RFC 5861](https://www.rfc-editor.org/rfc/rfc5861)). Storage expiry becomes `ttl + staleIfError`, and the boundary is fixed at write time. An origin outage then degrades to serving stale data instead of throwing.
- `nullTTL` (default unset): when `queryFn` resolves to `null`/`undefined`, cache the result for this window and serve it as **fresh** for the whole window — no background revalidation churn for "not found" results. Rejections are never cached regardless of this option.

```ts
const cachedUser = cache.createCachedFunction(getUser, {
  cachePrefix: '/users/by-id',
  fresh: 30 * Time.Second,
  ttl: 5 * Time.Minute,
  staleIfError: 1 * Time.Hour, // outage fallback: serve stale up to 1h past ttl
  nullTTL: 1 * Time.Minute, // "user not found" is remembered for 1 minute
})
```

## `invalidate({ queryKey })`

Deletes the hashed key from every configured store.

```ts
await cache.invalidate({
  queryKey: ['/items', { storeId, customerId }],
})
```

## `setCacheData({ queryKey, value, ttl? })`

Writes a value directly to every store. The value is stored in the internal `{ value, age, staleIfErrorAt }` envelope expected by `cacheQuery()`.

```ts
await cache.setCacheData({
  queryKey: ['/items', { storeId }],
  value: cachedItems,
  ttl: 5 * Time.Minute,
})
```

## `dispose()`

Calls `dispose()` on each store if it exists. Use it when you are done with long-lived cache instances or in tests.
