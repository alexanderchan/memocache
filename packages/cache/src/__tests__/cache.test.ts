import {
	DefaultStatefulContext,
	hashKey,
	Time,
} from '@alexmchan/memocache-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCache } from '@/cache'
import { createTTLStore } from '@/stores/ttl'

describe('cacheQuery', () => {
	let cache: ReturnType<typeof createCache>
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		cache = createCache({ stores: [store] })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should allow for a fast setup', async () => {
		const ttlStore = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const { createCachedFunction, cacheQuery } = createCache({
			stores: [ttlStore],
		})

		// As a memoized function
		const exampleFn = vi.fn().mockResolvedValue('test')
		const memoizedFn = createCachedFunction(exampleFn)
		await memoizedFn() // First call
		await memoizedFn() // Second call
		expect(exampleFn).toHaveBeenCalledTimes(1)

		// As a cache query for finer control of the cache keys

		const getFn = vi.fn().mockResolvedValue('test')

		function doGetWork({ customerId }: { customerId: string }) {
			// similar api to react-query
			return cacheQuery({
				queryFn: () => getFn({ customerId }),
				queryKey: ['/example/queryKey', { customerId }],
				options: { ttl: 5 * Time.Minute },
			})
		}

		await doGetWork({ customerId: 'test' })
		expect(getFn).toHaveBeenCalledTimes(1)
		await doGetWork({ customerId: 'test' })
		expect(getFn).toHaveBeenCalledTimes(1)
	})

	it('should return fresh data from cache if available', async () => {
		const queryFn = vi.fn().mockResolvedValue('fresh data')
		const queryKey = ['test']

		// Set data in cache
		await store.set(hashKey(queryKey), {
			value: 'cached data',
			age: Date.now(),
		})

		const result = await cache.cacheQuery({ queryFn, queryKey })

		expect(result).toBe('cached data')
		expect(queryFn).not.toHaveBeenCalled()
	})

	it('should fetch new data if cache is empty', async () => {
		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['test']

		const result = await cache.cacheQuery({ queryFn, queryKey })

		expect(result).toBe('new data')
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('should return stale data and revalidate in background if TTL exceeded', async () => {
		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['test']
		const ttl = 1 * Time.Minute

		// Set stale data in cache
		await store.set(hashKey(queryKey), {
			value: 'stale data',
			age: Date.now() - 1 * Time.Hour,
		})

		const result = await cache.cacheQuery({
			queryFn,
			queryKey,
			options: { ttl },
		})

		expect(result).toBe('stale data')
		expect(queryFn).toHaveBeenCalledTimes(1)

		// Wait for background revalidation
		await new Promise((resolve) => setTimeout(resolve, 10))

		const updatedResult = await store.get(hashKey(queryKey))
		expect(updatedResult?.value).toBe('new data')
	})

	it('should handle multiple stores', async () => {
		const store1 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const store2 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const multiCache = createCache({ stores: [store1, store2] })

		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['test']

		await multiCache.cacheQuery({ queryFn, queryKey })

		const result1 = await store1.get(hashKey(queryKey))
		const result2 = await store2.get(hashKey(queryKey))

		expect(result1?.value).toBe('new data')
		expect(result2?.value).toBe('new data')
	})

	it('should backfill higher priority stores when a lower priority store has a fresh hit', async () => {
		const store1 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const store2 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const context = new DefaultStatefulContext()
		const multiCache = createCache({ stores: [store1, store2], context })

		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['test-backfill']
		const key = hashKey(queryKey)

		await store2.set(key, {
			value: 'cached data',
			age: Date.now(),
		})

		const result = await multiCache.cacheQuery({ queryFn, queryKey })
		await context.flush()

		expect(result).toBe('cached data')
		expect(queryFn).not.toHaveBeenCalled()
		expect((await store1.get(key))?.value).toBe('cached data')
	})

	it('should not backfill stale lower priority hits before revalidation completes', async () => {
		const store1 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const store2 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const multiCache = createCache({ stores: [store1, store2] })

		const queryFn = vi.fn().mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20))
			return 'fresh data'
		})
		const queryKey = ['test-stale-backfill']
		const key = hashKey(queryKey)

		await store2.set(key, {
			value: 'stale data',
			age: Date.now() - 1 * Time.Hour,
		})

		const result = await multiCache.cacheQuery({ queryFn, queryKey })

		expect(result).toBe('stale data')
		expect(await store1.get(key)).toBeUndefined()

		await new Promise((resolve) => setTimeout(resolve, 40))

		expect((await store1.get(key))?.value).toBe('fresh data')
	})

	it('should respect custom TTL', async () => {
		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['test']
		const ttl = 100 // 100ms

		await cache.cacheQuery({ queryFn, queryKey, options: { ttl } })

		// Data should be fresh
		let result = await store.get(hashKey(queryKey))
		expect(result?.value).toBe('new data')

		// Wait for TTL to expire
		await new Promise((resolve) => setTimeout(resolve, 150))

		// Data should be gone or stale
		result = await store.get(hashKey(queryKey))
		expect(result).toBeUndefined()
	})

	it('should memoize functions', async () => {
		const workFunction = vi.fn().mockResolvedValue('test')
		const memoizedFn = cache.createCachedFunction(workFunction)

		let count = 0
		const countFunction = vi.fn(({ message }) => {
			count++
			return `Hello, ${message}, ${count}!`
		})

		const memoizedCountFn = cache.createCachedFunction(countFunction)

		const firstCallResult = await memoizedFn()
		expect(workFunction).toHaveBeenCalledTimes(1)
		expect(firstCallResult).toBe('test')

		await memoizedFn()
		await memoizedFn()
		await memoizedFn()

		expect(workFunction).toHaveBeenCalledTimes(1)

		await memoizedFn({ example: 'true' })
		expect(workFunction).toHaveBeenCalledTimes(2)
		await memoizedFn({ example: 'true' })
		expect(workFunction).toHaveBeenCalledTimes(2)

		await memoizedFn({ example: 'true', other: 'false' })
		expect(workFunction).toHaveBeenCalledTimes(3)

		memoizedCountFn.invalidate({ message: 'world' })

		expect(countFunction).toHaveBeenCalledTimes(0)
		const firstCountResult = await memoizedCountFn({ message: 'world' })
		expect(workFunction).toHaveBeenCalledTimes(3)
		expect(countFunction).toHaveBeenCalledTimes(1)

		expect(firstCountResult).toBe('Hello, world, 1!')
		const secondCountResult = await memoizedCountFn({ message: 'world' })
		expect(secondCountResult).toBe('Hello, world, 1!')
		expect(countFunction).toHaveBeenCalledTimes(1)
	})

	it('should invalidate the memoized cache', async () => {
		const workFunction = vi.fn().mockResolvedValue('test')
		const memoizedFn = cache.createCachedFunction(workFunction)

		const firstCallResult = await memoizedFn({ example: true })
		expect(workFunction).toHaveBeenCalledTimes(1)
		expect(firstCallResult).toBe('test')

		await memoizedFn.invalidate({ example: true })
		await memoizedFn({ example: true })
		expect(workFunction).toHaveBeenCalledTimes(2)
		await memoizedFn({ example: true })
		expect(workFunction).toHaveBeenCalledTimes(2)
	})

	it('should allow memoized passthrough', async () => {
		const workFunction = vi.fn().mockResolvedValue('test')
		const memoizedFn = cache.createCachedFunction(workFunction)
		const sameCachedFn = cache.createCachedFunction(workFunction)
		const differentCachedFn = cache.createCachedFunction(() => 'different')

		// identical hashes
		expect(await memoizedFn.getCachePrefix()).toBe(
			await sameCachedFn.getCachePrefix(),
		)

		// different hashes
		expect(await memoizedFn.getCachePrefix()).not.toBe(
			await differentCachedFn.getCachePrefix(),
		)

		// a constant function returns the same hash prefix
		// so this will be the same between runs
		// but any small difference will invalidate the cache
		expect(await differentCachedFn.getCachePrefix()).toMatchInlineSnapshot(
			`"/6f80c34d72bd3ff791b7798bacdcf1caab6c332399ffed522a774d78b59ac3bf"`,
		)

		function exampleFunction() {
			return null
		}

		const cachedExampleFunction = cache.createCachedFunction(exampleFunction)

		const cachedPrefix = await cachedExampleFunction.getCachePrefix()

		expect(cachedPrefix).toContain('exampleFunction')

		expect(cachedPrefix).toMatchInlineSnapshot(
			`"exampleFunction/77ec439eee577e52934f944b4362db068b173d7beac1b473b9b877025486296e"`,
		)

		const firstCallResult = await memoizedFn()
		expect(workFunction).toHaveBeenCalledTimes(1)
		expect(firstCallResult).toBe('test')
		expect(workFunction).toHaveBeenCalledTimes(1)
	})

	it('should allow for async initialization of stores', async () => {
		const cache = createCache({
			getStoresAsync() {
				const ttlStore = createTTLStore({ defaultTTL: 5 * Time.Minute })
				return Promise.resolve([ttlStore])
			},
		})

		const workFunction = vi.fn().mockResolvedValue('test')
		const memoizedFn = cache.createCachedFunction(workFunction)

		const firstCallResult = await memoizedFn({ example: true })
		expect(workFunction).toHaveBeenCalledTimes(1)
		expect(firstCallResult).toBe('test')

		await memoizedFn.invalidate({ example: true })
		await memoizedFn({ example: true })
		expect(workFunction).toHaveBeenCalledTimes(2)
		await memoizedFn({ example: true })
		expect(workFunction).toHaveBeenCalledTimes(2)
	})

	it('should track store writes via context.waitUntil on cache miss', async () => {
		const waitUntilMock = vi.fn()
		const mockContext = { waitUntil: waitUntilMock }
		const testCache = createCache({ stores: [store], context: mockContext })

		const queryFn = vi.fn().mockResolvedValue('data')
		await testCache.cacheQuery({ queryFn, queryKey: ['ctx-test'] })

		expect(waitUntilMock).toHaveBeenCalledTimes(1)
	})

	it('should work with no arguments (uses defaults)', async () => {
		const defaultCache = createCache()
		const queryFn = vi.fn().mockResolvedValue('default result')
		const result = await defaultCache.cacheQuery({
			queryFn,
			queryKey: ['default-test'],
		})
		expect(result).toBe('default result')
		expect(queryFn).toHaveBeenCalledTimes(1)
		await defaultCache.dispose()
	})

	it('should have good types', async () => {
		const res = await cache.cacheQuery({
			queryKey: ['test-error'],
			queryFn: async () => {
				return {
					data: 'example',
				}
			},
		})
		// type check: res.data exists, res.doesNotExist should not
		void res?.data
		// @ts-expect-error This property should not exist
		void res?.doesNotExist
	})

	it('should expose getCacheKey for debugging', async () => {
		function myFn(_arg: string) {
			return 'result'
		}
		const cached = cache.createCachedFunction(myFn)

		const key1 = await cached.getCacheKey('hello')
		const key2 = await cached.getCacheKey('hello')
		const key3 = await cached.getCacheKey('world')

		// same args → same key
		expect(key1).toBe(key2)
		// different args → different key
		expect(key1).not.toBe(key3)
		// key is a non-empty string
		expect(typeof key1).toBe('string')
		expect(key1.length).toBeGreaterThan(0)
	})
})

