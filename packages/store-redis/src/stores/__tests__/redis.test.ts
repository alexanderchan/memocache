import { type CacheStore, hashKey, Time } from '@alexmchan/memocache-common'
import { Redis } from 'ioredis'
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest'

import { createRedisStore } from '../redis.js'

describe('Redis Cache', () => {
	let store: CacheStore
	let redisClient: Redis
	beforeAll(async () => {
		redisClient = new Redis({ host: 'localhost', port: 6379 })
	})
	beforeEach(() => {
		store = createRedisStore({
			defaultTTL: 60 * Time.Second,
			redisClient,
		})
	})

	afterEach(async () => {
		// Clean up test keys
		await (redisClient as Redis).flushdb()
	})

	afterAll(async () => {
		await store?.dispose?.()
	})

	it('should set and get a value', async () => {
		await store.set('key1', 'value1', 10 * Time.Second)
		const result = await store.get('key1')
		expect(result).toBe('value1')
	})

	it('should respect the default TTL', async () => {
		await store.set('key2', 'value2', 0.3 * Time.Second)
		let result = await store.get('key2')
		expect(result).toBe('value2')

		await vi.waitFor(async () => {
			result = await store.get('key2')

			if (result !== undefined) {
				throw new Error('Value should have expired')
			}
		})

		expect(result).toBeUndefined()
	})

	it('should respect custom TTL', async () => {
		await store.set('key3', 'value3', 10 * Time.Second) // 2 seconds TTL

		const result = await store.get('key3')
		expect(result).toBe('value3')
	})

	it('should delete a value', async () => {
		await store.set('key4', 'value4', 5 * Time.Second)
		await store.delete('key4')
		const result = await store.get('key4')
		expect(result).toBeUndefined()
	})

	it('should clear all values', async () => {
		await store.set('key5', 'value5', 5 * Time.Second)
		await store.set('key6', 'value6', 5 * Time.Second)

		await store.delete('key5')
		await store.delete('key6')

		const result1 = await store.get('key5')
		const result2 = await store.get('key6')
		expect(result1).toBeUndefined()
		expect(result2).toBeUndefined()
	})

	it('should handle multiple sets and gets', async () => {
		await store.set('key7', 'value7')
		await store.set('key8', 'value8')

		const result1 = await store.get('key7')
		const result2 = await store.get('key8')

		expect(result1).toBe('value7')
		expect(result2).toBe('value8')
	})

	it('should update value and reset TTL on re-set', async () => {
		await store.set('key9', 'value9')

		await store.set('key9', 'updated9')

		const result = await store.get('key9')
		expect(result).toBe('updated9')
	})

	it('should handle non-string keys', async () => {
		const objKey = { id: 1 }
		await store.set(hashKey(['example', objKey]), 'objectValue')
		const result = await store.get(hashKey(['example', objKey]))
		expect(result).toBe('objectValue')
	})

	it('should handle undefined and null values', async () => {
		await store.set('undefinedKey', undefined)
		await store.set('nullKey', null)

		const undefinedResult = await store.get('undefinedKey')
		const nullResult = await store.get('nullKey')

		expect(undefinedResult).toBeUndefined()
		expect(nullResult).toBeNull()
	})
})

function createFakeLogger() {
	return {
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}
}

function createFakeRedisClient() {
	return {
		info: vi.fn().mockResolvedValue(''),
		on: vi.fn().mockReturnThis(),
		quit: vi.fn().mockResolvedValue('OK'),
		set: vi.fn().mockResolvedValue('OK'),
		get: vi.fn().mockResolvedValue(null),
		del: vi.fn().mockResolvedValue(0),
	}
}

describe('Redis Cache lifecycle', () => {
	it('logs an error and causes no unhandled rejection when an injected client promise rejects', async () => {
		const logger = createFakeLogger()
		const unhandled: unknown[] = []
		const onUnhandled = (reason: unknown) => unhandled.push(reason)
		process.on('unhandledRejection', onUnhandled)

		try {
			const rejection = new Error('injected client failed to connect')
			createRedisStore({
				redisClient: Promise.reject(rejection) as any,
				logger,
			})

			await vi.waitFor(() => {
				expect(logger.error).toHaveBeenCalledWith(
					'Failed to initialize Redis:',
					rejection,
				)
			})

			// let any late microtask surface as an unhandled rejection
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(unhandled).toEqual([])
		} finally {
			process.off('unhandledRejection', onUnhandled)
		}
	})

	it('warns when constructed without an explicit client (silent localhost default)', async () => {
		const logger = createFakeLogger()
		const quitSpy = vi.spyOn(Redis.prototype, 'quit')
		try {
			const store = createRedisStore({ logger })
			expect(logger.warn).toHaveBeenCalledTimes(1)
			expect(logger.warn.mock.calls[0][0]).toContain('localhost:6379')
			await store.dispose?.()
		} finally {
			quitSpy.mockRestore()
		}
	})

	it('does not warn about the localhost default when a client is injected', () => {
		const logger = createFakeLogger()
		createRedisStore({ redisClient: createFakeRedisClient() as any, logger })
		expect(logger.warn).not.toHaveBeenCalled()
	})

	it('does not quit an injected client on dispose', async () => {
		const client = createFakeRedisClient()
		const store = createRedisStore({ redisClient: client as any })

		await store.dispose?.()

		expect(client.quit).not.toHaveBeenCalled()
	})

	it('quits a client it created itself on dispose', async () => {
		const quitSpy = vi.spyOn(Redis.prototype, 'quit')

		try {
			const store = createRedisStore({})
			await store.dispose?.()

			expect(quitSpy).toHaveBeenCalledTimes(1)
		} finally {
			quitSpy.mockRestore()
		}
	})
})
