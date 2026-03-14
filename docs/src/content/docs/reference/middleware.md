---
title: Middleware
description: Wrap stores with encryption or metrics without changing your cache code.
---

# Middleware

Middleware wraps a store and returns another store that implements the same interface. This lets you add behavior like encryption or metrics without changing cache call sites.

## Encryption middleware

`createEncryptedStore()` encrypts values before they are written and decrypts them on reads.

```ts
import {
  createCache,
  createEncryptedStore,
  createTTLStore,
  Time,
} from '@alexmchan/memocache'

const ttlStore = createTTLStore({ defaultTTL: 60 * Time.Second })

const encryptedStore = createEncryptedStore({
  key: 'this is secret sauce',
  salt: 'this is salty',
  store: ttlStore,
})

export const cache = createCache({
  stores: [encryptedStore],
})
```

Notes:

- `key` must be at least 8 characters
- changing `key` or `salt` changes the derived storage key and effectively invalidates old entries
- encryption uses the Web Crypto API, so runtime support matters

## Metrics middleware

`createMetricsStore()` logs read, write, delete, and miss timings for a store.

```ts
import {
  createMetricsStore,
  createTTLStore,
  Time,
} from '@alexmchan/memocache'

const ttlStore = createTTLStore({ defaultTTL: 60 * Time.Second })

const metricsStore = createMetricsStore({
  store: ttlStore,
})
```

The emitted metrics include:

- `cache.read`
- `cache.miss`
- `cache.write`
- `cache.delete`

Each metric includes the key, store name, and measured latency.

## Composition

Because middleware returns a store, you can layer it:

```ts
const store = createMetricsStore({
  store: createEncryptedStore({
    key: process.env.CACHE_KEY!,
    salt: process.env.CACHE_SALT!,
    store: createTTLStore({ defaultTTL: 5 * Time.Minute }),
  }),
})
```