describe('revalidateInBackground error handling', () => {
	it('should log error and not throw when queryFn rejects during revalidation', async () => {
		const errorLogger = vi.fn()
		const mockLogger = {
			error: errorLogger,
			log: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
		}

		const store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const testCache = createCache({
			stores: [store],
			logger: mockLogger,
			defaultRetry: false,
		})

		const queryKey = ['revalidate-error-test']

		// seed stale data so revalidateInBackground is triggered
		await store.set(hashKey(queryKey), {
			value: 'stale',
			age: Date.now() - 1 * Time.Hour,
		})

		const queryFn = vi.fn().mockRejectedValue(new Error('upstream failure'))

		// should return stale data without throwing
		const result = await testCache.cacheQuery({ queryFn, queryKey })
		expect(result).toBe('stale')

		// give background revalidation time to fail
		await new Promise((resolve) => setTimeout(resolve, 20))

		expect(errorLogger).toHaveBeenCalled()
	})
})

describe('request deduplication', () => {
	let cache: ReturnType<typeof createCache>
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		cache = createCache({ stores: [store] })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should deduplicate concurrent requests', async () => {
		let queryCount = 0
		const queryFn = vi.fn().mockImplementation(async () => {
			queryCount++
			await new Promise((resolve) => setTimeout(resolve, 10)) // Add delay to simulate work
			return `result ${queryCount}`
		})
		const queryKey = ['test-dedup']

		// Make 3 concurrent requests
		const results = await Promise.all([
			cache.cacheQuery({ queryFn, queryKey }),
			cache.cacheQuery({ queryFn, queryKey }),
			cache.cacheQuery({ queryFn, queryKey }),
		])

		// Should only call queryFn once
		expect(queryFn).toHaveBeenCalledTimes(1)

		// All results should be identical
		expect(results).toEqual(['result 1', 'result 1', 'result 1'])

		// Make another request after the first batch
		const laterResult = await cache.cacheQuery({ queryFn, queryKey })

		// Should return cached result without calling queryFn again
		expect(laterResult).toBe('result 1')
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('should deduplicate concurrent revalidations', async () => {
		let queryCount = 0
		const queryFn = vi.fn().mockImplementation(async () => {
			queryCount++
			await new Promise((resolve) => setTimeout(resolve, 50)) // Add delay to simulate work
			return `result ${queryCount}`
		})
		const queryKey = ['test-revalidate']

		// Set stale data in cache
		await store.set(hashKey(queryKey), {
			value: 'stale data',
			age: Date.now() - 1 * Time.Hour,
		})

		// Make 3 concurrent requests that will trigger revalidation
		const results = await Promise.all([
			cache.cacheQuery({ queryFn, queryKey }),
			cache.cacheQuery({ queryFn, queryKey }),
			cache.cacheQuery({ queryFn, queryKey }),
		])

		// All requests should return stale data
		expect(results).toEqual(['stale data', 'stale data', 'stale data'])

		// Wait for background revalidation
		await new Promise((resolve) => setTimeout(resolve, 100))

		// Should only have called queryFn once for revalidation
		expect(queryFn).toHaveBeenCalledTimes(1)

		// Verify cache was updated with new value
		const updatedResult = await store.get(hashKey(queryKey))
		expect(updatedResult?.value).toBe('result 1')
	})

	it('should cleanup deduplication map after error', async () => {
		const queryFn = vi.fn().mockRejectedValue(new Error('test error'))
		const queryKey = ['test-error']

		// First request should fail (retry disabled so it fails immediately)
		await expect(
			cache.cacheQuery({ queryFn, queryKey, options: { retry: false } }),
		).rejects.toThrow()

		// Second request should trigger a new attempt
		await expect(
			cache.cacheQuery({ queryFn, queryKey, options: { retry: false } }),
		).rejects.toThrow()

		// Should have called queryFn twice since the first error should have cleaned up the dedup map
		expect(queryFn).toHaveBeenCalledTimes(2)
	})
})

