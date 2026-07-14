---
title: How It Works
description: Understand fresh hits, stale hits, expiry, and store promotion.
---

# How it works

At a high level, memocache checks cache stores in priority order, returns data immediately when it can, and refreshes stale entries in the background.

## Read flow

1. The cache reads stores from first to last.
2. If no store has the key, `queryFn` runs and the result is written to every store.
3. If a store has the key and the entry is still fresh, the cached value is returned immediately.
4. If a store has the key but the entry is stale, the stale value is returned and a background revalidation starts.
5. If a lower-priority store returns a fresh hit, memocache backfills higher-priority stores in the background.
6. If the entry is past TTL, it is treated as expired and fresh data must be fetched.

![A diagram of how the caching works](https://raw.githubusercontent.com/alexanderchan/memocache/refs/heads/main/docs/src/assets/overview-diagram-1.svg)

## `fresh` vs `ttl` (and `staleIfError`)

```text
Timeline: [0 --- fresh --- ttl --- ttl + staleIfError --- infinity]
  [0, fresh]              -> serve from cache
  [fresh, ttl]            -> serve stale data + revalidate in background
  [ttl, ttl+staleIfError] -> revalidate in foreground; serve stale ONLY if it fails
  [after]                 -> cache miss, fetch fresh data
```

- `fresh`: how long cached data is considered fresh.
- `ttl`: how long cached data may be served as ordinary stale data.
- `staleIfError` (default `0`, off): emergency window past `ttl` where the entry is served only when revalidation fails, so an origin outage degrades to stale data instead of errors.

`createCache()` defaults to `30 * Time.Second` for `fresh` and `5 * Time.Minute` for `ttl`.

## Failure handling

- **Rejections are never cached.** A failed `queryFn` on a cache miss throws to the caller, and the next call retries.
- **Revalidation backoff (default on).** When a background revalidation fails, memocache keeps serving the stale value and skips further origin attempts for that key until an exponential backoff with jitter elapses (1s doubling to a 30s cap). This stops a failing origin from being re-hammered on every request. Disable with `revalidateBackoff: false`.
- **Negative caching (`nullTTL`, opt-in).** Cache "not found" (`null`/`undefined`) results for a short window and serve them as fresh, so misses against missing records don't hit the origin on every call.

## Why this exists

Without a helper like memocache, most cached functions repeat the same work:

- derive a stable key
- check for a hit
- handle misses
- write results
- pick TTLs
- decide whether stale data can be served
- repeat the whole flow across multiple stores

memocache centralizes that logic and generates stable keys from the function and its arguments, while still allowing explicit query keys through `cacheQuery()`.

## Key safety

For memoized functions, include any data that changes the result in the function arguments. That includes identifiers that might otherwise be implied by auth or request context. If the output varies by `customerId`, that `customerId` should be part of the cache key.

Use `cacheQuery()` when you want full control over the query key.
