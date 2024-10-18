import {
  CacheStore,
  defaultLogger,
  Logger,
  Time,
} from '@alexmchan/memocache-common'
import { Redis } from '@upstash/redis'

export const createUpstashRedisStore = ({
  redisClient: redisClientProp,
  defaultTTL = 5 * Time.Minute,
  logger = defaultLogger,
}: {
  /** Will default to new Redis.fromEnv() */
  redisClient?: Redis
  defaultTTL?: number
  logger?: Logger
} = {}) => {
  const redisClient =
    redisClientProp ||
    new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }) // same as .fromEnv but more explicit so we can see what the values are.

  redisClient
    .ping()
    .then(() => logger.log('Connected to Upstash Redis'))
    .catch((err) => {
      logger.error('Failed to connect to Upstash Redis:', err)
    })

  return {
    name: 'upstash-redis',
    async set(key, value, ttl = defaultTTL) {
      await redisClient.set(key, value, { px: ttl })
    },
    async get(key) {
      const data = await redisClient.get(key)

      return data
    },
    async delete(key) {
      return redisClient.del(key)
    },
    async dispose() {
      // Upstash Redis doesn't require explicit disconnection
    },
    [Symbol.asyncDispose]: async () => {
      // Upstash Redis doesn't require explicit disconnection
    },
  } satisfies CacheStore
}
