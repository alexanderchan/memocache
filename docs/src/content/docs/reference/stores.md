---
title: Stores
description: Choose between in-memory, LibSQL, Redis, and Upstash Redis stores.
---

# Stores

Stores are the backing implementations used to read, write, and delete cached values. You can use a single store or layer several stores in priority order.

## TTL store

`createTTLStore()` creates an in-memory store backed by `@isaacs/ttlcache`.

```ts
import { createTTLStore, Time } from '@alexmchan/memocache'

const store = createTTLStore({
  defaultTTL: 5 * Time.Minute,
})
```

Use it for low-latency local memory caching. It is process-local and not shared across instances.

## LibSQL store

Install:

```bash
pnpm install @alexmchan/memocache-store-libsql
```

```ts
import { createCache } from '@alexmchan/memocache'
import { Time } from '@alexmchan/memocache'
import { createClient } from '@libsql/client'
import { createSqliteStore } from '@alexmchan/memocache-store-libsql'

const sqliteClient = createClient({
  url: 'file:./cache.db',
})

const sqliteStore = createSqliteStore({
  sqliteClient,
  cleanupInterval: 5 * Time.Minute,
  defaultTTL: 10 * Time.Minute,
})

const cache = createCache({
  stores: [sqliteStore],
  defaultFresh: 1 * Time.Minute,
})
```

Options:

- `sqliteClient`
- `tableName`
- `defaultTTL`
- `cleanupInterval`
- `logger`

The store creates its table lazily and runs periodic cleanup for expired rows.

## Redis store

Install:

```bash
pnpm install @alexmchan/memocache-store-redis ioredis
```

```ts
import { createRedisStore } from '@alexmchan/memocache-store-redis'
import { Redis } from 'ioredis'
import { Time } from '@alexmchan/memocache'

const redisStore = createRedisStore({
  redisClient: new Redis({
    host: 'localhost',
    port: 6379,
  }),
  defaultTTL: 5 * Time.Minute,
})
```

This store uses `ioredis`, so it is intended for Node runtimes rather than edge runtimes.

## Upstash Redis store

```ts
import { createUpstashRedisStore } from '@alexmchan/memocache-store-redis'
import { Redis } from '@upstash/redis'
import { Time } from '@alexmchan/memocache'

const redisRestStore = createUpstashRedisStore({
  redisClient: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  }),
  defaultTTL: 5 * Time.Minute,
})
```

If you omit `redisClient`, the store reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the environment.

## Multi-store ordering

When multiple stores are configured:

- reads check stores from first to last
- writes update every store
- fresh hits from lower-priority stores are promoted back into earlier stores

A common layout is:

```ts
createCache({
  stores: [memoryStore, redisStore],
})
```

That gives you fast in-process hits with a persistent fallback behind it.
