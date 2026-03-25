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
- `logger`: logger for background/store errors
- `defaultRetry`: default number of retries for failed `queryFn` calls, default `3`. Pass `false` to disable.
- `defaultRetryDelay`: default delay between retries. Accepts a number (ms) or `(attempt, error) => number`. Defaults to exponential backoff capped at 30s.

Returns:

- `createCachedFunction(fn, options?)`
- `cacheQuery({ queryFn, queryKey, options? })`
- `invalidate({ queryKey, exact? })`
- `setCacheData({ queryKey, value, ttl? })`
- `dispose()`

If you do not pass `stores` or `getStoresAsync`, memocache creates a default in-memory TTL store.

## `createCachedFunction(fn, options?)`

Wraps a function in cache lookup and revalidation logic.

- `cachePrefix`: optional stable prefix for the function key
- `ttl`: override entry TTL for this function
- `fresh`: override freshness window for this function
- `retry`: override retry count for this function
- `retryDelay`: override retry delay for this function

By default, memocache builds a prefix from `fn.name + fn.toString()`. That is convenient, but it also means code changes can change the cache namespace. Set `cachePrefix` yourself if you want a stable identifier such as `'/api/items'`.

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

`queryFn` receives an optional `{ signal: AbortSignal }` context. Pass it to your fetch calls to support cancellation:

```ts
cache.cacheQuery({
  queryKey: ['/items'],
  queryFn: ({ signal } = {}) => fetch('/api/items', { signal }).then(r => r.json()),
})
```

**Per-query options:**

- `ttl`: override entry TTL
- `fresh`: override freshness window
- `retry`: override retry count (`false` to disable)
- `retryDelay`: override retry delay — a number in ms or `(attempt, error) => number`
- `signal`: `AbortSignal` to cancel the in-flight `queryFn`

### Retry

When `queryFn` throws, memocache retries up to `retry` times (default `3`) with exponential backoff. The default delay is `min(1000 * 2^attempt, 30_000)` ms — 1s, 2s, 4s, up to 30s.

```ts
// Fail fast with no retries
cache.cacheQuery({
  queryKey: ['/items'],
  queryFn: fetchItems,
  options: { retry: false },
})

// Custom retry delay
cache.cacheQuery({
  queryKey: ['/items'],
  queryFn: fetchItems,
  options: { retry: 5, retryDelay: (attempt) => attempt * 200 },
})
```

Concurrent requests sharing the same key (via deduplication) also share the same retrying promise — retries happen once, not once per caller.

### AbortSignal

Pass a `signal` to cancel an in-flight fetch. Useful with `AbortController` or `AbortSignal.timeout()`:

```ts
const controller = new AbortController()

const result = cache.cacheQuery({
  queryKey: ['/items'],
  queryFn: ({ signal } = {}) => fetch('/api/items', { signal }).then(r => r.json()),
  options: { signal: controller.signal },
})

// Cancel the request
controller.abort()
```

Background revalidation (stale-while-revalidate) is not affected by the caller's signal — it always runs to completion.

## `invalidate({ queryKey, exact? })`

Removes entries from every configured store.

**Exact match** (default, `exact: true`):

```ts
await cache.invalidate({
  queryKey: ['/items', { storeId, customerId }],
})
```

**Partial match** (`exact: false`):

Invalidates all entries whose key contains the filter as a prefix/subset — the same recursive subset semantics as TanStack Query's `partialMatchKey`.

```ts
// Invalidate all /items queries regardless of params
await cache.invalidate({ queryKey: ['/items'], exact: false })

// Invalidate all /items queries where status is 'done' (regardless of other params)
await cache.invalidate({ queryKey: ['/items', { status: 'done' }], exact: false })
```

The matching rule: every element present in the filter key must exist and equal the corresponding element in the stored key. Extra elements in the stored key are ignored. This means `['/items']` matches `['/items', { status: 'done' }]` but `['/items', { status: 'done' }]` does not match `['/items']`.

Partial matching is maintained via an in-memory key registry. Keys are re-registered on cache miss, so the registry self-heals after a restart.

## `setCacheData({ queryKey, value, ttl? })`

Writes a value directly to every store. The value is stored in the internal `{ value, age }` envelope expected by `cacheQuery()`.

```ts
await cache.setCacheData({
  queryKey: ['/items', { storeId }],
  value: cachedItems,
  ttl: 5 * Time.Minute,
})
```

Entries written via `setCacheData` are also registered in the key registry and can be partially invalidated.

## `dispose()`

Calls `dispose()` on each store if it exists. Use it when you are done with long-lived cache instances or in tests.
