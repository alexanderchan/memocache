import { hashKey } from '@alexmchan/memocache-common'
import { Time } from '@alexmchan/memocache-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCache } from '@/cache'

import { createTTLStore } from '../ttl'

describe('TTL Cache', () => {
  let cache: ReturnType<typeof createTTLStore>

  beforeEach(() => {
    vi.useFakeTimers()
    cache = createTTLStore({ defaultTTL: 60 * Time.Second }) // 1 second default TTL
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should set and get a value', async () => {
    await cache.set('key1', 'value1', 10 * Time.Second)
    const result = await cache.get('key1')
    expect(result).toBe('value1')
  })

  it('should respect the default TTL', async () => {
    await cache.set('key2', 'value2', 10 * Time.Millisecond)

    vi.advanceTimersByTimeAsync(500)
    let result = await cache.get('key2')
    expect(result).toBe('value2')

    await vi.waitFor(async () => {
      result = await cache.get('key2')

      if (result !== undefined) {
        throw new Error('Value should have expired')
      }
    })

    expect(result).toBeUndefined()
  })

  it('should respect custom TTL', async () => {
    await cache.set('key3', 'value3', 3 * Time.Second) // 2 seconds TTL

    vi.advanceTimersByTime(1.5 * Time.Second)
    const result = await cache.get('key3')
    expect(result).toBe('value3')
  })

  it('should delete a value', async () => {
    await cache.set('key4', 'value4', 5 * Time.Second)
    await cache.delete('key4')
    const result = await cache.get('key4')
    expect(result).toBeUndefined()
  })

  it('should clear all values', async () => {
    await cache.set('key5', 'value5', 5 * Time.Second)
    await cache.set('key6', 'value6', 5 * Time.Second)
    await cache.clear?.()

    const result1 = await cache.get('key5')
    const result2 = await cache.get('key6')
    expect(result1).toBeUndefined()
    expect(result2).toBeUndefined()
  })

  it('should handle multiple sets and gets', async () => {
    await cache.set('key7', 'value7')
    await cache.set('key8', 'value8')

    const result1 = await cache.get('key7')
    const result2 = await cache.get('key8')

    expect(result1).toBe('value7')
    expect(result2).toBe('value8')
  })

  it('should update value and reset TTL on re-set', async () => {
    await cache.set('key9', 'value9')

    vi.advanceTimersByTime(500)
    await cache.set('key9', 'updated9')

    vi.advanceTimersByTime(700)
    const result = await cache.get('key9')
    expect(result).toBe('updated9')
  })

  it('should handle non-string keys', async () => {
    const objKey = { id: 1 }
    await cache.set(hashKey(['example', objKey]), 'objectValue')
    const result = await cache.get(hashKey(['example', objKey]))
    expect(result).toBe('objectValue')
  })

  it('should handle undefined and null values', async () => {
    await cache.set('undefinedKey', undefined)
    await cache.set('nullKey', null)

    const undefinedResult = await cache.get('undefinedKey')
    const nullResult = await cache.get('nullKey')

    expect(undefinedResult).toBeUndefined()
    expect(nullResult).toBeNull()
  })
})

describe('createCache with no default params', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create a cache with default parameters and cache values correctly', async () => {
    // Create cache with no explicit parameters
    const cache = createCache({})

    // Create a test function to be cached
    const testFn = vi
      .fn()
      .mockImplementation((input: string) => `processed-${input}`)
    const cachedFn = cache.createCachedFunction(testFn)

    // First call should execute the function
    const result1 = await cachedFn('test')
    expect(result1).toBe('processed-test')
    expect(testFn).toHaveBeenCalledTimes(1)

    // Second call with same input should use cached value
    const result2 = await cachedFn('test')
    expect(result2).toBe('processed-test')
    expect(testFn).toHaveBeenCalledTimes(1) // Still called only once

    // Call with different input should execute function again
    const result3 = await cachedFn('different')
    expect(result3).toBe('processed-different')
    expect(testFn).toHaveBeenCalledTimes(2)

    // Verify cache can be invalidated
    await cachedFn.invalidate('test')
    const result4 = await cachedFn('test')
    expect(result4).toBe('processed-test')
    expect(testFn).toHaveBeenCalledTimes(3) // Called again after invalidation
  })

  it('should use default TTL and fresh values when not specified', async () => {
    const cache = createCache({})
    const testFn = vi
      .fn()
      .mockImplementation((input: string) => `processed-${input}`)
    const cachedFn = cache.createCachedFunction(testFn)

    // First call
    await cachedFn('test')
    expect(testFn).toHaveBeenCalledTimes(1)

    // Advance time by 25 seconds (less than default fresh period of 30 seconds)
    vi.advanceTimersByTime(25 * Time.Second)
    await cachedFn('test')
    expect(testFn).toHaveBeenCalledTimes(1) // Still fresh, not called again

    // Advance time to exceed fresh period but still within TTL
    vi.advanceTimersByTime(10 * Time.Second) // Now at 35 seconds total
    await cachedFn('test')
    expect(testFn).toHaveBeenCalledTimes(2) // No longer fresh, called again

    // Verify value is still cached until TTL expires
    vi.advanceTimersByTime(1 * Time.Second)
    await cachedFn('test')
    expect(testFn).toHaveBeenCalledTimes(2) // Fresh again, not called

    // Advance time to exceed TTL (5 minutes)
    vi.advanceTimersByTime(5 * Time.Minute)
    await cachedFn('test')
    expect(testFn).toHaveBeenCalledTimes(3) // TTL expired, called again
  })
})
