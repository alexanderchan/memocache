# Flexible Cache Implementation

This package provides a flexible and extensible caching solution for Node.js applications. It supports multiple storage backends and offers features like TTL (Time-To-Live), automatic background revalidation, and function memoization.

## Features

- Multiple storage backend support (e.g., in-memory TTL store, SQLite)
- Configurable TTL (Time-To-Live) for cache entries
- Automatic background revalidation of stale data
- Function memoization with cache key generation
- Async/await support
- TypeScript support

## Motivation

It can be a lot of setup to use a cache. This package provides a simple to use cache that supports stale while revalidation. The typical pattern for caching requires:

- finding a good key to use for the cache
- checking if the key exists in the cache
- if the key does not exist, fetching the data and storing it in the cache
- if the key does exist, returning the data from the cache
- optionally:
  - setting a TTL on the cached value
  - setting a stale while revalidation policy
  - setting a cache store
  - setting up encrypted caches

One may also want to write back to multiple stores such as an in memory TTL Cache, a local sqlite instance, or Redis. This package provides a simple to use API that supports all of these features.

## Installation

```bash
npm install @alexmchan/cache
```

## Usage

### Basic Usage with TTL Store

```typescript
import { createCache } from '@alexmchan/cache'
import { createTTLStore } from '@alexmchan/cache/stores'
import { Time } from '@alexmchan/cache/time'

const store = createTTLStore({
  defaultTTL: 5 * Time.Minute,
})

const cache = createCache({
  stores: [store],
  defaultOptons: { ttl: 10 * Time.Millisecond, fresh: 5 * Time.Millisecond },
})

const { createCachedFunction } = cache

// Create a cached version of a function
const cachedFunction = createCachedFunction(async (arg) => {
  // Expensive operation
  return `Result for ${arg}`
})

// Use the cached function
console.log(await cachedFunction('example'))
```

### Using SQLite Store

```typescript
import { createCache } from '@alexmchan/cache'
import { createSqliteStore } from '@alexmchan/cache/stores/sqlite'
import { Time } from '@alexmchan/cache/time'
import { createClient } from '@libsql/client'

const sqliteClient = createClient({
  url: 'file::memory:',
})

const sqliteStore = createSqliteStore({
  sqliteClient,
  defaultTTL: 5 * Time.Minute,
  cleanupInterval: 5 * Time.Minute,
})

const cache = createCache({
  stores: [sqliteStore],
  defaultOptons: { ttl: 10 * Time.Millisecond, fresh: 5 * Time.Millisecond },
})

// Use cache as in the previous example
```

## API Reference

### `createCache(options: CacheOptions)`

Creates a new cache instance.

- `options.stores`: An array of `CacheStore` instances
- `options.defaultOptons`: Default options for cache queries
- `options.context`: (Optional) A custom context for managing async operations

Returns an object with the following methods:

- `cacheQuery<T>({ queryFn, queryKey, options })`: Executes a cache query
- `createCachedFunction<T>(fn, options)`: Creates a memoized version of a function
- `dispose()`: Disposes of the cache and its stores

### `createTTLStore(options)`

Creates an in-memory TTL store.

- `options.defaultTTL`: Default Time-To-Live for cache entries

### `createSqliteStore(options)`

Creates a SQLite-based store.

- `options.sqliteClient`: An instance of `@libsql/client`
- `options.defaultTTL`: Default Time-To-Live for cache entries
- `options.cleanupInterval`: Interval for cleaning up expired entries

## Advanced Features

- **Automatic Revalidation**: The cache automatically revalidates stale data in the background, ensuring fresh data is available for subsequent requests.
- **Function Memoization**: Easily create cached versions of functions with automatic cache key generation based on function signature and arguments.
- **Flexible Storage**: Support for different storage backends allows for easy adaptation to various use cases and environments.

## Concepts

### Stores

Stores are the underlying data structure that the cache uses to store the data. The cache uses the store to get, set, and delete data. The store can be anything that implements the `Store` interface and could be an in-memory store, an SQLite store, a Redis store, etc.

### Middleware

Middleware wraps the store definition and returns a new store that can be used in the cache. Middleware can be used to add additional functionality to the store, such as logging, metrics, or encryption. See the `encryption` middleware for an example of how to use middleware.

```ts
const ttlStore = createTTLStore({ defaultTTL: 60 * Time.Second })

const encryptedStore = createEncryptedStore({
  key: 'this is secret sauce',
  salt: 'this is salty',
  store: ttlStore,
})

export const { createCachedFunction, cacheQuery } = createCache({
  stores: [encryptedStore],
})
```

## Optimizations and advanced usage

### Calling the memoized function

Although it will work, it is better to setup and export the memozied function outside of the function that uses it to avoid creating the cache key on every call since we create a hash of the function.toString() to generate a unique cache key.

```ts
// ok but slower
export function useExampleFn() {
  const exampleFn = () => 'example'
  const memoizedFn = createCachedFunction(exampleFn)

  return memoizedFn()
}

// good, especially with many memoized functions
export const memoizedFn = createCachedFunction(exampleFn)
```

### Fine tuning the cache key

The created cache's `cacheQuery` function is an API that allows for more fine tuning of the cache key. This can be useful if the default cache key is not sufficient or additional keys are needed to use to help invalidate or scope the cache.

This also allows for different queries to update the same cache key.

```ts
import { cacheQuery } from 'your/path/to/cache'

function exampleGetItems() {
  return cacheQuery({
    queryKey: ['/items', {customerId, storeId}],
    queryFn: async fetch() {
        return fetchItems({ storeId })
    },
  })
}


```

Note that a similar behaviour could be achieved to add additional keys by wrapping the the memoized function with the extra keys needed to invalidate the cache.

```ts
const memoizedFn = createCachedFunction(({ storeId, customerId }) =>
  exampleFn({ storeId })
)
```

### Bypassing the cache

To bypass the cache the original function can be used or call the `.uncached()` method on the memoized function.

```ts
const memoizedFn = createCachedFunction(exampleFn)
await memoizedFn.uncached() // Bypass the cache
```

## Large cache keys

If there are large payloads in the memoized function calls, these are stored as a part of the cache key. Some middleware could be utilized if this is the case to hash the key payload and store the hash as the key instead.

## Dispose support

The cache supports disposing of the cache and its stores from typescript>=5.2. This is useful for cleaning up resources when the cache is no longer needed rather than calling the dispose manually.

```typescript
async function main() {
  // initialize stores
  await using cache = createCache({
    stores: [store],
  })

  // will cleanup stores when createCache is disposed
  // await cache.dispose()
}
```

## References

This was inspired by the apis and code [@unkey/cache](https://www.npmjs.com/package/@unkey/cache) and [react-query](https://tanstack.com/query).

The primary difference to `@unkey/cache` is that this package is more focused on providing an even more simple api so that each function that is called doesn't need to generate it's own store itself and to allow per function based cache invalidation and configuration of stale and expiry times.

## Benchmarks

Run the `src/__tests__/benchmark.ts` script to get a rough idea of the performance of the different stores on your platform.

Performs a read write of the same key multiple times and outputs the average time taken.

```
TTL store average time: 0.000ms
SQLite in memmory store average time: 0.037ms
Memoized encrypted TTL store average time: 0.034ms
Non-memoized encrypted TTL store average time: 0.039ms // this is more the overhead of the encryption
Redis store average time: 0.241ms // Redis on localhost
SQLite disk store average time: 0.531ms // SQLite on disk
Upstash redis from local to remote: 118.711ms // Redis on upstash over https from local -- hopefully faster from aws?
```
