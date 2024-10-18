---
title: Usage
description: Learn how to use the Memocache package to cache data in your Node.js applications.
---

# memocache

This package provides a flexible and extensible caching solution for Node.js applications. It supports multiple storage backends and offers features like TTL (Time-To-Live), automatic background revalidation, and function memoization.

## Features

- Multiple storage backend support (e.g., in-memory TTL store, Redis, SQLite)
- Configurable TTL (Time-To-Live) for cache entries
- Automatic background revalidation of stale data
- Function memoization with automatic cache key generation `const cachedFunction = createCachedFunction(anyFunction)` with automatic typed arguments and return values
- Supports middleware for encryption and metrics of cache stores

## Installation

```bash
pnpm install @alexmchan/memocache
```

## Usage

### Basic Usage with TTL Store

```typescript
import { createCache } from '@alexmchan/memocache'
import { createTTLStore } from '@alexmchan/memocache/stores'
import { Time } from '@alexmchan/memocache/time'

const store = createTTLStore({
  defaultTTL: 5 * Time.Minute,
})

const cache = createCache({
  defaultFresh: 30 * Time.Second,
  stores: [store],
})

const { createCachedFunction } = cache

// your fetch function
function fetchSomething(arg) {
  return `Result for ${arg}`
}

// Create a cached version of a function
const cachedFetchSomething = createCachedFunction(fetchSomething)

// Use the cached function
console.log(await cachedFetchSomething('example')) // fetchSomething is called once
console.log(await cachedFetchSomething('example')) // fetchSomething is not called cached value is returned
```

## How it works

1. Data is read from the stores, if it is not found we call the function to get the data.

2. If the data exists in the store, we check if it is stale we return the value in the store and then call the function to get the fresh data.

3. If the data is past it's time to live it will be expired from the store

