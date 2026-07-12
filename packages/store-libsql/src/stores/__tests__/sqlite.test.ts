import { type CacheStore, hashKey, Time } from '@alexmchan/memocache-common'
import type { Client } from '@libsql/client'
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

		// Set an entry
		await store.set('cleanup-key', { value: 'data', age: Date.now() }, 100)

		// Advance time past TTL
		vi.advanceTimersByTime(200)

		// Run cleanup manually
		await store.cleanup()

		// Entry should be gone
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

		// Set an entry that expires quickly
		await store.set('interval-key', { value: 'data', age: Date.now() }, 100)

		// Advance time past TTL and cleanup interval, allowing async callbacks to run
		await vi.advanceTimersByTimeAsync(600)

		// Entry should be removed by interval cleanup
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

	it('closes a self-created client on dispose', async () => {
		const store = createSqliteStore()
		await store.set('key', 'value')
		expect(await store.get('key')).toBe('value')

		await store.dispose?.()

		// The self-created client was closed, so further operations reject.
		await expect(store.get('key')).rejects.toThrow()
	})

	it('does not close an injected client on dispose', async () => {
		const close = vi.fn()
		const injectedClient = {
			execute: vi.fn().mockResolvedValue({ rows: [] }),
			close,
		} as unknown as Client

		const store = createSqliteStore({ sqliteClient: injectedClient })
		await store.dispose?.()

		expect(close).not.toHaveBeenCalled()
	})

	it('logs instead of crashing when deleting an expired entry rejects', async () => {
		const error = vi.fn()
		const logger = {
			log: vi.fn(),
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error,
		}

		const injectedClient = {
			execute: vi.fn(async (arg: string | { sql: string }) => {
				const sql = typeof arg === 'string' ? arg : arg.sql
				if (sql.startsWith('SELECT')) {
					return {
						rows: [
							{
								value: superjson.stringify('expired-value'),
								expires: Date.now() - 1000,
							},
						],
					}
				}
				if (sql.startsWith('DELETE')) {
					throw new Error('delete failed')
				}
				return { rows: [] }
			}),
			close: vi.fn(),
		} as unknown as Client

		const store = createSqliteStore({
			sqliteClient: injectedClient,
			logger,
		})

		// The expired read fires a fire-and-forget delete that rejects; get
		// itself must resolve to undefined without throwing.
		const result = await store.get('expired-key')
		expect(result).toBeUndefined()

		// The rejection is handled on a later microtask; wait for the log.
		await vi.waitFor(() => {
			expect(error).toHaveBeenCalled()
		})

		await store.dispose?.()
	})
})
