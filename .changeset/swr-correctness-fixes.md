---
'@alexmchan/memocache': patch
'@alexmchan/memocache-common': patch
'@alexmchan/memocache-store-redis': patch
'@alexmchan/memocache-store-libsql': patch
'@alexmchan/msw-testing': patch
---

SWR correctness and packaging fixes:

- `cacheQuery` no longer loses a stale hit from a higher-priority store when a lower-priority store misses — the stale value is served and revalidated in the background instead of blocking on the origin
- A store whose `get()` rejects (e.g. Redis down) is skipped with a logged error instead of failing the whole read (matches upstream unkey fix #3303)
- Background revalidation is now registered with `context.waitUntil` so edge runtimes don't kill it after the response
- Request-dedup map uses guarded deletes so an awaiting reader can no longer evict a newer in-flight promise
- Encryption middleware: the shared encrypt memoizer now compares the CryptoKey, so two stores with different keys no longer share ciphertext; undecryptable entries (key rotation, corruption) degrade to a cache miss instead of throwing
- `DefaultStatefulContext` drops settled promises instead of retaining them forever in long-running processes
- Upstash store now round-trips values through superjson for parity with the other stores (Dates/Maps survive); entries written by older versions are treated as cache misses
- Packaging: `files: ["dist"]` on all published packages, removed unused `@libsql/client` dependency from `@alexmchan/memocache` and unused `@upstash/redis` from the libsql store, workspace root marked private
