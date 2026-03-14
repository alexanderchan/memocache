---
title: Examples
description: Common caching patterns with memocache — two-tier Redis, user data, invalidation, and more.
---

# Examples

Practical patterns you can copy and adapt.

---

## Two-tier cache: in-memory + Redis

The most common production setup. Serve the fastest possible response from process memory, fall back to Redis on a miss, and promote the value back to memory for the next request. Writes go to both stores automatically.

```ts
import { createCache, createTTLStore, Time } from '@alexmchan/memocache'
import { createRedisStore } from '@alexmchan/memocache-store-redis'
import { Redis } from 'ioredis'

const memoryStore = createTTLStore({
  defaultTTL: 1 * Time.Minute,
})

const redisStore = createRedisStore({
  redisClient: new Redis({ host: 'localhost', port: 6379 }),
  defaultTTL: 10 * Time.Minute,
})

export const cache = createCache({
  // reads check memory first, then Redis
  stores: [memoryStore, redisStore],
  defaultFresh: 30 * Time.Second,
})

const { createCachedFunction } = cache

export const getUser = createCachedFunction(async (userId: string) => {
  return db.users.findById(userId)
})
```

On a cache hit in Redis, the value is automatically promoted back into `memoryStore` so subsequent calls on the same instance don't pay the network round-trip.

---

## Two-tier cache: in-memory + Upstash (edge / serverless)

For edge runtimes (Cloudflare Workers, Vercel Edge, etc.) where `ioredis` isn't available, swap Redis for Upstash's HTTP-based client.

```ts
import { createCache, createTTLStore, Time } from '@alexmchan/memocache'
import { createUpstashRedisStore } from '@alexmchan/memocache-store-redis'
import { Redis } from '@upstash/redis'

const memoryStore = createTTLStore({ defaultTTL: 30 * Time.Second })

// reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env
const upstashStore = createUpstashRedisStore({
  redisClient: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }),
  defaultTTL: 5 * Time.Minute,
})

export const cache = createCache({
  stores: [memoryStore, upstashStore],
  defaultFresh: 15 * Time.Second,
})
```

:::note
The in-memory store is per-isolate on edge runtimes, so its effective lifetime is short. It still saves redundant Upstash calls within the same request burst.
:::

---

## Caching user and role data

User profiles and permission checks are ideal for the TTL store — small objects, read on every request, rarely changed.

```ts
import { createCache, createTTLStore, Time } from '@alexmchan/memocache'

const store = createTTLStore({ defaultTTL: 5 * Time.Minute })

export const cache = createCache({
  stores: [store],
  defaultFresh: 2 * Time.Minute,
})

const { createCachedFunction } = cache

export const getUserRoles = createCachedFunction(
  async (userId: string) => {
    return db.roles.findByUserId(userId)
  },
)

export const getPermissions = createCachedFunction(
  async (userId: string, resource: string) => {
    return db.permissions.check(userId, resource)
  },
)
```

:::caution
Always include user-scoped identifiers (`userId`, `tenantId`) in the arguments so the cache key is unique per user. Never share a cached value across users.
:::

---

## Invalidating on mutation

Call `.invalidate()` with the same arguments you used to cache to bust a specific entry.

```ts
export const getUser = createCachedFunction(async (userId: string) => {
  return db.users.findById(userId)
})

async function updateUser(userId: string, data: UserUpdate) {
  await db.users.update(userId, data)
  // bust the cache so the next read gets fresh data
  await getUser.invalidate(userId)
}
```

---

## Seeding the cache after a write

Use `setCacheData` to populate the cache immediately after a write, avoiding the next read from hitting the database.

```ts
const { createCachedFunction, setCacheData } = cache

export const getUser = createCachedFunction(async (userId: string) => {
  return db.users.findById(userId)
})

async function updateUser(userId: string, data: UserUpdate) {
  const updated = await db.users.update(userId, data)

  // write the fresh value straight into the cache
  await setCacheData({
    queryKey: getUser.getCacheKey(userId),
    value: updated,
    ttl: 5 * Time.Minute,
  })
}
```

---

## Per-call TTL override

Override the default TTL or fresh window on a per-call basis when some data ages faster than others.

```ts
const { cacheQuery } = cache

// short-lived: auction prices change every few seconds
const price = await cacheQuery({
  queryKey: ['/auction/price', { auctionId }],
  queryFn: () => fetchCurrentPrice(auctionId),
  options: { ttl: 10 * Time.Second, fresh: 5 * Time.Second },
})

// long-lived: product descriptions rarely change
const product = await cacheQuery({
  queryKey: ['/products', { productId }],
  queryFn: () => fetchProduct(productId),
  options: { ttl: 1 * Time.Hour, fresh: 10 * Time.Minute },
})
```
