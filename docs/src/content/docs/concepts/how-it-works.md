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

## `fresh` vs `ttl`

```text
Timeline: [0 --- fresh --- ttl --- infinity]
  [0, fresh]   -> serve from cache
  [fresh, ttl] -> serve stale data + revalidate in background
  [ttl, inf]   -> cache miss, fetch fresh data
```

- `fresh`: how long cached data is considered fresh.
- `ttl`: how long cached data is kept at all.

`createCache()` defaults to `30 * Time.Second` for `fresh` and `5 * Time.Minute` for `ttl`.

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
