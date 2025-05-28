## LibSQL Store for Memocache

This package provides a LibSQL store implementation for the [@alexmchan/memocache](https://github.com/alexmchan/memocache) caching library. It allows you to use [LibSQL](https://github.com/libsql/libsql) (Turso) as a persistent storage backend for your cache.

## Installation

```bash
pnpm install @alexmchan/memocache-store-libsql
```

## Usage

```typescript
import { createCache } from '@alexmchan/memocache'
import { Time } from '@alexmchan/memocache-common'
import { createClient } from '@libsql/client'
import { createSqliteStore } from '@alexmchan/memocache-store-libsql'

// Create a LibSQL client
const sqliteClient = createClient({
  url: 'file::memory:', // In-memory database
  // Or use a file-based database:
  // url: 'file:./cache.db',
  // Or use Turso:
  // url: 'https://your-database.turso.io',
  // authToken: 'your-auth-token'
})

// Create a SQLite store
const sqliteStore = createSqliteStore({
  sqliteClient,
  cleanupInterval: 5 * Time.Minute,
  defaultTTL: 10 * Time.Minute,
})

// Create a cache with the SQLite store
const cache = createCache({
  stores: [sqliteStore],
  defaultFresh: 1 * Time.Minute,
  defaultTTL: 5 * Time.Minute,
})

// Use the cache
const { createCachedFunction } = cache

// Create a cached version of a function
const cachedFunction = createCachedFunction(async (id) => {
  // Some expensive operation or fetch
  return `Result for ${id}`
})

// Use the cached function
const result = await cachedFunction('example')
```

## Configuration Options

The `createSqliteStore` function accepts the following options:

- `sqliteClient`: An instance of `@libsql/client`. If not provided, an in-memory database will be created.
- `tableName`: Name of the table to create. Defaults to `cache`.
- `defaultTTL`: Default time-to-live for cache entries in milliseconds. Defaults to 5 minutes.
- `cleanupInterval`: Interval in milliseconds for cleaning up expired entries. Defaults to 5 minutes.
- `logger`: Custom logger implementation. Defaults to the common logger.

## Features

- Persistent storage for cache entries
- Automatic cleanup of expired entries
- Support for custom TTL per cache entry
- Works with both in-memory and file-based SQLite databases
- Compatible with Turso's distributed SQLite service

## License

See the main project license for details.
