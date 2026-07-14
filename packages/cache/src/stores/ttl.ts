import type { CacheStore } from '@alexmchan/memocache-common'
import { TTLCache } from '@isaacs/ttlcache'

function isProduction() {
	return (
		typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'
	)
}

// Recursively freeze an object graph so mutations throw (in strict mode) rather
// than silently corrupting the shared cached value. Idempotent and cycle-safe.
function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
		return value
	}
	Object.freeze(value)
	for (const key of Object.keys(value as Record<string, unknown>)) {
		deepFreeze((value as Record<string, unknown>)[key])
	}
	return value
}

export function createTTLStore({
	ttlCache: ttlCacheProp,
	defaultTTL,
	cloneOnGet = false,
}: {
	ttlCache?: TTLCache<any, any>
	defaultTTL?: number
	/**
	 * Return a structured clone from `get` so callers can safely mutate the
	 * result. Off by default: the in-memory tier hands back the stored
	 * reference for speed, and cached values are expected to be treated as
	 * immutable (in development, returned values are deep-frozen so accidental
	 * mutation throws instead of silently corrupting the cache). Enable this
	 * when you need to mutate values read from the cache.
	 */
	cloneOnGet?: boolean
} = {}): CacheStore & { entries: () => Promise<[string, any][]> } {
	const ttlCache =
		ttlCacheProp ||
		new TTLCache({
			max: 3_000_000, // default is infinity but we scale it back a bit
			ttl: defaultTTL,
		})

	return {
		name: 'ttl',
		async set(key, value, ttl = defaultTTL) {
			ttlCache.set(key, value, { ttl })
		},
		async get(key) {
			const value = ttlCache.get(key)
			if (value === undefined) {
				return value
			}
			// The in-memory store returns the stored reference by default (unlike
			// serialized tiers, which return fresh copies). Guard the immutability
			// contract: clone on request, otherwise freeze in development so a
			// caller mutating the result fails loudly instead of corrupting the
			// cache for everyone.
			if (cloneOnGet) {
				return structuredClone(value)
			}
			return isProduction() ? value : deepFreeze(value)
		},
		async delete(key) {
			return ttlCache.delete(key)
		},

		async entries() {
			if (isProduction()) {
				throw new Error('For debugging, not allowed in production')
			}

			return [...ttlCache.entries()]
		},
		async clear() {
			ttlCache.clear()
		},
		async dispose() {
			ttlCache.clear()
		},
		async [Symbol.asyncDispose]() {
			this.dispose?.()
		},
	}
}
