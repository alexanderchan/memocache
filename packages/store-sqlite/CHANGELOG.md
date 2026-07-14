# @alexmchan/memocache-store-sqlite

## 2.0.0

### Major Changes

- 5a18615: Remove libsql in favor of node:sql

### Minor Changes

- 8ee7d3d: New package `@alexmchan/memocache-store-sqlite` — a cache store backed by the Node.js standard-library `node:sqlite` module, with **zero external dependencies** (no `@libsql/client`, no native bindings to compile).
  - Requires Node.js >= 24 (`node:sqlite` ships in 24 with an experimental warning, stabilized in 26)
  - superjson serialization for parity with the other stores (Dates/Maps/undefined round-trip)
  - Ownership-aware `dispose()` (an injected `DatabaseSync` is never closed), `unref()`'d cleanup timer, and expired-entry deletes that log rather than throw
  - Behavioral drop-in for the local mode of the removed `@alexmchan/memocache-store-libsql` — swap the import and replace the injected client with a `location` or `DatabaseSync`. See the package README for a migration guide.

### Patch Changes

- Updated dependencies [5a18615]
- Updated dependencies [1e3a54a]
- Updated dependencies [e7dc3cb]
- Updated dependencies [e94b1bd]
  - @alexmchan/memocache-common@2.0.0
