---
'@alexmchan/memocache': patch
---

Guardrails for two easy-to-miss misconfigurations (audit findings):

- **`fresh` > `ttl` now warns.** Configuring a freshness window longer than the TTL silently disables stale-while-revalidate (entries expire before they can be served stale). `createCache` validates the defaults up front and each query validates its effective values, warning once per distinct `fresh`/`ttl` pairing.
- **`createCachedFunction` warns in development when no explicit `cachePrefix` is given.** The derived-from-`fn.toString()` key collides across closures from the same factory (a wrong-data bug) and rotates the keyspace under bundler minification. The warning, JSDoc, and docs now spell out the hazard and recommend an explicit `cachePrefix`.
- Removed a divergent hardcoded 5-minute TTL default inside `revalidateInBackground` — the resolved TTL is now always passed in, so it can't drift from the cache's `defaultTTL`.
