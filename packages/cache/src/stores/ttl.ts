import TTLCache from '@isaacs/ttlcache'

import { CacheStore } from '@/cache'
import { getTimeInMs } from '@/time'

export function createTTLStore({
  ttlCache: ttlCacheProp,
  defaultTTL,
}: {
  ttlCache?: TTLCache<any, any>
  defaultTTL?: number | string
}): CacheStore & { entries: () => Promise<[string, any][]> } {
  const ttlCache =
    ttlCacheProp ||
    new TTLCache({
      max: 3_000_000, // default is infinity but we scale it back a bit
      ttl: getTimeInMs(defaultTTL),
    })

  return {
    name: 'ttl',
    async set(key, value, ttl) {
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
    [Symbol.asyncDispose]: async () => {
      ttlCache.clear()
    },
  }
}