describe('invalidate', () => {
	let cache: ReturnType<typeof createCache>
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		cache = createCache({ stores: [store] })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should remove data from cache', async () => {
		const queryKey = ['test-invalidate']
		const key = hashKey(queryKey)

		// Set data in cache
		await store.set(key, {
			value: 'test data',
			age: Date.now(),
		})

		// Verify data exists
		let result = await store.get(key)
		expect(result?.value).toBe('test data')

		// Invalidate the cache
		await cache.invalidate({ queryKey })

		// Verify data is removed
		result = await store.get(key)
		expect(result).toBeUndefined()
	})

	it('should work with multiple stores', async () => {
		const store1 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const store2 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const multiCache = createCache({ stores: [store1, store2] })

		const queryKey = ['test-invalidate-multi']
		const key = hashKey(queryKey)

		// Set data in both stores
		await store1.set(key, {
			value: 'test data',
			age: Date.now(),
		})

		await store2.set(key, {
			value: 'test data',
			age: Date.now(),
		})

		// Verify data exists in both stores
		let result1 = await store1.get(key)
		let result2 = await store2.get(key)
		expect(result1?.value).toBe('test data')
		expect(result2?.value).toBe('test data')

		// Invalidate the cache
		await multiCache.invalidate({ queryKey })

		// Verify data is removed from both stores
		result1 = await store1.get(key)
		result2 = await store2.get(key)
		expect(result1).toBeUndefined()
		expect(result2).toBeUndefined()
	})

	it('should handle complex query keys', async () => {
		const complexQueryKey = [
			'users',
			{ id: 123, filters: { active: true, role: 'admin' } },
			['sort', 'asc'],
		]
		const key = hashKey(complexQueryKey)

		// Set data in cache
		await store.set(key, {
			value: 'complex data',
			age: Date.now(),
		})

		// Verify data exists
		let result = await store.get(key)
		expect(result?.value).toBe('complex data')

		// Invalidate the cache
		await cache.invalidate({ queryKey: complexQueryKey })

		// Verify data is removed
		result = await store.get(key)
		expect(result).toBeUndefined()
	})
})

