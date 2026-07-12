import {
	type CacheStore,
	defaultLogger,
	type Logger,
	Time,
} from '@alexmchan/memocache-common'
import { Redis } from '@upstash/redis'
import superjson from 'superjson'

export const createUpstashRedisStore = ({
	redisClient: redisClientProp,
	defaultTTL = 5 * Time.Minute,
	logger = defaultLogger,
	verifyConnection = false,
}: {
	/** Will default to new Redis.fromEnv() */
	redisClient?: Redis
	defaultTTL?: number
	logger?: Logger
	/**
	 * Ping the Upstash REST API on construction to verify connectivity.
	 * Off by default so serverless cold starts don't incur an extra paid
	 * request per store instance.
	 */
	verifyConnection?: boolean
} = {}) => {
	const redisClient =
		redisClientProp ||
		new Redis({
			url: process.env.UPSTASH_REDIS_REST_URL,
			token: process.env.UPSTASH_REDIS_REST_TOKEN,
		}) // same as .fromEnv but more explicit so we can see what the values are.

	if (verifyConnection) {
		redisClient
			.ping()
			.then(() => logger.log('Connected to Upstash Redis'))
			.catch((err) => {
				logger.error('Failed to connect to Upstash Redis:', err)
			})
	}

	return {
		name: 'upstash-redis',
		async set(key, value, ttl = defaultTTL) {
			// superjson round-trip for parity with the other stores (Dates/Maps/undefined survive)
			await redisClient.set(key, superjson.stringify(value), { px: ttl })
		},
		async get(key) {
			const data = await redisClient.get(key)
			if (data === null || data === undefined) {
				return undefined
			}

			try {
				if (typeof data === 'string') {
					return superjson.parse(data)
				}
				// the upstash client auto-JSON.parses responses; rehydrate the envelope
				if (typeof data === 'object' && 'json' in data) {
					return superjson.deserialize(data as any)
				}
				// pre-superjson entry from an older version: treat as a miss
				return undefined
			} catch {
				return undefined
			}
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
