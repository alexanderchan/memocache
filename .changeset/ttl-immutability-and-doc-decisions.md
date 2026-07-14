---
'@alexmchan/memocache': patch
'@alexmchan/memocache-common': patch
'@alexmchan/memocache-store-redis': patch
---

Two audit-review follow-ups:

- **Memory store value immutability (`@alexmchan/memocache`).** The in-memory TTL store returned the stored object by reference while serialized tiers (Redis) return copies, so mutating a value read back silently corrupted the shared entry — and the behavior differed by which tier hit. Returned values are now deep-frozen in development (mutation throws loudly instead of corrupting the cache), and a new `cloneOnGet` option returns a `structuredClone` for callers that need mutable results. Production behavior/perf is unchanged by default; the immutability contract is now documented.
- **`createRedisStore` localhost warning (`@alexmchan/memocache-store-redis`).** Constructing the store without a `redisClient` still defaults to ioredis's `localhost:6379`, but now logs a warning so a silent misconnection in production is visible.
- **`hashKey` `undefined`/`null` edge documented (`@alexmchan/memocache-common`).** `JSON.stringify` collapses `undefined` to `null`, so `['x', undefined]` and `['x', null]` share a key — now called out in JSDoc and the reference docs.
