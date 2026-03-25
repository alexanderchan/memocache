import {
	type CacheStore,
	type Context,
	DefaultStatefulContext,
	defaultLogger,
	hashKey,
	hashString,
	type Logger,
	partialMatchKey,
	type QueryKey,
	Time,
} from '@alexmchan/memocache-common'

import { TTLCache } from '@isaacs/ttlcache'

import { createTTLStore } from '@/stores'

import { CacheError } from './error/cache-error'

export type RetryDelayFn = (attempt: number, error: unknown) => number

interface CacheQueryOptions {
	/** Time to live (expiry) in milliseconds from now to expire a record if no other overrides are provided */
	ttl?: number
	/** Time in milliseconds to consider data fresh and not revalidate.  Fresh data is served and no request to the backend will be made */
	fresh?: number
	/** A prefix to add to the cache key */
	cachePrefix?: string
	/** Number of times to retry a failed queryFn, or false to disable. Default: 3 */
	retry?: number | false
	/** Delay between retries in ms, or a function of (attempt, error) => ms. Default: exponential backoff capped at 30s */
	retryDelay?: number | RetryDelayFn
	/** AbortSignal to cancel this caller's wait. If the signal fires, this caller rejects immediately via raceWithSignal, but the underlying fetch continues so other concurrent callers sharing the same dedup promise are unaffected. */
	signal?: AbortSignal
}
interface CacheOptions {
	/** An array of stores, order read from will be first in the array to last */
	stores?: CacheStore[]
	/** An array of asynchronously created stores.  Some edge environments need to dynamically load libraries that can't be used in both such as ioredis */
	getStoresAsync?: () => Promise<CacheStore[]>
	/** A context to allow for cache cleanup in edge */
	context?: Context
	/** Default time to live (expiry) in milliseconds from now to expire a record if no other overrides are provided
	 *  Default is 5 minutes, order of preference is function => store => default
	 */
	defaultTTL?: number
	/** Default time in milliseconds to consider data fresh and not revalidate.  Fresh data is served and no request to the backend will be made */
	defaultFresh?: number
	/** Logger to use for cache errors */
	logger?: Logger
	/** Default number of retries for failed queryFn calls. Default: 3 */
	defaultRetry?: number | false
	/** Default retry delay. Default: exponential backoff capped at 30s */
	defaultRetryDelay?: number | RetryDelayFn
}

const DEFAULT_FRESH = 30 * Time.Second // when data is fresh we don't revalidate
const DEFAULT_TTL = 5 * Time.Minute // how long to keep data in cache