describe('setCacheData', () => {
	let cache: ReturnType<typeof createCache>
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		cache = createCache({ stores: [store] })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should set data in cache', async () => {
		const queryKey = ['test-set-data']
		const value = { data: 'test value', timestamp: Date.now() }

		// Set data in cache
		await cache.setCacheData({ queryKey, value })

		// Verify data exists in store
		const result = await store.get(hashKey(queryKey))
		expect(result?.value).toEqual(value)
	})

	it('should work with multiple stores', async () => {
		const store1 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const store2 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const multiCache = createCache({ stores: [store1, store2] })

		const queryKey = ['test-set-data-multi']
		const value = { data: 'multi-store test', timestamp: Date.now() }

		// Set data in cache
		await multiCache.setCacheData({ queryKey, value })

		// Verify data exists in both stores
		const result1 = await store1.get(hashKey(queryKey))
		const result2 = await store2.get(hashKey(queryKey))
		expect(result1?.value).toEqual(value)
		expect(result2?.value).toEqual(value)
	})

	it('should overwrite existing data', async () => {
		const queryKey = ['test-overwrite']
		const key = hashKey(queryKey)

		// Set initial data
		await store.set(key, {
			value: 'initial data',
			age: Date.now() - 1000,
		})

		// Verify initial data
		let result = await store.get(key)
		expect(result?.value).toBe('initial data')

		// Overwrite with new data
		await cache.setCacheData({ queryKey, value: 'updated data' })

		// Verify data was updated
		result = await store.get(key)
		expect(result?.value).toBe('updated data')
	})

	it('should allow retrieving set data with cacheQuery', async () => {
		const queryKey = ['test-retrieve']
		const queryFn = vi.fn().mockResolvedValue('should not be called')

		// Set data in cache
		await cache.setCacheData({ queryKey, value: 'retrievable data' })

		// Retrieve with cacheQuery
		const result = await cache.cacheQuery({ queryFn, queryKey })

		// Should return the cached data without calling queryFn
		expect(result).toBe('retrievable data')
		expect(queryFn).not.toHaveBeenCalled()
	})

	it('should handle complex query keys', async () => {
		const complexQueryKey = [
			'products',
			{ category: 'electronics', filters: { inStock: true, onSale: true } },
			['price', 'desc'],
		]
		const value = { data: 'complex key test', metadata: { count: 42 } }

		// Set data in cache
		await cache.setCacheData({ queryKey: complexQueryKey, value })

		// Verify data exists in store
		const result = await store.get(hashKey(complexQueryKey))
		expect(result?.value).toEqual(value)
	})
})

