import { CacheStore } from '../cache'
import { Time } from '@/time'
import { Redis } from 'ioredis'
import superjson from 'superjson'

export const createRedisStore = ({
  redisClient: redisClientProp,
  defaultTTL = 5 * Time.Minute,
}: {
  redisClient?: Redis
  defaultTTL?: number
} = {}) => {
  const redisClient = redisClientProp || new Redis()

  redisClient
    .info()
    .then((info) => {})
    .catch((err) => {
      console.error('Failed to connect to Redis:', err)
    })

  return {
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
    [Symbol.asyncDispose]: async () => {
      await redisClient.disconnect()
      await redisClient.quit()
    },
  } satisfies CacheStore
}
