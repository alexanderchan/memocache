---
title: Stores
description: Choose between in-memory, SQLite, Redis, and Upstash Redis stores.
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

## SQLite store

Backed by Node.js's standard-library [`node:sqlite`](https://nodejs.org/api/sqlite.html) module — **no external dependencies, no native bindings to compile.** Requires **Node.js >= 24** (the module ships in 24 with an experimental warning and is stabilized in 26).

Install:

```bash
pnpm install @alexmchan/memocache-store-sqlite
```

```ts
import { createCache } from '@alexmchan/memocache'
import { Time } from '@alexmchan/memocache'
import { createSqliteStore } from '@alexmchan/memocache-store-sqlite'

const sqliteStore = createSqliteStore({
  location: './cache.db', // or ':memory:' (default)
  cleanupInterval: 5 * Time.Minute,
  defaultTTL: 10 * Time.Minute,
})

const cache = createCache({
  stores: [sqliteStore],
  defaultFresh: 1 * Time.Minute,
})
```

Options:

- `database` — an existing `node:sqlite` `DatabaseSync` instance (caller-owned; not closed on dispose)
- `location` — path used to open a database when `database` is omitted; defaults to `':memory:'`
- `tableName`
- `defaultTTL`
- `cleanupInterval`
- `logger`

For local and file-backed SQLite this is the store to reach for. For a remote SQLite database, put a network store (such as Redis) in front of your remote data instead — memocache no longer ships a Turso/`libsql://` store.

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
