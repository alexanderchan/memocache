---
'@alexmchan/memocache': minor
---

Stampede/failure protection (ADR-0001, phases 1–2): revalidation backoff, negative caching, and stale-if-error.

- **Revalidation backoff (default on).** When a revalidation rejects, further origin attempts for that key are skipped — the stale value keeps being served — until an exponential backoff with jitter elapses (1s doubling to a 30s cap). A failing origin is now probed at the backoff cadence instead of on every request. Configure or disable via `revalidateBackoff` (pass `false` to opt out). Backoff only applies when a stale value exists to serve: a cold miss always retries, and rejections are never cached.
- **Negative caching (`nullTTL` / `defaultNullTTL`, opt-in).** When `queryFn` resolves to `null`/`undefined`, the result is cached for the window and served as fresh for its whole life — no background revalidation churn for "not found".
- **Stale-if-error (`staleIfError` / `defaultStaleIfError`, opt-in, RFC 5861).** Entries are kept in storage for `ttl + staleIfError`; past `ttl` they are revalidated in the foreground and served only when the origin fails, so an outage degrades to stale data instead of errors. Entries now carry a write-time `staleIfErrorAt` in their envelope; entries without it (pre-existing data, direct `store.set`) keep the previous behavior, so this is backward compatible with already-cached data.

Cross-pod coordination (Redis lease / XFetch) was considered and deliberately deferred — see ADR-0001 in the docs for the comparison and the trigger condition to revisit.
