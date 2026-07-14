import { DatabaseSync } from 'node:sqlite'

import { type CacheStore, hashKey, Time } from '@alexmchan/memocache-common'
import superjson from 'superjson'
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

// Behavioral parity suite — mirrors the store-libsql local-mode tests so the
// node:sqlite store is a drop-in replacement.
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

		vi.advanceTimersByTime(500)
		const result = await store.get('key2')
		expect(result).toBeUndefined()
	})

	it('should respect custom TTL', async () => {
		await store.set('key3', 'value3', 3 * Time.Second)

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

	it('should round-trip rich values through superjson', async () => {
		const value = { createdAt: new Date('2026-01-02T03:04:05Z'), tags: ['a'] }
		await store.set('rich', value, 10 * Time.Second)
		const result = await store.get('rich')
		expect(result).toEqual(value)
		expect((result as typeof value).createdAt).toBeInstanceOf(Date)
	})
})

describe('SQLite tableName validation', () => {
	it('should throw on invalid tableName', () => {
		expect(() =>
			createSqliteStore({ tableName: 'my; DROP TABLE cache;--' }),
		).toThrow()
		expect(() =>
			createSqliteStore({ tableName: 'valid_table_name' }),
		).not.toThrow()
	})
})

describe('SQLite cleanup interval', () => {
	it('should remove expired entries during cleanup', async () => {
		vi.useFakeTimers()
		const store = createSqliteStore({ defaultTTL: 1000 })

		await store.set('cleanup-key', { value: 'data', age: Date.now() }, 100)

		vi.advanceTimersByTime(200)

		await store.cleanup()

		const result = await store.get('cleanup-key')
		expect(result).toBeUndefined()

		vi.useRealTimers()
		await store.dispose?.()
	})

	it('startCleanupInterval triggers periodic cleanup', async () => {
		vi.useFakeTimers()
		const cleanupIntervalMs = 500
		const store = createSqliteStore({
			defaultTTL: 1000,
			cleanupInterval: cleanupIntervalMs,
		})

		await store.set('interval-key', { value: 'data', age: Date.now() }, 100)

		await vi.advanceTimersByTimeAsync(600)

		const result = await store.get('interval-key')
		expect(result).toBeUndefined()

		vi.useRealTimers()
		await store.dispose?.()
	})
})

describe('SQLite store lifecycle', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('unrefs the cleanup interval so it does not keep the process alive', () => {
		const unref = vi.fn()
		const setIntervalSpy = vi
			.spyOn(global, 'setInterval')
			.mockReturnValue({ unref } as unknown as NodeJS.Timeout)

		const store = createSqliteStore()

		expect(setIntervalSpy).toHaveBeenCalled()
		expect(unref).toHaveBeenCalledTimes(1)

		// clearInterval on the fake handle is a no-op; safe to dispose.
		store.dispose?.()
	})

	it('closes a self-created database on dispose', async () => {
		const store = createSqliteStore()
		await store.set('key', 'value')
		expect(await store.get('key')).toBe('value')

		await store.dispose?.()

		// The self-created database was closed, so further operations reject.
		await expect(store.get('key')).rejects.toThrow()
	})

	it('does not close an injected database on dispose', async () => {
		const database = new DatabaseSync(':memory:')
		const close = vi.spyOn(database, 'close')

		const store = createSqliteStore({ database })
		await store.dispose?.()

		expect(close).not.toHaveBeenCalled()
		database.close()
	})

	it('logs instead of throwing when deleting an expired entry fails', async () => {
		const error = vi.fn()
		const logger = {
			log: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error,
		}

		// Fake DatabaseSync whose delete-by-key statement throws while a SELECT
		// returns an already-expired row.
		const fakeDatabase = {
			exec: vi.fn(),
			prepare: vi.fn((sql: string) => {
				if (sql.startsWith('SELECT')) {
					return {
						get: () => ({
							value: superjson.stringify('expired-value'),
							expires: Date.now() - 1000,
						}),
						run: vi.fn(),
						all: vi.fn(),
					}
				}
				if (sql.includes('WHERE key')) {
					return {
						run: () => {
							throw new Error('delete failed')
						},
						get: vi.fn(),
						all: vi.fn(),
					}
				}
				return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
			}),
			close: vi.fn(),
		}

		const store = createSqliteStore({
			database: fakeDatabase as unknown as DatabaseSync,
			logger,
		})

		const result = await store.get('expired-key')
		expect(result).toBeUndefined()
		expect(error).toHaveBeenCalled()

		await store.dispose?.()
	})
})
