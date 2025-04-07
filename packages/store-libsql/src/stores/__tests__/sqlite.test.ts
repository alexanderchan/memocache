import { hashKey } from '@alexmchan/memocache-common'
import { CacheStore, Time } from '@alexmchan/memocache-common'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createSqliteStore } from '../sqlite.js'

describe('TTL Cache', () => {
  let store: CacheStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = createSqliteStore({
      defaultTTL: 60 * Time.Second,
      cleanupInterval: 5 * Time.Minute,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
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
    await store.set('key2', 'value2', 10 * Time.Millisecond)

    vi.advanceTimersByTimeAsync(500)
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
    await store.set('key3', 'value3', 3 * Time.Second) // 2 seconds TTL

    vi.advanceTimersByTime(1.5 * Time.Second)
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
    await store.clear?.()

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

    vi.advanceTimersByTime(500)
    await store.set('key9', 'updated9')

    vi.advanceTimersByTime(700)
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
