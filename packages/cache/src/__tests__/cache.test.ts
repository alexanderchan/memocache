import { Time } from '@alexmchan/memocache-common'
import { hashKey } from '@alexmchan/memocache-common'
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

  it('should have good types', async () => {
    const res = await cache.cacheQuery({
      queryKey: ['test-error'],
      queryFn: async () => {
        return {
          data: 'example',
        }
      },
    })

    // we should get the data
    console.info(res?.data)

    // @ts-expect-error This property should not exist
    console.info(res?.doesNotExist)
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

    // First request should fail
    await expect(cache.cacheQuery({ queryFn, queryKey })).rejects.toThrow()

    // Second request should trigger a new attempt
    await expect(cache.cacheQuery({ queryFn, queryKey })).rejects.toThrow()

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
    expect(result).toEqual(value)
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
    expect(result1).toEqual(value)
    expect(result2).toEqual(value)
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
    const newValue = { value: 'updated data', age: Date.now() }
    await cache.setCacheData({ queryKey, value: newValue })

    // Verify data was updated
    result = await store.get(key)
    expect(result).toEqual(newValue)
  })

  it('should allow retrieving set data with cacheQuery', async () => {
    const queryKey = ['test-retrieve']
    const value = { value: 'retrievable data', age: Date.now() }
    const queryFn = vi.fn().mockResolvedValue('should not be called')

    // Set data in cache
    await cache.setCacheData({ queryKey, value })

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
    expect(result).toEqual(value)
  })
})