export const createCache = ({
	stores: storesProp,
	getStoresAsync,
	defaultTTL = DEFAULT_TTL,
	defaultFresh = DEFAULT_FRESH,
	logger = defaultLogger,
	context,
	defaultRetry = 3,
	defaultRetryDelay,
}: CacheOptions = {}) => {
	// Only use the default in-memory store when no async store factory is provided
	const stores =
		storesProp ??
		(!getStoresAsync ? [createTTLStore({ defaultTTL })] : undefined)
	const _context = context || new DefaultStatefulContext()

	const _stores: CacheStore[] = []
	let initPromise: Promise<CacheStore[]> | undefined
	const revalidating = new Map<string, Promise<any>>()
	// Bounded registry mapping hashed keys → original QueryKey for partial invalidation.
	// TTLCache auto-evicts entries when their TTL expires, preventing unbounded growth.
	const keyRegistry = new TTLCache<string, QueryKey>({
		max: 10_000,
		ttl: defaultTTL,
	})

	function getRetryDelay(
		attempt: number,
		error: unknown,
		retryDelay: number | RetryDelayFn | undefined,
	): number {
		if (typeof retryDelay === 'function') return retryDelay(attempt, error)
		if (typeof retryDelay === 'number') return retryDelay
		// Default exponential backoff: 1s, 2s, 4s… capped at 30s
		return Math.min(1000 * 2 ** attempt, 30_000)
	}

	async function executeWithRetry<T>(
		fn: () => Promise<T>,
		retryOpts: {
			retry: number | false
			retryDelay: number | RetryDelayFn | undefined
			signal?: AbortSignal
		},
	): Promise<T> {
		const maxRetries = retryOpts.retry === false ? 0 : retryOpts.retry
		let attempt = 0
		while (true) {
			if (retryOpts.signal?.aborted)
				throw (
					retryOpts.signal.reason ?? new DOMException('Aborted', 'AbortError')
				)
			try {
				return await fn()
			} catch (error) {
				if (retryOpts.signal?.aborted)
					throw (
						retryOpts.signal.reason ?? new DOMException('Aborted', 'AbortError')
					)
				if (attempt >= maxRetries) throw error
				const delay = getRetryDelay(attempt, error, retryOpts.retryDelay)
				attempt++
				// Fix: use a named handler so we can remove it when the timer fires normally,
				// preventing a listener leak on successful retry delays.
				await new Promise<void>((resolve, reject) => {
					const onAbort = () => {
						clearTimeout(timer)
						reject(
							retryOpts.signal?.reason ??
								new DOMException('Aborted', 'AbortError'),
						)
					}
					const timer = setTimeout(() => {
						retryOpts.signal?.removeEventListener('abort', onAbort)
						resolve()
					}, delay)
					retryOpts.signal?.addEventListener('abort', onAbort, { once: true })
				})
			}
		}
	}

	/**
	 * Race a promise against an AbortSignal. If the signal fires, the returned
	 * promise rejects with the abort reason — but the underlying `promise` is
	 * not cancelled and continues to completion (important for shared/dedup'd fetches).
	 */
	function raceWithSignal<T>(
		promise: Promise<T>,
		signal: AbortSignal | undefined,
	): Promise<T> {
		if (!signal) return promise
		if (signal.aborted)
			return Promise.reject(
				signal.reason ?? new DOMException('Aborted', 'AbortError'),
			)
		return new Promise<T>((resolve, reject) => {
			const onAbort = () => {
				reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
			}
			signal.addEventListener('abort', onAbort, { once: true })
			promise.then(
				(value) => {
					signal.removeEventListener('abort', onAbort)
					resolve(value)
				},
				(err) => {
					signal.removeEventListener('abort', onAbort)
					reject(err)
				},
			)
		})
	}

	async function getStores(): Promise<CacheStore[]> {
		if (!initPromise) {
			initPromise = (async () => {
				if (stores) {
					_stores.push(...stores)
				} else if (getStoresAsync) {
					try {
						_stores.push(...(await getStoresAsync()))
					} catch {
						logger.error(
							new CacheError({
								key: 'stores',
								message: 'Failed to get stores',
							}),
						)
					}
				}
				return _stores
			})()
		}
		return initPromise
	}

	async function cacheQuery<T = unknown>({
		queryFn,
		queryKey,
		options,
	}: {
		queryFn: (context?: { signal: AbortSignal }) => Promise<T>
		queryKey: QueryKey
		options?: CacheQueryOptions
	}): Promise<T | undefined> {
		let result = null
		let isFresh = false
		let hitStoreIndex = -1
		const key = hashKey(queryKey)

		const localOptions = {
			...options,
			ttl: options?.ttl ?? defaultTTL,
			fresh: options?.fresh ?? defaultFresh,
			retry: options?.retry !== undefined ? options.retry : defaultRetry,
			retryDelay: options?.retryDelay ?? defaultRetryDelay,
			signal: options?.signal,
		}

		const _stores = await getStores()

		for (const [index, store] of _stores.entries()) {
			result = await store.get(key)

			if (result) {
				hitStoreIndex = index
				const age = result.age ? Date.now() - result.age : 0

				if (age < localOptions.fresh) {
					isFresh = true
					break
				}
			}
		}

		if (isFresh) {
			// Register in keyRegistry so partial invalidation can find this key even if it
			// was populated by a previous process and never went through cacheQuery's miss path.
			keyRegistry.set(key, queryKey, {
				ttl: getRemainingTTL({ age: result?.age, ttl: localOptions.ttl }),
			})
			if (hitStoreIndex > 0) {
				backfillHigherPriorityStores({
					stores: _stores.slice(0, hitStoreIndex),
					key,
					value: result,
					ttl: getRemainingTTL({
						age: result?.age,
						ttl: localOptions.ttl,
					}),
				})
			}
			return result?.value // Data is fresh, return from cache
		}

		// If stale, return from cache and revalidate in the background
		if (result) {
			revalidateInBackground({
				queryFn,
				queryKey: key,
				originalQueryKey: queryKey,
				ttl: localOptions?.ttl,
				retry: localOptions.retry,
				retryDelay: localOptions.retryDelay,
			})
			return result.value // Return stale data
		}

		// No data in cache, fetch from the source.
		//
		// An internal AbortController is created and its signal is passed to queryFn so
		// queryFn can react to cancellation. However, the controller is NOT linked to the
		// caller's signal — aborting one caller only rejects that caller (via raceWithSignal)
		// and leaves the shared dedup promise running for any other concurrent callers.
		const controller = new AbortController()

		// If this key is already being fetched, join the existing promise instead of
		// starting a new one. Individual callers race the shared promise against their own signal.
		const existing = revalidating.get(key)
		if (existing) {
			return await raceWithSignal(existing, localOptions.signal)
		}

		// Register the key before the fetch so partial invalidation can evict stale data
		// even if the fetch eventually fails.
		keyRegistry.set(key, queryKey, { ttl: localOptions.ttl })

		// Build the shared promise that handles the fetch, store writes, and dedup cleanup.
		// The cleanup lives inside p.finally() so it runs regardless of whether callers
		// are still waiting (they may have raced away via their AbortSignal).
		const p = executeWithRetry(() => queryFn({ signal: controller.signal }), {
			retry: localOptions.retry,
			retryDelay: localOptions.retryDelay,
		})
			.then(async (newData) => {
				const writeToStoresPromise = Promise.allSettled(
					_stores.map((store) =>
						store.set(
							key,
							{ value: newData, age: Date.now() },
							localOptions?.ttl,
						),
					),
				)
				_context.waitUntil(writeToStoresPromise)
				return newData
			})
			.finally(() => {
				revalidating.delete(key)
			})

		revalidating.set(key, p)
		// Suppress unhandled rejection on `p`: callers get their error via raceWithSignal.
		// Without this, if the signal aborts (settling the caller's promise early) and
		// p later rejects, Node treats p's rejection as unhandled.
		p.catch(() => {})
		return await raceWithSignal(p, localOptions.signal)
	}

	function getRemainingTTL({
		age,
		ttl,
	}: {
		age: number | undefined
		ttl: number
	}) {
		if (!age) {
			return ttl
		}

		const remainingTTL = ttl - (Date.now() - age)
		return Math.max(remainingTTL, 1)
	}

	function backfillHigherPriorityStores({
		stores,
		key,
		value,
		ttl,
	}: {
		stores: CacheStore[]
		key: string
		value: { value: unknown; age?: number }
		ttl: number
	}) {
		if (stores.length === 0) {
			return
		}

		const backfillPromise = Promise.allSettled(
			stores.map((store) => store.set(key, value, ttl)),
		)

		_context.waitUntil(backfillPromise)
	}

	const revalidateInBackground = async ({
		queryFn,
		queryKey,
		originalQueryKey,
		ttl = 5 * Time.Minute,
		retry,
		retryDelay,
	}: {
		queryFn: (context?: { signal: AbortSignal }) => Promise<any>
		queryKey: string
		originalQueryKey: QueryKey
		ttl?: number
		retry?: number | false
		retryDelay?: number | RetryDelayFn
	}) => {
		const effectiveRetry = retry !== undefined ? retry : defaultRetry
		// Register the key before the fetch so partial invalidation can evict stale data
		// even if the background fetch fails.
		keyRegistry.set(queryKey, originalQueryKey, { ttl })
		try {
			const existing = revalidating.get(queryKey)
			if (existing) {
				return await existing
			}

			const controller = new AbortController()
			const p = executeWithRetry(() => queryFn({ signal: controller.signal }), {
				retry: effectiveRetry,
				retryDelay: retryDelay ?? defaultRetryDelay,
				signal: controller.signal,
			})
			revalidating.set(queryKey, p)
			const newData = await p

			const _stores = await getStores()

			// update all the stores with the new data
			const storesUpdatedResultsPromise = Promise.allSettled(
				_stores.map(
					async (store) =>
						await store.set(queryKey, { value: newData, age: Date.now() }, ttl),
				),
			)

			_context.waitUntil(storesUpdatedResultsPromise)

			const storesUpdatedResults = await storesUpdatedResultsPromise

			// If any store failed to update, log the error
			storesUpdatedResults.forEach((storeResult) => {
				if (storeResult.status === 'rejected') {
					logger.error(
						new CacheError({
							message: 'Failed to update cache store',
							key: queryKey,
						}),
					)
				}
			})

			// the results are useful in order to append to a waituntil
			// we have to be careful because we don't want to have a huge array of promises around
			// so we need to
			// a) have a timeout for the waituntil
			// b) have a limit of promises in the array
			// c) have a way to clean up the array
			// https://vercel.com/docs/functions/edge-middleware/middleware-api#waituntil
			// https://www.unkey.com/docs/libraries/ts/cache/overview
			return storesUpdatedResults
		} catch {
			logger.error(
				new CacheError({
					message: 'Failed to revalidate cache',
					key: queryKey,
				}),
			)
			// we are in the background so we don't need to throw
			return
		} finally {
			revalidating.delete(queryKey)
		}
	}

	async function dispose() {
		const _stores = await getStores()
		return Promise.allSettled(_stores.map((store) => store.dispose?.()))
	}

	const invalidate = async ({
		queryKey,
		exact = true,
	}: {
		queryKey: any[]
		exact?: boolean
	}) => {
		const stores = await getStores()

		if (exact) {
			const key = hashKey(queryKey)
			keyRegistry.delete(key)
			await Promise.allSettled(stores.map((store) => store.delete(key)))
		} else {
			const matchingKeys: string[] = []
			for (const [hashedKey, originalKey] of keyRegistry.entries()) {
				if (partialMatchKey(originalKey, queryKey)) {
					matchingKeys.push(hashedKey)
				}
			}
			for (const key of matchingKeys) {
				keyRegistry.delete(key)
			}
			await Promise.allSettled(
				matchingKeys.flatMap((key) => stores.map((store) => store.delete(key))),
			)
		}
	}

	const setCacheData = async ({
		queryKey,
		value,
		ttl,
	}: {
		queryKey: any[]
		value: any
		ttl?: number
	}) => {
		const key = hashKey(queryKey)
		keyRegistry.set(key, queryKey, { ttl: ttl ?? defaultTTL })
		const stores = await getStores()
		await Promise.allSettled(
			stores.map((store) =>
				store.set(key, { value, age: Date.now() }, ttl ?? defaultTTL),
			),
		)
	}

	//  a memoize function that uses the function.toString() to generate a key

	function createCachedFunction<T extends (...args: any[]) => any>(
		fn: T,
		options?: CacheQueryOptions,
	) {
		const cachedFunctionSettings = {
			cachePrefix: options?.cachePrefix ?? '',
		}

		async function getCachePrefix() {
			if (!cachedFunctionSettings.cachePrefix) {
				const functionString = fn.toString()
				const functionName = fn.name
				cachedFunctionSettings.cachePrefix = `${functionName}/${await hashString(functionName + functionString)}`
			}
			return cachedFunctionSettings.cachePrefix
		}

		async function cachedFunction(
			...args: Parameters<T>
		): Promise<ReturnType<T> | undefined> {
			// we delay the generation of the cache key until the first call
			// so that we can call createCachedFunction syncrhonously

			const cachePrefix = await getCachePrefix()
			return cacheQuery<ReturnType<T>>({
				queryFn: () => fn(...args),
				queryKey: [cachePrefix, args],
				options,
			})
		}

		cachedFunction.invalidate = async (...args: Parameters<T>) => {
			const cachePrefix = await getCachePrefix()

			await invalidate({ queryKey: [cachePrefix, args] })
		}

		cachedFunction.getCachePrefix = getCachePrefix

		cachedFunction.getCacheKey = async (...args: Parameters<T>) => {
			const cachePrefix = await getCachePrefix()
			return hashKey([cachePrefix, args])
		}

		return cachedFunction
	}

	return {
		cacheQuery,
		invalidate,
		setCacheData,

		createCachedFunction,
		dispose,
		context: _context,
		[Symbol.asyncDispose]: async () => {
			// call dispose on all the stores
			await dispose()
		},
	}
}