describe('retry', () => {
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should retry failed queryFn up to retry count and then throw', async () => {
		const queryFn = vi.fn().mockRejectedValue(new Error('fail'))
		const retryCache = createCache({ stores: [store] })

		await expect(
			retryCache.cacheQuery({
				queryFn,
				queryKey: ['r1'],
				options: { retry: 2, retryDelay: 0 },
			}),
		).rejects.toThrow('fail')

		expect(queryFn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries

		await retryCache.dispose()
	})

	it('should succeed if queryFn succeeds on 2nd attempt', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		let calls = 0
		const queryFn = vi.fn().mockImplementation(async () => {
			calls++
			if (calls < 2) throw new Error('transient')
			return 'recovered'
		})

		const result = await cache.cacheQuery({
			queryFn,
			queryKey: ['r2'],
			options: { retry: 2, retryDelay: 0 },
		})
		expect(result).toBe('recovered')
		expect(queryFn).toHaveBeenCalledTimes(2)
	})

	it('should not retry when retry is false', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		const queryFn = vi.fn().mockRejectedValue(new Error('fail'))

		await expect(
			cache.cacheQuery({ queryFn, queryKey: ['r3'] }),
		).rejects.toThrow('fail')

		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('should support custom retryDelay function', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		const delays: number[] = []
		const retryDelay = vi.fn().mockImplementation((attempt: number) => {
			delays.push(attempt)
			return 0
		})
		const queryFn = vi.fn().mockRejectedValue(new Error('fail'))

		await expect(
			cache.cacheQuery({
				queryFn,
				queryKey: ['r4'],
				options: { retry: 2, retryDelay },
			}),
		).rejects.toThrow()

		expect(retryDelay).toHaveBeenCalledTimes(2)
		expect(delays).toEqual([0, 1])
	})

	it('should not call queryFn extra times when it succeeds on first try', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue('ok')

		const result = await cache.cacheQuery({ queryFn, queryKey: ['r5'] })
		expect(result).toBe('ok')
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('should retry in revalidateInBackground and update stores on eventual success', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })

		await store.set(hashKey(['r6']), {
			value: 'stale',
			age: Date.now() - 1 * Time.Hour,
		})

		let calls = 0
		const queryFn = vi.fn().mockImplementation(async () => {
			calls++
			if (calls < 2) throw new Error('transient')
			return 'fresh'
		})

		const result = await cache.cacheQuery({
			queryFn,
			queryKey: ['r6'],
			options: { retry: 2, retryDelay: 0 },
		})
		expect(result).toBe('stale')

		await new Promise((resolve) => setTimeout(resolve, 50))

		const updated = await store.get(hashKey(['r6']))
		expect(updated?.value).toBe('fresh')
	})

	it('should deduplicate retried requests (concurrent callers share the retrying promise)', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		let calls = 0
		const queryFn = vi.fn().mockImplementation(async () => {
			calls++
			if (calls < 2) throw new Error('transient')
			return 'shared'
		})

		const [r1, r2, r3] = await Promise.all([
			cache.cacheQuery({
				queryFn,
				queryKey: ['r7'],
				options: { retry: 2, retryDelay: 5 },
			}),
			cache.cacheQuery({
				queryFn,
				queryKey: ['r7'],
				options: { retry: 2, retryDelay: 5 },
			}),
			cache.cacheQuery({
				queryFn,
				queryKey: ['r7'],
				options: { retry: 2, retryDelay: 5 },
			}),
		])

		expect(queryFn).toHaveBeenCalledTimes(2) // 1 fail + 1 success
		expect(r1).toBe('shared')
		expect(r2).toBe('shared')
		expect(r3).toBe('shared')
	})
})

