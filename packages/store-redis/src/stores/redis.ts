import {
	type CacheStore,
	defaultLogger,
	type Logger,
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
	// track whether we created the client ourselves; injected clients are owned
	// by the caller and must not be quit() on dispose
	const ownsClient = !redisClientProp
	if (ownsClient) {
		// ioredis defaults to localhost:6379 — cheap to construct but a silent
		// misconnection in production. Warn so an unconfigured client is visible.
		logger.warn(
			'[memocache] createRedisStore called without a redisClient; defaulting to a new ioredis connection on localhost:6379. Pass an explicit redisClient in production.',
		)
	}
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
	initializeRedis().catch((err) => {
		logger.error('Failed to initialize Redis:', err)
	})

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
			// only close connections we opened ourselves; injected clients are
			// shared with the caller and must stay alive
			if (!ownsClient) {
				return
			}
			const client = await getRedisClient()
			await client.quit()
		},
		async [Symbol.asyncDispose]() {
			await this.dispose?.()
		},
	} satisfies CacheStore
}