![A diagram of how the caching works](https://raw.githubusercontent.com/alexanderchan/memocache/refs/heads/main/docs/src/assets/overview-diagram-1.svg)

<!--
this diagram is in docs/src/assets/overview-diagram.svg
and can be generated from the script in docs `generate:diagrams`
 -->

## Motivation

There can be a lot of wrapper code to use a cache. This package provides a simple to use cache that supports stale while revalidation. The typical pattern for caching requires:

- finding a good key to use for the cache, typically the parameters to the function
- checking if the key exists in the cache
- if the key does not exist, fetching the data and storing it in the cache
- if the key does exist, returning the data from the cache
- optionally:
  - setting a TTL on the cached value
  - setting a stale while revalidation policy
  - setting a cache store
  - setting up encrypted caches

One may also want to write back to multiple stores such as an in memory TTL Cache, a local sqlite instance, or Redis. This package provides a simple to use API that supports all of these features.

We use the stable stringified hash popularized by react-query to generate the cache key and a sha256 hash of any function code. This allows for easy generation of the cache key based on the function signature and arguments allowing us to easily memoize functions.

This also supports the stale while revalidate pattern allowing to return stale data while fetching fresh data in the background.

```ts
// with memocache
const { createCachedFunction } = createCache({
  stores: [createTTLStore()],
})

// Create a cached version of a function
const cachedFunction = createCachedFunction(async ({ id, name }) => {
  // some expensive operation or fetch
  return `Result for ${arg}`
})

// The old way without memocache to help

function doSomething({ id, name }) {
  // check the cache
  const key = JSON.stringify({ id, name })
  const cachedValue = cache.get(key)
  if (cachedValue) {
    return cachedValue
  }

  // some expensive operation or fetch
  const result = await doSomethingVeryExpensive(`Result for ${id} and ${name}`)

  // we have to wait here or we need to find a way to signal to the platform for serverless that the
  try {
    await cache.set(key, result, timeToLive)
  } catch (e) {
    //...
  }
  // now repeat for all available cache's and we still need
  // to add stale while revalidate
  // and serverless support
  return result
}
```

With this method it's easy to wrap a function and have it read/write from multiple stores.

## API Reference

### `createCache(options: CacheOptions)`

Creates a new cache instance.

- `options.stores`: An array of `CacheStore` instances
- `options.defaultTTL`: Default Time-To-Live for cache entries
- `options.defaultFresh`: Revalidate stale data after this time
- `options.context`: (Optional) A custom context for managing async operations

Returns an object with the following methods:

- `createCachedFunction<T>(fn, options)`: Creates a memoized version of a function
- `cacheQuery<T>({ queryFn, queryKey, options })`: Executes a cache query
- `dispose()`: Disposes of the cache and its stores

### `createCachedFunction(fn, options)`

Creates a memoized version of a function.

- `fn`: The function to memoize
- `options`(optional): `CacheQueryOptions` Options for the memoized function
- `options.cachePrefix`: A prefix will be auto generated based on the function contents for convenience and will add only fractions of a millisecond, however for very very large functions this might be a concern so one can specify a prefix such as `/api/todos` to scope the function to a known value. Note that any change to the function code will also change the cache key unless this value is set.
- `options.ttl`: Time-To-Live for cache entries in ms
- `options.fresh`: Revalidate stale data after this time in ms

> 🟡 Make sure that any identifiers that might be inferred from auth such as customerId are passed in as arguments to the function to ensure that the cache key is unique per user so that one user doesn't see another user's data. Alternatively, specify your own cache keys with cacheQuery.

### `cacheQuery({ queryFn, queryKey, options })`

Executes a cache query with a specific set of keys. This resembles the `useQuery` api. As an added bonus, the react-query [eslint plugin](https://tanstack.com/query/latest/docs/eslint/eslint-plugin-query) will also help validate that external values are included in the querykey.

```ts

function exampleFunction({ storeId, customerId }) {

 return cacheQuery({
    queryKey: ['/items', { storeId, customerId }],
    queryFn: async fetch() {
        return fetchItems({ storeId,customerId })
    },
  })
}

```

### Invalidating a Cache Entry

To invalidate a cache entry, there's a `.invalidate()` method on the memoized function that can be called with the same signature as the original function.

```typescript
const { createCachedFunction } = createCache({
  stores: [sqliteStore],
})

const myCachedFunction = createCachedFunction(async ({ example }) => {
  return `Result for ${example}`
})

await myCachedFunction({ example: 'example' })
await myCachedFunction.invalidate({ example: 'example' })
```

## Stores

### TTL Store

Creates an in-memory TTL store based on `@isaacs/ttl-cache`.

```typescript
const store = createTTLStore({
  defaultTTL: 5 * Time.Minute,
})
```

### SQLite Store `createSqliteStore(options)`

Creates a [libSql](https://www.npmjs.com/package/@libsql/client) SQLite store.

- `options.sqliteClient`: An instance of `@libsql/client`
- `options.defaultTTL`: Default Time-To-Live for cache entries
- `options.cleanupInterval`: Interval for cleaning up expired entries

```typescript
import { createCache } from '@alexmchan/memocache'
import { createSqliteStore } from '@alexmchan/memocache/stores/sqlite'
import { Time } from '@alexmchan/memocache/time'
import { createClient } from '@libsql/client'

const sqliteClient = createClient({
  url: 'file::memory:', // or file:./cache.db
})

const sqliteStore = createSqliteStore({
  sqliteClient,
  cleanupIntervalp: 5 * Time.Minute,
  defaultTTL: 10 * Time.Minute,
})

const cache = createCache({
  stores: [sqliteStore],
  defaultFresh: 1 * Time.Minute,
  defaultTTL: 5 * Time.Minute,
})

// Use cache as in the previous example
```

### Redis Store `createRedisStore`

An [ioredis](https://github.com/redis/ioredis) based store.

```
pnpm install @alexmchan/memocache-store-redis
```

```typescript
import { createRedisStore } from '@alexmchan/memocache-store-redis'
import { Redis } from 'ioredis'

const redisStore = createRedisStore({
  redisClient: new Redis({
    host: 'localhost',
    port: 6379,
  }),
  defaultTTL: 5 * Time.Minute,
})
```

### Upstash Redis Store `createUpstashRedisStore`

An [Upstash](https://github.com/upstash/redis-js) Redis store (also [`@vercel/kv`](https://github.com/vercel/storage/blob/main/packages/kv/src/index.ts) since it's a proxy of Upstash).

```typescript
import { createUpstashRedisStore } from '@alexmchan/memocache-store-redis'
import { Redis } from '@upstash/redis'
const redisRestStore = createUpstashRedisStore({
  redisClient: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }),
  defaultTTL: 5 * Time.Minute,
})
```

## Middleware

Middleware wraps the store definition and returns a new store that can be used in the cache. Middleware can be used to add additional functionality to the store, such as logging, metrics, or encryption. See the `encryption` middleware for an example of how to use middleware.

### Encrypted middleware

Attach encryption to any store. This middleware encrypts the value before storing it in the store and decrypts it when retrieving it.

A hash of the key/salt is used to encrypt the value and a part of the cache. Changing the key or salt will effectively invalidate the cache values.

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

### Metrics

Attach metrics to any store. This middleware logs the time taken to get, set, and delete values from the store.

```ts
const ttlStore = createTTLStore({ defaultTTL: 60 * Time.Second })
const metricsSqliteStore = createMetricsStore({
  store: ttlStore,
})

// output to the logger
// Metric {
//   metric: "cache.read",
//   key: "[\"hello/80c56980e62840587ea4c2f103f23f08e042bd8cea808025219e4e7d1b7c996d\",[{\"message\":\"world\"}]]",
//   hit: true,
//   latency: 1,
// }
```

## Advanced Features

### Context

For serverless functions, the context object can be used to manage asynchronous operations. The context object has a `waitUntil` method that can be used to enqueue asynchronous tasks to be performed during the lifecycle of the request.

The job of the context is to wait on any asynchronous operations that need to be completed before the function can return so it is left up to the implementer to decide what to do with the context. The context will be provided with promise(s) that need to be completed.

As described in the Vercel documentation:

> The waitUntil() method enqueues an asynchronous task to be performed during the lifecycle of the request. You can use it for anything that can be done after the response is sent, such as logging, sending analytics, or updating a cache, without blocking the response from being sent. waitUntil() is available in the Node.js and Edge Runtime. Promises passed to waitUntil() will have the same timeout as the function itself. If the function times out, the promises will be cancelled.

> To use waitUntil() in your function, import the waitUntil() method from @vercel/functions package. For more information, see the @vercel/functions reference.

```ts
export interface Context {
  waitUntil: (p: Promise<unknown>) => void
}
```

```ts
import { Context } from './context'
import { waitUntil } from '@vercel/functions'

createCache({
  context: {
    waitUntil,
    [Symbol.asyncDispose]() {
      // cleanup
    },
  },
  // ...
})
```

Vendor specific documentation:

- [Vercel Serverless](https://vercel.com/docs/functions/functions-api-reference#waituntil)
- [Vercel Edge and Middleware](https://vercel.com/docs/functions/edge-middleware/middleware-api#waituntil)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/context/)
- [AWS response streaming](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/)
- [AWS Lambda event loops](https://dev.to/dvddpl/event-loops-and-idle-connections-why-is-my-lambda-not-returning-and-then-timing-out-2oo7)

To be tested implementation of a cache flushing waitable context:

```ts
//**----------------------------------------------------
/* This is a simple context and only for serverless environments
/* where the list of waitables won't grow indefinitely
/*--------------------------------------------------**/

function createSimpleContext() {
  waitables: Promise<unknown>[] = []
  const context = {
    waitables,
    waitUntil(p) {
      waitables.push(p);

      if (waitables.length > 1000) {
        this.flushCache();
      }
    },

    async flushCache() {
      await Promise.allSettled(waitables);
      waitables.length = 0;
    },

    [Symbol.asyncDispose]() {
      return this.flushCache();
    }
  };

  return context;
}

async function handler(event, context) {
  using simpleContext = new SimpleContext()
  using cache = createCache({
    stores: [store],
    context: simpleContext,
  })
  // do work, ideally return using streaming response otherwise the user response will wait on the flushCache

  // without `using` we have to wait for all promises to finish
  await simpleContext.flushCache()
}
```

## Concepts

### Stores

Stores are the underlying data structure that the cache uses to store the data. The cache uses the store to get, set, and delete data. The store can be anything that implements the `Store` interface and could be an in-memory store, an SQLite store, a Redis store, etc.

### Default TTL

The time to live will be taken in the order of:

1. The default TTL of function if defined
2. The default TTL of the store if defined
3. The default TTL of the cache if defined

This allows for overriding of the per function TTL, but otherwise we can have different TTLs for the stores so that something that has a larger capacity such as a disk store can have a longer TTL than a memory store.

### `Time` Constants

Constants for time units in milliseconds.

- `Time.Millisecond`
- `Time.Second`
- `Time.Minute`
- `Time.Hour`
- `Time.Day`
- `Time.Week`

Usage `5 * Time.Minute` or `10 * Time.Second`, mirrors [`go's Time durations`](https://github.com/golang/go/blob/b521ebb55a9b26c8824b219376c7f91f7cda6ec2/src/time/time.go#L930).

Or choose any time library for `millisecond` durations

```typescript
import { Duration } from 'effect'

const defaultTTL = Duration.decode('10 minutes').value.millis
```

### Build your own store

The store interface is the following

```typescript
export interface CacheStore extends AsyncDisposable {
  /** Set a value in the store, ttl in milliseconds */
  set(key: string, value: any, ttl?: number): Promise<any>
  get(key: string): Promise<any>
  delete(key: string): Promise<unknown>

  /** Remove all values from the store */
  clear?(): Promise<any>
  /** dispose of any resources or connections when the cache is no longer in use */
  dispose?(): Promise<any>
}
```

## Optimizations and advanced usage

### Calling the memoized function

Although it will work, it is better to setup and export the memozied function outside of the function that uses it to avoid creating the cache key on every call since we create a hash of the function.toString() to generate a unique cache key. Hashing is normally hardware accelerated and should add less than a few fractions of a ms (less than the encryption numbers in the benchmarks and only when the function is called for the first time).

```ts
// ok but slower
export function useExampleFn() {
  const exampleFn = () => 'example'
  const memoizedFn = createCachedFunction(exampleFn)

  return memoizedFn()
}

// good, especially with many memoized functions
export const memoizedFn = createCachedFunction(exampleFn)

// good, doesn't require any function hashing
const memoizedFn = createCachedFunction(exampleFn, {
  options: { cachePrefix: '/api/todos' },
})
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
  exampleFn({ storeId }),
)
```

### Bypassing the cache

To bypass the cache just call the original function directly.

```ts
const exampleOriginalFn = async (parameter) => {
  return `Result for ${parameter}`
}
const memoizedFn = createCachedFunction(exampleOriginalFn)
exampleOriginalFn('example') // bypasses the cache
```

## Large cache keys

If there are large payloads in the memoized function calls, these are stored as a part of the cache key. Some middleware could be utilized if this is the case to hash the key payload and store the hash as the key instead.

The encryption middlware hashes the key by default and is an option to use that for larger keys.

## Dispose support

The cache supports automatic disposing of the cache with the [using](https://www.totaltypescript.com/typescript-5-2-new-keyword-using) and its stores from `typescript >= 5.2`. This is useful for cleaning up resources when the cache is no longer needed rather than calling the dispose manually.

```typescript
async function main() {
  // initialize stores and dispose of when done
  await using cache = createCache({
    stores: [store],
  })

  // we can also manually dispose of all stores if we don't have the `using` keyword available
  await cache.dispose()
}
```

## References

This was inspired by the apis and code [@unkey/cache](https://www.npmjs.com/package/@unkey/cache) and [react-query](https://tanstack.com/query). Laravel also has a similar [caching](https://laravel.com/docs/master/cache) api.

The primary difference to `@unkey/cache` is that this package is more focused on providing an even more simple api so that each function that is called doesn't need to generate it's own store itself and to allow per function based cache invalidation and configuration of stale and expiry times.

## Benchmarks

Run the `src/__tests__/benchmark.ts` script to get a rough idea of the performance of the different stores on your platform.

Performs a read write of the same key multiple times and outputs the average time taken.

```
TTL store average time: 0.000ms
SQLite in memory store average time: 0.037ms
Memoized encrypted TTL store average time: 0.034ms
Non-memoized encrypted TTL store average time: 0.039ms // this is more the overhead of the encryption
Redis store average time: 0.241ms // Redis on localhost
SQLite disk store average time: 0.531ms // SQLite on disk
Upstash redis from local to remote: 118.711ms // Redis on upstash over https from local -- hopefully faster from aws?
```
