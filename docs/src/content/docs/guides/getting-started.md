---
title: Getting Started
description: Install memocache and add a first in-memory cache in a few lines.
---

# Getting started

`memocache` wraps async work in a stale-while-revalidate cache with minimal setup. Start with the built-in in-memory TTL store, then add persistent stores later if you need them.

## Installation

```bash
pnpm install @alexmchan/memocache
```

## First cache

```ts
import { createCache, createTTLStore, Time } from '@alexmchan/memocache'

const store = createTTLStore({
  defaultTTL: 5 * Time.Minute,
})

export const cache = createCache({
  defaultFresh: 30 * Time.Second,
  stores: [store],
})

const { createCachedFunction } = cache

async function fetchSomething(arg: string) {
  return `Result for ${arg}`
}

export const cachedFetchSomething = createCachedFunction(fetchSomething)
```

```ts
console.log(await cachedFetchSomething('example')) // fetchSomething runs
console.log(await cachedFetchSomething('example')) // cached value is returned
```

## When to use the TTL store

The default store is an in-memory TTL cache. It is the simplest option:

- no external services
- zero network latency
- good fit for local development, single-node services, and hot-path request data

The TTL store caps at `3_000_000` entries by count, not by byte size. It works best for small values like profiles, permissions, or lookup results. Large payloads should use a lower cap or a persistent store.

## Next

- Read [How It Works](/concepts/how-it-works/) for the read/revalidate lifecycle.
- Read [Stores](/reference/stores/) if you need Redis or LibSQL.
- Read [API Reference](/reference/api/) for `cacheQuery`, invalidation, and manual writes.
