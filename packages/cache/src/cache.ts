import {
	type CacheStore,
	type Context,
	DefaultStatefulContext,
	defaultLogger,
	hashKey,
	hashString,
	type Logger,
	type QueryKey,
	Time,
} from '@alexmchan/memocache-common'

import { createTTLStore } from '@/stores'

import { CacheError } from './error/cache-error'

interface CacheQueryOptions {
	/** Time to live (expiry) in milliseconds from now to expire a record if no other overrides are provided */
	ttl?: number
	/** Time in milliseconds to consider data fresh and not revalidate.  Fresh data is served and no request to the backend will be made */
	fresh?: number
	/** A prefix to add to the cache key */
	cachePrefix?: string
	/** An array of keys to ignore when hashing the query key */
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
}: CacheOptions = {}) => {
	// Only use the default in-memory store when no async store factory is provided
	const stores =
		storesProp ??
		(!getStoresAsync ? [createTTLStore({ defaultTTL })] : undefined)
	const _context = context || new DefaultStatefulContext()

	const _stores: CacheStore[] = []
	let initPromise: Promise<CacheStore[]> | undefined
	const revalidating = new Map<string, Promise<any>>()

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
		queryFn: () => Promise<T>
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
			revalidateInBackground({ queryFn, queryKey: key, ttl: localOptions?.ttl })
			return result.value // Return stale data
		}

		// No data in cache, fetch from the source
		try {
			const existing = revalidating.get(key)
			if (existing) {
				return await existing
			}

			const p = queryFn()
			revalidating.set(key, p)
			const newData = await p

			const writeToStoresPromise = Promise.allSettled(
				_stores.map((store) =>
					store.set(
						key,
						{ value: newData, age: Date.now() },
						localOptions?.ttl,
					),
				),
			)

			// kick off the store updates in the background
			_context.waitUntil(writeToStoresPromise)

			return newData
		} finally {
			revalidating.delete(key)
		}
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
		ttl = 5 * Time.Minute,
	}: {
		queryFn: () => Promise<any>
		queryKey: string
		ttl?: number
	}) => {
		try {
			const existing = revalidating.get(queryKey)
			if (existing) {
				return await existing
			}

			const p = queryFn()
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

	const invalidate = async ({ queryKey }: { queryKey: any[] }) => {
		const key = hashKey(queryKey)
		const stores = await getStores()

		await Promise.allSettled(stores.map((store) => store.delete(key)))
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
