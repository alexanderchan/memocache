import { Time } from '@alexmchan/memocache-common'
import superjson from 'superjson'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUpstashRedisStore } from '../upstash-redis.js'

type MockStore = Map<string, unknown>

function createMockRedisClient() {
	const store: MockStore = new Map()

	return {
		ping: vi.fn().mockResolvedValue('PONG'),
		set: vi.fn(async (key: string, value: unknown) => {
			store.set(key, value)
			return 'OK'
		}),
		get: vi.fn(async (key: string) => {
			return store.has(key) ? store.get(key) : null
		}),
		del: vi.fn(async (...keys: string[]) => {
			let count = 0
			for (const key of keys) {
				if (store.delete(key)) count++
			}
			return count
		}),
		_store: store,
	}
}

describe('Upstash Redis Store', () => {
	let mockClient: ReturnType<typeof createMockRedisClient>
	let store: ReturnType<typeof createUpstashRedisStore>

	beforeEach(() => {
		mockClient = createMockRedisClient()
		store = createUpstashRedisStore({
			redisClient: mockClient as any,
			defaultTTL: 60 * Time.Second,
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it('should set and get a value', async () => {
		await store.set('key1', 'value1', 10 * Time.Second)
		const result = await store.get('key1')
		expect(result).toBe('value1')
		expect(mockClient.set).toHaveBeenCalledWith(
			'key1',
			superjson.stringify('value1'),
			{
				px: 10 * Time.Second,
			},
		)
	})

	it('should round-trip rich values through superjson (parity with ioredis store)', async () => {
		const value = { createdAt: new Date('2026-01-02T03:04:05Z'), n: 1 }
		await store.set('key-date', value, 10 * Time.Second)
		const result = await store.get('key-date')
		expect(result).toEqual(value)
		expect((result as typeof value).createdAt).toBeInstanceOf(Date)
	})

	it('should rehydrate an auto-JSON.parsed envelope (upstash client behavior)', async () => {
		const value = { createdAt: new Date('2026-01-02T03:04:05Z'), n: 1 }
		await store.set('key-env', value, 10 * Time.Second)
		// the real upstash client JSON.parses string responses before returning them
		const raw = mockClient._store.get('key-env') as string
		mockClient._store.set('key-env', JSON.parse(raw))
		const result = await store.get('key-env')
		expect(result).toEqual(value)
	})

	it('should treat pre-superjson entries as a miss', async () => {
		mockClient._store.set('old-key', { value: 'legacy', age: 123 })
		const result = await store.get('old-key')
		expect(result).toBeUndefined()
	})

	it('should delete a value', async () => {
		await store.set('key2', 'value2', 5 * Time.Second)
		await store.delete('key2')
		const result = await store.get('key2')
		expect(result).toBeUndefined()
		expect(mockClient.del).toHaveBeenCalledWith('key2')
	})

	it('should handle TTL (via px option in set)', async () => {
		const ttl = 30 * Time.Second
		await store.set('key3', 'value3', ttl)
		expect(mockClient.set).toHaveBeenCalledWith(
			'key3',
			superjson.stringify('value3'),
			{ px: ttl },
		)
	})

	it('should return undefined for non-existent keys', async () => {
		const result = await store.get('nonexistent')
		expect(result).toBeUndefined()
		expect(mockClient.get).toHaveBeenCalledWith('nonexistent')
	})

	it('should handle dispose (no-op for upstash)', async () => {
		// Upstash doesn't require explicit disconnection; dispose should not throw
		await expect(store.dispose?.()).resolves.toBeUndefined()
	})
})
