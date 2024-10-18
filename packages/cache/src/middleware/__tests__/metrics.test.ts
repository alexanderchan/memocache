import { CacheStore } from '@alexmchan/memocache-common'
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest'

import { createMetricsStore } from '../metrics'

// Define a type that extends CacheStore with mock functions
type MockCacheStore = {
  [K in keyof CacheStore]: CacheStore[K] & Mock
}

describe('Metrics Middleware', () => {
  let baseStore: MockCacheStore
  let logger: { log: Mock }
  let storeWithMetrics: CacheStore

  beforeEach(() => {
    vi.useFakeTimers()

    // Mock base store
    baseStore = {
      name: 'MockStore' as any, // the mock cache has a complex type so we need to cast it
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      [Symbol.asyncDispose]: vi.fn(),
    }

    // Mock logger
    logger = {
      log: vi.fn(),
    }

    storeWithMetrics = createMetricsStore({ logger, store: baseStore })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should log metrics for get operation', async () => {
    baseStore.get.mockResolvedValue('value1')

    const result = await storeWithMetrics.get('key1')

    expect(result).toBe('value1')
    expect(baseStore.get).toHaveBeenCalledWith('key1')
    expect(logger.log).toHaveBeenCalledWith(
      'Metric',
      expect.objectContaining({
        metric: 'cache.read',
        key: 'key1',
        hit: true,
        latency: expect.any(Number),
      }),
    )
  })

  it('should log metrics for set operation', async () => {
    await storeWithMetrics.set('key2', 'value2', 60)

    expect(baseStore.set).toHaveBeenCalledWith('key2', 'value2', 60)
    expect(logger.log).toHaveBeenCalledWith(
      'Metric',
      expect.objectContaining({
        metric: 'cache.write',
        key: 'key2',
        latency: expect.any(Number),
      }),
    )
  })

  it('should log metrics for delete operation', async () => {
    await storeWithMetrics.delete('key3')

    expect(baseStore.delete).toHaveBeenCalledWith('key3')
    expect(logger.log).toHaveBeenCalledWith(
      'Metric',
      expect.objectContaining({
        metric: 'cache.delete',
        key: 'key3',
        latency: expect.any(Number),
      }),
    )
  })

  it('should log cache miss', async () => {
    baseStore.get.mockResolvedValue(undefined)

    const result = await storeWithMetrics.get('nonexistent')

    expect(result).toBeUndefined()
    expect(logger.log).toHaveBeenCalledWith(
      'Metric',
      expect.objectContaining({
        metric: 'cache.read',
        key: 'nonexistent',
        hit: false,
        latency: expect.any(Number),
      }),
    )
  })

  it('should handle errors in base store', async () => {
    const error = new Error('Store error')
    baseStore.get.mockRejectedValue(error)

    await expect(storeWithMetrics.get('errorKey')).rejects.toThrow(
      'Store error',
    )

    expect(logger.log).toHaveBeenCalledWith(
      'Metric',
      expect.objectContaining({
        metric: 'cache.miss',
        key: 'errorKey',
        hit: false,
        latency: expect.any(Number),
      }),
    )
  })

  it('should measure latency correctly', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(100)

    await storeWithMetrics.get('latencyKey')

    expect(logger.log).toHaveBeenCalledWith(
      'Metric',
      expect.objectContaining({
        latency: 100,
      }),
    )
  })
})
