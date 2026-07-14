## SQLite Store for Memocache

A cache store backed by Node.js's standard-library [`node:sqlite`](https://nodejs.org/api/sqlite.html) module for [@alexmchan/memocache](https://github.com/alexmchan/memocache). **Zero external dependencies** — no native bindings to compile.

> Migrating from `@alexmchan/memocache-store-libsql`? See [Migration](#migration-from-store-libsql) below.

## Requirements

- **Node.js >= 24.** `node:sqlite` ships in Node 24 (still marked experimental — importing it emits an `ExperimentalWarning`) and is stabilized in Node 26. Bun exposes `node:sqlite` compatibility as well.

## Installation

```bash
pnpm install @alexmchan/memocache-store-sqlite
```

## Usage

```typescript
import { createCache } from '@alexmchan/memocache'
import { Time } from '@alexmchan/memocache-common'
import { createSqliteStore } from '@alexmchan/memocache-store-sqlite'

// Open an in-memory database (default), or pass a file path to persist:
const sqliteStore = createSqliteStore({
  location: ':memory:', // or './cache.db'
  cleanupInterval: 5 * Time.Minute,
  defaultTTL: 10 * Time.Minute,
})

const cache = createCache({
  stores: [sqliteStore],
  defaultFresh: 1 * Time.Minute,
  defaultTTL: 5 * Time.Minute,
})

const { createCachedFunction } = cache

const cachedFunction = createCachedFunction(
  async (id: string) => `Result for ${id}`,
  { cachePrefix: '/results/by-id' },
)

const result = await cachedFunction('example')
```

You can also bring your own `DatabaseSync` instance:

```typescript
import { DatabaseSync } from 'node:sqlite'

const database = new DatabaseSync('./cache.db')
const sqliteStore = createSqliteStore({ database })
// An injected database is caller-owned: it is NOT closed when the store is disposed.
```

## Configuration Options

- `database`: an existing `node:sqlite` `DatabaseSync` instance. If provided it is caller-owned and not closed on dispose.
- `location`: path used to open a database when `database` is not provided. Defaults to `':memory:'`.
- `tableName`: name of the table to create. Defaults to `cache`.
- `defaultTTL`: default time-to-live for cache entries in milliseconds. Defaults to 5 minutes.
- `cleanupInterval`: interval in milliseconds for cleaning up expired entries. Defaults to 5 minutes.
- `logger`: custom logger implementation. Defaults to the common logger.

## Migration from `store-libsql`

This package replaces `@alexmchan/memocache-store-libsql`, dropping the `@libsql/client` dependency in favor of the standard library.

1. Swap the dependency and import:
   ```diff
   - import { createSqliteStore } from '@alexmchan/memocache-store-libsql'
   + import { createSqliteStore } from '@alexmchan/memocache-store-sqlite'
   ```
2. Replace the injected client with a `location` (or a `DatabaseSync`):
   ```diff
   - import { createClient } from '@libsql/client'
   - const sqliteClient = createClient({ url: 'file::memory:' })
   - const store = createSqliteStore({ sqliteClient })
   + const store = createSqliteStore({ location: ':memory:' })
   ```
3. **Local databases only.** Turso / remote `libsql://` URLs are not supported by `node:sqlite`. If you relied on a remote database, keep using `store-libsql` or point a different tier (e.g. Redis) at your remote store.

## Features

- Zero runtime dependencies (standard-library SQLite)
- Persistent (file) or in-memory storage
- superjson serialization — `Date`, `Map`, `undefined` round-trip intact
- Automatic cleanup of expired entries (timer does not keep the process alive)
- Per-entry TTL overrides

## License

See the main project license for details.
