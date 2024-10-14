import { Redis } from 'ioredis'
import superjson from 'superjson'

import { defaultLogger, Logger } from '@/logger'
import { Time } from '@/time'

import { CacheStore } from '../cache'

export const createRedisStore = ({
  redisClient: redisClientProp,
  defaultTTL = 5 * Time.Minute,
  logger = defaultLogger,
}: {
  redisClient?: Redis
  defaultTTL?: number
  logger?: Logger
} = {}) => {
  const redisClient = redisClientProp || new Redis()

  redisClient.info().catch((err) => {
    logger.error('Failed to connect to Redis:', err)
  })

  return {
    name: 'ioredis',
    async set(key, value, ttl = defaultTTL) {
      await redisClient.set(key, superjson.stringify(value), 'PX', ttl)
    },
    async get(key) {
      const data = await redisClient.get(key)
      return data ? superjson.parse(data) : undefined
    },
    async delete(key) {
      return redisClient.del(key)
    },
    async dispose() {
      await redisClient.disconnect()
      await redisClient.quit()
    },
    async [Symbol.asyncDispose]() {
      this.dispose?.()
    },
  } satisfies CacheStore
}
