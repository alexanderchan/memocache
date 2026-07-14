import { hashKey, Time } from '@alexmchan/memocache-common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCache } from '@/cache'
import { createTTLStore } from '@/stores/ttl'

const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))

describe('negative caching (nullTTL)', () => {
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	it('does not invoke queryFn again within nullTTL when the result was null', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue(null)
		const queryKey = ['negative']

		const first = await cache.cacheQuery({
			queryFn,
			queryKey,
			options: { nullTTL: 200 },
		})
		const second = await cache.cacheQuery({
			queryFn,
			queryKey,
			options: { nullTTL: 200 },
		})

		expect(first).toBeNull()
		expect(second).toBeNull()
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('serves a null as fresh past the fresh window (no SWR churn for negatives)', async () => {
		const cache = createCache({ stores: [store], defaultFresh: 1 })
		const queryFn = vi.fn().mockResolvedValue(null)
		const queryKey = ['negative-fresh']

		await cache.cacheQuery({ queryFn, queryKey, options: { nullTTL: 500 } })
		await settle(20) // well past fresh=1ms, still inside nullTTL
		await cache.cacheQuery({ queryFn, queryKey, options: { nullTTL: 500 } })
		await settle()

		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('refetches after nullTTL expires', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue(null)
		const queryKey = ['negative-expiry']

		await cache.cacheQuery({ queryFn, queryKey, options: { nullTTL: 20 } })
		await settle(40)
		await cache.cacheQuery({ queryFn, queryKey, options: { nullTTL: 20 } })

		expect(queryFn).toHaveBeenCalledTimes(2)
	})

	it('caches non-null values normally when nullTTL is set', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue('real data')
		const queryKey = ['non-null']

		await cache.cacheQuery({ queryFn, queryKey, options: { nullTTL: 20 } })
		await settle(40) // past nullTTL, but the value is non-null so normal ttl applies
		const result = await cache.cacheQuery({
			queryFn,
			queryKey,
			options: { nullTTL: 20 },
		})

		expect(result).toBe('real data')
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('supports defaultNullTTL on the cache', async () => {
		const cache = createCache({ stores: [store], defaultNullTTL: 200 })
		const queryFn = vi.fn().mockResolvedValue(null)
		const queryKey = ['default-null-ttl']

		await cache.cacheQuery({ queryFn, queryKey })
		await cache.cacheQuery({ queryFn, queryKey })

		expect(queryFn).toHaveBeenCalledTimes(1)
	})
})

describe('error policy (rejections are never cached)', () => {
	it('retries on the next call after a miss-path rejection', async () => {
		const store = createTTLStore({ defaultTTL: 5 * Time.Minute })
		const cache = createCache({ stores: [store] })
		const queryFn = vi
			.fn()
			.mockRejectedValueOnce(new Error('origin down'))
			.mockResolvedValueOnce('recovered')
		const queryKey = ['error-not-cached']

		await expect(cache.cacheQuery({ queryFn, queryKey })).rejects.toThrow(
			'origin down',
		)
		await expect(cache.cacheQuery({ queryFn, queryKey })).resolves.toBe(
			'recovered',
		)
		expect(queryFn).toHaveBeenCalledTimes(2)
	})
})

describe('revalidation backoff', () => {
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	const setStaleEntry = async (queryKey: unknown[], value = 'stale data') => {
		await store.set(hashKey(queryKey), {
			value,
			age: Date.now() - 1 * Time.Hour,
		})
	}

	it('skips revalidation while backing off after a failure, still serving stale', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockRejectedValue(new Error('origin down'))
		const queryKey = ['backoff']
		await setStaleEntry(queryKey)

		const first = await cache.cacheQuery({ queryFn, queryKey })
		await settle() // let the background revalidation fail and record the backoff

		const second = await cache.cacheQuery({ queryFn, queryKey })
		await settle()

		expect(first).toBe('stale data')
		expect(second).toBe('stale data')
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('retries after the backoff window elapses and clears state on success', async () => {
		const cache = createCache({
			stores: [store],
			revalidateBackoff: { initialMs: 20, maxMs: 20 },
		})
		const queryFn = vi
			.fn()
			.mockRejectedValueOnce(new Error('origin down'))
			.mockResolvedValue('new data')
		const queryKey = ['backoff-retry']
		await setStaleEntry(queryKey)

		await cache.cacheQuery({ queryFn, queryKey })
		await settle() // failure recorded, backoff <= 20ms

		await settle(30) // let the backoff window elapse
		const result = await cache.cacheQuery({ queryFn, queryKey })
		await settle()

		expect(result).toBe('stale data') // stale served while revalidating
		expect(queryFn).toHaveBeenCalledTimes(2)
		const updated = await store.get(hashKey(queryKey))
		expect(updated?.value).toBe('new data')
	})

	it('retries every stale read when revalidateBackoff is false', async () => {
		const cache = createCache({ stores: [store], revalidateBackoff: false })
		const queryFn = vi.fn().mockRejectedValue(new Error('origin down'))
		const queryKey = ['backoff-disabled']
		await setStaleEntry(queryKey)

		await cache.cacheQuery({ queryFn, queryKey })
		await settle()
		await cache.cacheQuery({ queryFn, queryKey })
		await settle()

		expect(queryFn).toHaveBeenCalledTimes(2)
	})
})

describe('stale-if-error', () => {
	let store: ReturnType<typeof createTTLStore>

	beforeEach(() => {
		store = createTTLStore({ defaultTTL: 5 * Time.Minute })
	})

	afterEach(async () => {
		await store?.clear?.()
	})

	const setErrorOnlyEntry = async (queryKey: unknown[]) => {
		// written in the past, and past its write-time staleIfErrorAt: error-only
		await store.set(hashKey(queryKey), {
			value: 'stale data',
			age: Date.now() - 10 * Time.Minute,
			staleIfErrorAt: Date.now() - 1 * Time.Minute,
		})
	}

	it('serves the stale value when the entry is error-only and queryFn rejects', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockRejectedValue(new Error('origin down'))
		const queryKey = ['sie-reject']
		await setErrorOnlyEntry(queryKey)

		const result = await cache.cacheQuery({ queryFn, queryKey })

		expect(result).toBe('stale data')
		expect(queryFn).toHaveBeenCalledTimes(1)
	})

	it('returns fresh data when the entry is error-only and queryFn succeeds', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['sie-success']
		await setErrorOnlyEntry(queryKey)

		const result = await cache.cacheQuery({ queryFn, queryKey })
		await settle()

		expect(result).toBe('new data')
		const updated = await store.get(hashKey(queryKey))
		expect(updated?.value).toBe('new data')
	})

	it('skips the origin for error-only entries while backing off', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockRejectedValue(new Error('origin down'))
		const queryKey = ['sie-backoff']
		await setErrorOnlyEntry(queryKey)

		const first = await cache.cacheQuery({ queryFn, queryKey })
		const second = await cache.cacheQuery({ queryFn, queryKey })

		expect(first).toBe('stale data')
		expect(second).toBe('stale data')
		expect(queryFn).toHaveBeenCalledTimes(1) // second read is inside the backoff window
	})

	it('extends storage expiry by staleIfError at write time', async () => {
		const setSpy = vi.spyOn(store, 'set')
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue('data')
		const queryKey = ['sie-storage']

		await cache.cacheQuery({
			queryFn,
			queryKey,
			options: { ttl: 500, staleIfError: 1000 },
		})
		await settle()

		expect(setSpy).toHaveBeenCalledWith(
			hashKey(queryKey),
			expect.objectContaining({
				value: 'data',
				staleIfErrorAt: expect.any(Number),
			}),
			1500,
		)
	})

	it('keeps legacy entries (no staleIfErrorAt) on the ordinary stale path', async () => {
		const cache = createCache({ stores: [store] })
		const queryFn = vi.fn().mockResolvedValue('new data')
		const queryKey = ['legacy-entry']
		await store.set(hashKey(queryKey), {
			value: 'stale data',
			age: Date.now() - 1 * Time.Hour,
		})

		// legacy behavior: stale is served immediately, revalidation is background
		const result = await cache.cacheQuery({ queryFn, queryKey })
		expect(result).toBe('stale data')
	})
})
