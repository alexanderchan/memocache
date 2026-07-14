---
'@alexmchan/memocache-store-sqlite': minor
---

New package `@alexmchan/memocache-store-sqlite` — a cache store backed by the Node.js standard-library `node:sqlite` module, with **zero external dependencies** (no `@libsql/client`, no native bindings to compile).

- Requires Node.js >= 24 (`node:sqlite` ships in 24 with an experimental warning, stabilized in 26)
- superjson serialization for parity with the other stores (Dates/Maps/undefined round-trip)
- Ownership-aware `dispose()` (an injected `DatabaseSync` is never closed), `unref()`'d cleanup timer, and expired-entry deletes that log rather than throw
- Behavioral drop-in for the local mode of `@alexmchan/memocache-store-libsql` — swap the import and replace the injected client with a `location` or `DatabaseSync`. See the package README for a migration guide. `store-libsql` remains for Turso / remote `libsql://` databases.
