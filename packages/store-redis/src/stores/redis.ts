import {
  CacheStore,
  defaultLogger,
  Logger,
  Time,
} from '@alexmchan/memocache-common'
import { Redis } from 'ioredis'
import superjson from 'superjson'

export const createRedisStore = ({
  redisClient: redisClientProp,
  defaultTTL = 5 * Time.Minute,
  logger = defaultLogger,
}: {
  redisClient?: Redis | Promise<Redis>
  defaultTTL?: number
  logger?: Logger
} = {}) => {
  const redisClient = redisClientProp || new Redis()

  async function getRedisClient() {
    return await redisClient
  }

  // initialize connection

  async function initializeRedis() {
    const client = await getRedisClient()

    client.info().catch((err) => {
      logger.error('Failed to connect to Redis:', err)
    })

    client.on('error', (err) => {
      logger.error('Redis error:', err)
    })
  }

  // kick off an async initialization
  initializeRedis()

  return {
    name: 'ioredis',
    async set(key, value, ttl = defaultTTL) {
      const client = await getRedisClient()
      await client.set(key, superjson.stringify(value), 'PX', ttl)
    },
    async get(key) {
      const client = await getRedisClient()
      const data = await client.get(key)
      return data ? superjson.parse(data) : undefined
    },
    async delete(key) {
      const client = await getRedisClient()
      return client.del(key)
    },
    async dispose() {
      const client = await getRedisClient()
      await client.disconnect()
      await client.quit()
    },
    async [Symbol.asyncDispose]() {
      this.dispose?.()
    },
  } satisfies CacheStore
}
