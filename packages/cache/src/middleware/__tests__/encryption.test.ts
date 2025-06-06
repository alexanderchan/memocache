import { hashKey } from '@alexmchan/memocache-common'
import { Time } from '@alexmchan/memocache-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEncryptedStore } from '@/middleware/encryption'
import { createTTLStore } from '@/stores/ttl'

describe('Encrypted TTL Cache', () => {
  let ttlCache: ReturnType<typeof createTTLStore>
  let cache: ReturnType<typeof createEncryptedStore>

  beforeEach(() => {
    vi.useFakeTimers()
    ttlCache = createTTLStore({ defaultTTL: 60 * Time.Second })
    cache = createEncryptedStore({
      key: 'this is secret sauce',
      salt: 'salt',
      store: ttlCache,
    }) // 1 second default TTL
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should set and get a value', async () => {
    await cache.set('key1', 'value1', 10 * Time.Second)
    const result = await cache.get('key1')
    expect(result).toBe('value1')

    const ttlCacheValue = await ttlCache.get('key1')
    expect(ttlCacheValue).toBeUndefined()

    const allValues = await ttlCache.entries?.()

    expect(allValues).toBeDefined()
    expect(allValues?.length).toBe(1)

    // the value shouldn't be the one that we set
    // note that the iv and cyper text are different every time
    // so we can't compare the value directly
    expect(allValues?.find(([key]) => key === 'key1')).toBeUndefined()
  })

  // from here on, we are running the same tests as the TTL store
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
