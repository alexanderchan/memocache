---
title: "ADR-0001: Revalidation stampede protection"
description: Options compared and decisions made for negative caching, failure backoff, stale-if-error, and cross-pod coordination.
---

# ADR-0001: Revalidation stampede protection

**Status:** Accepted (2026-07-14) · Phases 1–2 implemented, Phase 3 deferred with a written trigger condition.

## Context

The revalidation/origin stampede was a known worry with three intertwined questions:

1. A failing origin was retried on every stale request (no backoff), and once the entry's TTL expired the miss path retried on every call.
2. In-process single-flight deduplicates concurrent origin calls **per process**, but N pods still make N calls when a hot key goes stale everywhere at once.
3. `ttl` was both "how long the value may be served" and "how long storage keeps it," so an origin outage longer than `ttl` had no stale fallback at all.

A key observation bounds the problem: because each process already coalesces concurrent misses and revalidations (the `revalidating` map), **worst-case concurrent origin calls per key ≈ process count, not request rate**. 1,000 req/s across 10 pods on an expired key is at most 10 concurrent `queryFn` calls, once per fresh window.

## Options considered

### Failure handling (the real, current problem)

- **Per-key revalidation backoff** — on failure, skip further attempts for that key until an exponential backoff with jitter elapses; keep serving stale. Chosen, default on: it only changes behavior when the origin is already failing, where the old behavior (retry on every request) was pathological.
- **Negative caching (`nullTTL`)** — "not found" is an *answer* and cacheable; an exception is not. Chosen, opt-in: whether `null` is safe to cache is domain knowledge.
- **Stale-if-error (RFC 5861)** — keep entries in storage past `ttl` and serve them only when revalidation fails. Chosen, opt-in (`staleIfError`, default `0`).
- **Error caching (cache the rejection itself)** — rejected: it converts transient failures into served failures. Rejections are never cached; the miss path always retries.
- **Per-prefix circuit breaker** — rejected as over-engineering; per-key backoff captures ~90% of the value with far less machinery.

### Cross-pod coordination (deferred — Phase 3)

- **Do nothing (per-pod single-flight only)** — origin sees at most `pod_count` concurrent calls per key. This is what Unkey's cache ships. **Chosen for now**: we have no multi-pod deployment where this bound is a problem.
- **Redis lease (`SET key NX PX`)** — caps origin concurrency at 1, but brings distributed-lock complexity (lease TTL vs slow origins, crashed holders, cold-miss losers with nothing stale to serve) and couples the core to a store capability.
- **XFetch probabilistic early expiration** (Vattani et al., VLDB 2015) — coordination-free smoothing for hot keys; ineffective for low-QPS keys and cold misses.

**Trigger to revisit:** a rate-limited or per-call-billed origin, pod count high enough that `pods × 1 call per fresh window` visibly spikes the origin, or a measured origin spike aligned with key expiry. If triggered, the design is a `RevalidationCoordinator` port (`tryAcquire(key, ttl)`) with a local no-op default and a Redis lease adapter in `store-redis`, so the core stays dependency-free.

### Synchronized expiry

TTL jitter (±10% on storage expiry) desynchronizes mass expiry after bulk warms. **Not implemented** — it observably changes entry lifetimes, and no bulk-warm workload exists yet. If a deploy-time warm pattern appears, add an opt-in `ttlJitter` fraction at write time.

## Decision (what shipped)

Entry envelope gained a write-time `staleIfErrorAt` timestamp. Entries without it (older writers, direct `store.set`) keep legacy behavior — any hit is servable stale — so existing cached data and callers see zero behavior change.

```text
Timeline: [0 --- fresh --- ttl --- ttl + staleIfError --- gone]
  [0, fresh]              serve fresh
  [fresh, ttl]            serve stale + background revalidate (skipped while backing off)
  [ttl, ttl+staleIfError] foreground revalidate; serve stale ONLY on failure
```

| Dial | Default | Rationale |
| --- | --- | --- |
| `revalidateBackoff` | **on** (1s → 30s cap, equal jitter) | only affects a failing origin, where old behavior was a retry storm |
| `staleIfError` / `defaultStaleIfError` | `0` (off) | serving past-ttl data is a caller decision |
| `nullTTL` / `defaultNullTTL` | unset | cacheability of "not found" is domain knowledge |
| cross-pod coordination | none (per-pod single-flight) | worst case already bounded by pod count; see trigger above |

Backoff state is per-process and in-memory (capped at 10k keys, oldest evicted) — deliberately not shared across pods, since each pod discovering the outage independently costs at most one extra call per pod.

## Consequences

- An origin outage now degrades gracefully (stale within `staleIfError`) instead of storming, and a failing origin is probed at the backoff cadence instead of per-request.
- The stale-if-error boundary is fixed at write time: changing `ttl` at read time does not move `staleIfErrorAt` for already-written entries.
- Phase 3 (cross-pod lease/XFetch) is intentionally unbuilt; its trigger condition is written above so the decision is revisited on evidence, not anxiety.
