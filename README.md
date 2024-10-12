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
- Function memoization with automatic cache key generation `const cachedFunction = createCachedFunction(async () => "I'm cached")`
- Supports middleware for encryption of cache stores

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
  defaultFresh: 30 * Time.Second,
  defaultTTL: 5 * Time.Minute,
})

const cache = createCache({
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

We use the stable stringified hash popularized by react-query to generate the cache key. This allows for easy generation of the cache key based on the function signature and arguments allowing us to easily memoize functions.

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

// without, for each function

function doExpensiveOperation({ id, name }) {
  // check the cache
  const key = JSON.stringify({ id, name })
  const cachedValue = cache.get(key)
  if (cachedValue) {
    return cachedValue
  }

  // some expensive operation or fetch
  const result = `Result for ${id} and ${name}`

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
- `options`(optional): Options for the memoized function
- `options.cachePrefix`: A prefix will be auto generated based on the function contents for convenience and will add only fractions of a millisecond, however for very very large functions this might be a concern so one can specify a prefix such as `/api/todos` to scope the function to a known value. Note that any change to the function code will also change the cache key unless this value is set.
- `options.ttl`: Time-To-Live for cache entries in ms
- `options.fresh`: Revalidate stale data after this time in ms

## Invalidating a Cache Entry

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

### `Time` Constants

Constants for time units in milliseconds.

- `Time.Millisecond`
- `Time.Second`
- `Time.Minute`
- `Time.Hour`
- `Time.Day`
- `Time.Week`

Usage `5 * Time.Minute` or `10 * Time.Second`, mirrors [`go's Time durations`](https://github.com/golang/go/blob/b521ebb55a9b26c8824b219376c7f91f7cda6ec2/src/time/time.go#L930).

### TTL Store

Creates an in-memory TTL store based on `@isaacs/ttl-cache`.

```typescript
const store = createTTLStore({
  defaultTTL: 5 * Time.Minute,
})
```

### `createSqliteStore(options)`

### SQLite Store

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

### Redis Store

An [ioredis](https://github.com/redis/ioredis) based store

```typescript
import { Redis } from 'ioredis'

const redisStore = createRedisStore({
  redisClient: new Redis({
    host: 'localhost',
    port: 6379,
  }),
  defaultTTL: 5 * Time.Minute,
})
```

## Upstash Redis Store

An [Upstash](https://github.com/upstash/redis-js) Redis store

```typescript
import { Redis } from '@upstash/redis'
const redisRestStore = createUpstashRedisStore({
  redisClient: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }),
  defaultTTL: 5 * Time.Minute,
})
```

## Advanced Features

- **Automatic Revalidation**: The cache automatically revalidates stale data in the background, ensuring fresh data is available for subsequent requests.
- **Function Memoization**: Easily create cached versions of functions with automatic cache key generation based on function signature and arguments.
- **Flexible Storage**: Support for different storage backends allows for easy adaptation to various use cases and environments.

### Serverless Context

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

import { Context } from './context'
import { waitUntil } from '@vercel/functions'

class VercelFunctionsContext implements Context {
  waitUntil(p: Promise<unknown>) {
    waitUntil(p)
  }
}

createCache({
  context: new VercelFunctionsContext(),
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
class SimpleContext implements Context {
  public waitables: Promise<unknown>[] = []

  constructor() {}

  waitUntil(p: Promise<unknown>) {
    this.waitables.push(p)
  }

  async flushCache() {
    await Promise.allSettled(this.waitables)
    this.waitables = []
  }

  [Symbol.asyncDispose]() {
    return this.flushCache()
  }
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

## Build your own store

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

### Middleware

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

To bypass the cache the original function can be used or call the `.uncached()` method on the memoized function.

```ts
const memoizedFn = createCachedFunction(async (parameter) => {
  return `Result for ${parameter}`
})
await memoizedFn.uncached({ parameter }) // Bypass the cache
```

## Large cache keys

If there are large payloads in the memoized function calls, these are stored as a part of the cache key. Some middleware could be utilized if this is the case to hash the key payload and store the hash as the key instead.

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

This was inspired by the apis and code [@unkey/cache](https://www.npmjs.com/package/@unkey/cache) and [react-query](https://tanstack.com/query).

The primary difference to `@unkey/cache` is that this package is more focused on providing an even more simple api so that each function that is called doesn't need to generate it's own store itself and to allow per function based cache invalidation and configuration of stale and expiry times.

Perhaps, the `createCachedFunction` and `cacheQuery` apis could be built around a generic `@unkey/cache` and may be an update for a future implementation.

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
