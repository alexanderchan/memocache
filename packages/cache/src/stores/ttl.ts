import { CacheStore } from '@alexmchan/memocache-common'
import TTLCache from '@isaacs/ttlcache'

export function createTTLStore({
  ttlCache: ttlCacheProp,
  defaultTTL,
}: {
  ttlCache?: TTLCache<any, any>
  defaultTTL?: number
}): CacheStore & { entries: () => Promise<[string, any][]> } {
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
      return ttlCache.get(key)
    },
    async delete(key) {
      return ttlCache.delete(key)
    },

    async entries() {
      if (process.env.NODE_ENV === 'production') {
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