describe('AbortSignal', () => {
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should pass signal to queryFn', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		let receivedSignal: AbortSignal | undefined

		const queryFn = vi
			.fn()
			.mockImplementation(async (ctx?: { signal: AbortSignal }) => {
				receivedSignal = ctx?.signal
				return 'ok'
			})

		await cache.cacheQuery({ queryFn, queryKey: ['a1'] })
		expect(receivedSignal).toBeInstanceOf(AbortSignal)
	})

	it('should reject caller promptly when signal is aborted', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		const controller = new AbortController()

		// Long-running fetch — the caller aborts before it completes
		const queryFn = vi
			.fn()
			.mockImplementation(
				() =>
					new Promise<string>((resolve) => setTimeout(resolve, 5000, 'late')),
			)

		const resultPromise = cache.cacheQuery({
			queryFn,
			queryKey: ['a2'],
			options: { signal: controller.signal },
		})

		controller.abort()

		// Caller rejected immediately via raceWithSignal — no need to wait for the underlying fetch
		await expect(resultPromise).rejects.toThrow()
	})

	it('should reject caller promptly when signal is aborted even during retry backoff', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		const controller = new AbortController()

		const queryFn = vi.fn().mockRejectedValue(new Error('fail'))

		const start = Date.now()
		const resultPromise = cache.cacheQuery({
			queryFn,
			queryKey: ['a3'],
			options: { retry: 3, retryDelay: 1000, signal: controller.signal },
		})

		// Abort while the retry backoff is in progress
		await new Promise((resolve) => setTimeout(resolve, 20))
		controller.abort()

		await expect(resultPromise).rejects.toThrow()
		// Caller rejected well before all retries would have finished (3s+ total)
		expect(Date.now() - start).toBeLessThan(500)
	})

	it('should clean up deduplication map after abort so subsequent fetches retry', async () => {
		const cache = createCache({ stores: [store], defaultRetry: false })
		const controller = new AbortController()

		// queryFn that respects the signal (aborts when controller fires)
		const queryFn = vi.fn().mockImplementation(
			({ signal }: { signal: AbortSignal } = {} as any) =>
				new Promise<string>((_, reject) => {
					signal?.addEventListener('abort', () =>
						reject(new DOMException('Aborted', 'AbortError')),
					)
				}),
		)

		const promise = cache.cacheQuery({
			queryFn,
			queryKey: ['a4'],
			options: { signal: controller.signal },
		})

		// Aborting cancels both the caller (via raceWithSignal) and the underlying fetch
		// (via the linked controller → queryFn's signal)
		controller.abort()
		await expect(promise).rejects.toThrow()

		// Allow p.finally() to run and clean up the dedup map
		await new Promise((resolve) => setTimeout(resolve, 0))

		// Subsequent call (no signal) triggers a fresh fetch now that dedup map is cleared
		const queryFn2 = vi.fn().mockResolvedValue('fresh-result')
		const result = await cache.cacheQuery({
			queryFn: queryFn2,
			queryKey: ['a4'],
		})
		expect(result).toBe('fresh-result')
		expect(queryFn2).toHaveBeenCalledTimes(1)
	})
})

describe('partial key invalidation', () => {
	let store: ReturnType<typeof createTTLStore>
	let cache: ReturnType<typeof createCache>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		cache = createCache({ stores: [store], defaultRetry: false })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('should default to exact match (backwards compatible)', async () => {
		await cache.setCacheData({ queryKey: ['todos', 1], value: 'todo1' })
		await cache.setCacheData({ queryKey: ['todos', 2], value: 'todo2' })

		await cache.invalidate({ queryKey: ['todos', 1] })

		expect(await store.get(hashKey(['todos', 1]))).toBeUndefined()
		expect((await store.get(hashKey(['todos', 2])))?.value).toBe('todo2')
	})

	it('should match prefix keys when exact: false', async () => {
		await cache.setCacheData({ queryKey: ['todos', 1], value: 'todo1' })
		await cache.setCacheData({ queryKey: ['todos', 2], value: 'todo2' })
		await cache.setCacheData({ queryKey: ['users', 1], value: 'user1' })

		await cache.invalidate({ queryKey: ['todos'], exact: false })

		expect(await store.get(hashKey(['todos', 1]))).toBeUndefined()
		expect(await store.get(hashKey(['todos', 2]))).toBeUndefined()
		expect((await store.get(hashKey(['users', 1])))?.value).toBe('user1')
	})

	it('should match partial objects when exact: false', async () => {
		await cache.setCacheData({
			queryKey: ['todos', { status: 'done', page: 1 }],
			value: 'a',
		})
		await cache.setCacheData({
			queryKey: ['todos', { status: 'done', page: 2 }],
			value: 'b',
		})
		await cache.setCacheData({
			queryKey: ['todos', { status: 'pending', page: 1 }],
			value: 'c',
		})

		await cache.invalidate({
			queryKey: ['todos', { status: 'done' }],
			exact: false,
		})

		expect(
			await store.get(hashKey(['todos', { status: 'done', page: 1 }])),
		).toBeUndefined()
		expect(
			await store.get(hashKey(['todos', { status: 'done', page: 2 }])),
		).toBeUndefined()
		expect(
			(await store.get(hashKey(['todos', { status: 'pending', page: 1 }])))
				?.value,
		).toBe('c')
	})

	it('should not match when filter is more specific than stored key', async () => {
		await cache.setCacheData({ queryKey: ['todos'], value: 'all' })

		await cache.invalidate({ queryKey: ['todos', 1], exact: false })

		// ['todos'] does NOT match filter ['todos', 1] because filter has more elements
		expect((await store.get(hashKey(['todos'])))?.value).toBe('all')
	})

	it('should invalidate across all stores', async () => {
		const store2 = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const multiCache = createCache({
			stores: [store, store2],
			defaultRetry: false,
		})

		await multiCache.setCacheData({ queryKey: ['todos', 1], value: 'todo1' })

		await multiCache.invalidate({ queryKey: ['todos'], exact: false })

		expect(await store.get(hashKey(['todos', 1]))).toBeUndefined()
		expect(await store2.get(hashKey(['todos', 1]))).toBeUndefined()

		await store2.dispose?.()
	})

	it('should handle no matches gracefully (no-op)', async () => {
		await cache.setCacheData({ queryKey: ['users', 1], value: 'user1' })

		await expect(
			cache.invalidate({ queryKey: ['todos'], exact: false }),
		).resolves.not.toThrow()

		expect((await store.get(hashKey(['users', 1])))?.value).toBe('user1')
	})

	it('should register keys served as fresh hits (persistent store / restart scenario)', async () => {
		// Simulate a persistent store already populated (e.g. Redis after restart).
		// The key was never fetched through cacheQuery in this process, so keyRegistry is empty.
		const key = hashKey(['items', 1])
		await store.set(key, { value: 'cached', age: Date.now() }) // fresh entry

		// Serve the fresh hit — this should populate keyRegistry
		const queryFn = vi.fn().mockResolvedValue('never-called')
		await cache.cacheQuery({ queryFn, queryKey: ['items', 1] })
		expect(queryFn).not.toHaveBeenCalled() // confirmed fresh hit

		// Now partial invalidation should find and evict the key
		await cache.invalidate({ queryKey: ['items'], exact: false })
		expect(await store.get(key)).toBeUndefined()
	})

	it('should register keys from cacheQuery cache misses', async () => {
		const queryFn = vi.fn().mockResolvedValue('result')

		await cache.cacheQuery({ queryFn, queryKey: ['items', 1] })
		await cache.cacheQuery({ queryFn, queryKey: ['items', 2] })

		await cache.invalidate({ queryKey: ['items'], exact: false })

		expect(await store.get(hashKey(['items', 1]))).toBeUndefined()
		expect(await store.get(hashKey(['items', 2]))).toBeUndefined()
	})

	it('should clean up keyRegistry after invalidation', async () => {
		await cache.setCacheData({ queryKey: ['todos', 1], value: 'todo1' })
		await cache.invalidate({ queryKey: ['todos'], exact: false })

		// Re-populate
		await cache.setCacheData({ queryKey: ['todos', 1], value: 'todo1-new' })

		// Partial invalidation should still work after cleanup+re-register
		await cache.invalidate({ queryKey: ['todos'], exact: false })
		expect(await store.get(hashKey(['todos', 1]))).toBeUndefined()
	})
})

describe('dispose', () => {
	it('should call dispose on all stores', async () => {
		const mockDispose = vi.fn().mockResolvedValue(undefined)
		const mockStore = {
			name: 'mock',
			get: vi.fn().mockResolvedValue(undefined),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			dispose: mockDispose,
			[Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
		}
		const testCache = createCache({ stores: [mockStore] })
		await testCache.dispose()
		expect(mockDispose).toHaveBeenCalledTimes(1)
	})

	it('should support Symbol.asyncDispose', async () => {
		const mockDispose = vi.fn().mockResolvedValue(undefined)
		const mockStore = {
			name: 'mock',
			get: vi.fn().mockResolvedValue(undefined),
			set: vi.fn().mockResolvedValue(undefined),
			delete: vi.fn().mockResolvedValue(undefined),
			dispose: mockDispose,
			[Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
		}
		const testCache = createCache({ stores: [mockStore] })
		await testCache[Symbol.asyncDispose]()
		expect(mockDispose).toHaveBeenCalledTimes(1)
	})
})
