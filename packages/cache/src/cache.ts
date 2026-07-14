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
	/**
	 * Stale-if-error window in milliseconds (RFC 5861). Entries are kept in
	 * storage for `ttl + staleIfError`; past `ttl` they are served ONLY when
	 * revalidation fails, so an origin outage degrades to stale data instead of
	 * errors. Default 0 (off). The window is fixed at write time.
	 */
	staleIfError?: number
	/**
	 * Negative caching: when `queryFn` resolves to null/undefined, cache that
	 * result for this many milliseconds and serve it as fresh for the whole
	 * window (no background revalidation for negatives). Unset (default) means
	 * nullish values are cached like any other value. Rejections are never
	 * cached regardless of this option.
	 */
	nullTTL?: number
	/**
	 * A stable, unique prefix added to the cache key.
	 *
	 * Strongly recommended when used via `createCachedFunction`: without it the
	 * prefix is derived from `fn.toString()`, which collides across closures
	 * from the same factory (wrong-data bug) and rotates the keyspace under
	 * bundler minification. See `createCachedFunction` for details.
	 */
	cachePrefix?: string
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
	/** Default stale-if-error window in milliseconds, see CacheQueryOptions.staleIfError. Default 0 (off) */
	defaultStaleIfError?: number
	/** Default negative-caching window in milliseconds, see CacheQueryOptions.nullTTL. Default unset (nulls cached like values) */
	defaultNullTTL?: number
	/**
	 * Backoff for failed revalidations. When a revalidation rejects, further
	 * attempts for that key are skipped (the stale value keeps being served)
	 * until an exponential backoff with jitter elapses. Only applies when a
	 * stale value exists to serve — a cold miss always retries the origin.
	 * Pass `false` to disable. Default: { initialMs: 1s, maxMs: 30s }.
	 */
	revalidateBackoff?: { initialMs?: number; maxMs?: number } | false
	/** Logger to use for cache errors */
	logger?: Logger
}

const DEFAULT_FRESH = 30 * Time.Second // when data is fresh we don't revalidate
const DEFAULT_TTL = 5 * Time.Minute // how long to keep data in cache
const DEFAULT_BACKOFF_INITIAL = 1 * Time.Second
const DEFAULT_BACKOFF_MAX = 30 * Time.Second
// Backoff state is per-key and in-memory; cap it so a pathological keyspace
// (e.g. per-user keys against a down origin) can't grow the map unbounded.
const MAX_BACKOFF_KEYS = 10_000

// Edge/browser-safe check: `process` may be undefined in those runtimes.
function isDevelopment() {
	return (
		typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'
	)
}

export const createCache = ({
	stores: storesProp,
	getStoresAsync,
	defaultTTL = DEFAULT_TTL,
	defaultFresh = DEFAULT_FRESH,
	defaultStaleIfError = 0,
	defaultNullTTL,
	revalidateBackoff,
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

	const backoffConfig =
		revalidateBackoff === false
			? false
			: {
					initialMs: revalidateBackoff?.initialMs ?? DEFAULT_BACKOFF_INITIAL,
					maxMs: revalidateBackoff?.maxMs ?? DEFAULT_BACKOFF_MAX,
				}
	// Per-key revalidation failure state (per process): while a key is backing
	// off, stale reads skip the origin instead of retrying it on every request.
	const backoffState = new Map<
		string,
		{ failures: number; nextAttemptAt: number }
	>()

	function isBackingOff(key: string) {
		const state = backoffState.get(key)
		return !!state && Date.now() < state.nextAttemptAt
	}

	function recordRevalidateFailure(key: string) {
		if (!backoffConfig) {
			return
		}
		const failures = (backoffState.get(key)?.failures ?? 0) + 1
		const base = Math.min(
			backoffConfig.maxMs,
			backoffConfig.initialMs * 2 ** (failures - 1),
		)
		// equal jitter: [base/2, base) so retries never synchronize but a floor remains
		const delay = base / 2 + Math.random() * (base / 2)
		if (!backoffState.has(key) && backoffState.size >= MAX_BACKOFF_KEYS) {
			// evict the oldest entry (Map preserves insertion order)
			const oldest = backoffState.keys().next().value
			if (oldest !== undefined) {
				backoffState.delete(oldest)
			}
		}
		backoffState.set(key, { failures, nextAttemptAt: Date.now() + delay })
	}

	function recordRevalidateSuccess(key: string) {
		backoffState.delete(key)
	}

	// Track which fresh/ttl combinations we've already warned about so a
	// misconfiguration warns once per distinct pairing instead of every call.
	const warnedFreshTtl = new Set<string>()

	function warnIfFreshExceedsTtl(fresh: number, ttl: number) {
		if (fresh <= ttl) {
			return
		}
		const signature = `${fresh}:${ttl}`
		if (warnedFreshTtl.has(signature)) {
			return
		}
		warnedFreshTtl.add(signature)
		logger.warn(
			`[memocache] fresh (${fresh}ms) is greater than ttl (${ttl}ms): entries expire before they can be served stale, which disables stale-while-revalidate. Set fresh <= ttl.`,
		)
	}

	// Validate the configured defaults up front so the common misconfiguration
	// surfaces immediately rather than silently disabling SWR at query time.
	warnIfFreshExceedsTtl(defaultFresh, defaultTTL)

	/**
	 * Build the stored entry and its storage expiry for a value.
	 *
	 * - `staleIfErrorAt` records (at write time) when the entry stops being
	 *   servable as ordinary stale data and becomes error-only. Entries without
	 *   the field (older writers, direct store.set) keep legacy behavior: any
	 *   hit is servable stale.
	 * - Negative results (nullish + nullTTL configured) live exactly nullTTL
	 *   and never get a stale-if-error window.
	 */
	function buildWriteEntry({
		value,
		ttl,
		staleIfError,
		nullTTL,
	}: {
		value: unknown
		ttl: number
		staleIfError: number
		nullTTL: number | undefined
	}) {
		const isNegative = value == null && nullTTL != null
		const now = Date.now()
		if (isNegative) {
			return {
				entry: { value, age: now, staleIfErrorAt: now + nullTTL },
				storageTtl: nullTTL,
			}
		}
		return {
			entry: { value, age: now, staleIfErrorAt: now + ttl },
			storageTtl: ttl + staleIfError,
		}
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
		queryFn: () => Promise<T>
		queryKey: QueryKey
		options?: CacheQueryOptions
	}): Promise<T> {
		let result = null
		let isFresh = false
		let hitStoreIndex = -1
		const key = hashKey(queryKey)

		const localOptions = {
			...options,
			ttl: options?.ttl ?? defaultTTL,
			fresh: options?.fresh ?? defaultFresh,
			staleIfError: options?.staleIfError ?? defaultStaleIfError,
			nullTTL: options?.nullTTL ?? defaultNullTTL,
		}

		// Per-query overrides can also invert the fresh/ttl relationship.
		warnIfFreshExceedsTtl(localOptions.fresh, localOptions.ttl)

		const _stores = await getStores()

		for (const [index, store] of _stores.entries()) {
			let entry: Awaited<ReturnType<CacheStore['get']>>
			try {
				entry = await store.get(key)
			} catch {
				// a failing cache tier must never take down reads; skip to the next store/origin
				logger.error(
					new CacheError({
						key,
						message: `Failed to read from store ${store.name}`,
					}),
				)
				continue
			}

			if (entry) {
				// keep the stale hit even if a lower-priority store later misses
				result = entry
				hitStoreIndex = index
				const age = entry.age ? Date.now() - entry.age : 0

				// negative entries are fresh for their whole nullTTL window — no
				// background revalidation churn for "not found" results
				const freshWindow =
					entry.value == null && localOptions.nullTTL != null
						? localOptions.nullTTL
						: localOptions.fresh

				if (age < freshWindow) {
					isFresh = true
					break
				}
			}
		}

		if (isFresh) {
			if (hitStoreIndex > 0) {
				const storageWindow =
					result.value == null && localOptions.nullTTL != null
						? localOptions.nullTTL
						: localOptions.ttl + localOptions.staleIfError
				backfillHigherPriorityStores({
					stores: _stores.slice(0, hitStoreIndex),
					key,
					value: result,
					ttl: getRemainingTTL({
						age: result?.age,
						ttl: storageWindow,
					}),
				})
			}
			// isFresh is only set after a store hit assigns result, so it is non-null here
			return result.value // Data is fresh, return from cache
		}

		if (result) {
			// Past the write-time staleIfErrorAt the entry is error-only: it is
			// still in storage because staleIfError extended the expiry, so it may
			// no longer be served as ordinary stale data. Revalidate in the
			// foreground and fall back to the stale value only when the origin fails.
			const isErrorOnly =
				result.staleIfErrorAt != null && Date.now() >= result.staleIfErrorAt

			if (isErrorOnly) {
				if (isBackingOff(key)) {
					return result.value // origin is known-failing, skip the attempt
				}
				try {
					return await fetchFromOrigin<T>({ queryFn, key, localOptions })
				} catch {
					recordRevalidateFailure(key)
					logger.error(
						new CacheError({
							key,
							message: 'Revalidation failed, serving stale (stale-if-error)',
						}),
					)
					return result.value
				}
			}

			// If stale, return from cache and revalidate in the background —
			// unless the key is backing off after failed revalidations, in which
			// case keep serving stale without re-hammering the origin.
			if (!isBackingOff(key)) {
				// register with the context so edge runtimes don't kill the revalidation
				_context.waitUntil(
					revalidateInBackground({
						queryFn,
						queryKey: key,
						localOptions,
					}),
				)
			}
			return result.value // Return stale data
		}

		// No data in cache, fetch from the source. Rejections propagate and are
		// never cached; the next call retries (backoff only applies when a stale
		// value exists to serve instead).
		return fetchFromOrigin<T>({ queryFn, key, localOptions })
	}

	async function fetchFromOrigin<T>({
		queryFn,
		key,
		localOptions,
	}: {
		queryFn: () => Promise<T>
		key: string
		localOptions: { ttl: number; staleIfError: number; nullTTL?: number }
	}): Promise<T> {
		let p: Promise<T> | undefined
		try {
			const existing = revalidating.get(key)
			if (existing) {
				return await existing
			}

			p = queryFn()
			revalidating.set(key, p)
			const newData = await p

			const _stores = await getStores()
			const { entry, storageTtl } = buildWriteEntry({
				value: newData,
				ttl: localOptions.ttl,
				staleIfError: localOptions.staleIfError,
				nullTTL: localOptions.nullTTL,
			})
			const writeToStoresPromise = Promise.allSettled(
				_stores.map((store) => store.set(key, entry, storageTtl)),
			)

			// kick off the store updates in the background
			_context.waitUntil(writeToStoresPromise)

			recordRevalidateSuccess(key)
			return newData
		} finally {
			// only the owner may delete, and only if the entry is still ours —
			// otherwise a reader's finally can evict a newer in-flight promise
			if (p && revalidating.get(key) === p) {
				revalidating.delete(key)
			}
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
		localOptions,
	}: {
		queryFn: () => Promise<any>
		queryKey: string
		// Required: callers pass the resolved options so this can't silently
		// diverge from the cache's defaults.
		localOptions: { ttl: number; staleIfError: number; nullTTL?: number }
	}) => {
		let p: Promise<any> | undefined
		try {
			const existing = revalidating.get(queryKey)
			if (existing) {
				return await existing
			}

			p = queryFn()
			revalidating.set(queryKey, p)
			const newData = await p

			recordRevalidateSuccess(queryKey)

			const _stores = await getStores()

			const { entry, storageTtl } = buildWriteEntry({
				value: newData,
				ttl: localOptions.ttl,
				staleIfError: localOptions.staleIfError,
				nullTTL: localOptions.nullTTL,
			})

			// update all the stores with the new data
			const storesUpdatedResultsPromise = Promise.allSettled(
				_stores.map(
					async (store) => await store.set(queryKey, entry, storageTtl),
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
			recordRevalidateFailure(queryKey)
			logger.error(
				new CacheError({
					message: 'Failed to revalidate cache',
					key: queryKey,
				}),
			)
			// we are in the background so we don't need to throw
			return
		} finally {
			if (p && revalidating.get(queryKey) === p) {
				revalidating.delete(queryKey)
			}
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
		const { entry, storageTtl } = buildWriteEntry({
			value,
			ttl: ttl ?? defaultTTL,
			staleIfError: defaultStaleIfError,
			nullTTL: defaultNullTTL,
		})
		await Promise.allSettled(
			stores.map((store) => store.set(key, entry, storageTtl)),
		)
	}

	/**
	 * Memoize an async function, deriving the cache key prefix from the
	 * function's name and source (`fn.toString()`) when no explicit
	 * `cachePrefix` is provided.
	 *
	 * IMPORTANT — prefer passing an explicit `options.cachePrefix`. The derived
	 * prefix has two hazards:
	 *
	 * 1. **Closure collision (wrong-data bug):** two closures produced by the
	 *    same factory share identical source but capture different state, so
	 *    they derive the *same* prefix and read/write each other's cache
	 *    entries. Example: `makeGetter(tenantA)` and `makeGetter(tenantB)`
	 *    collide unless each gets its own `cachePrefix`.
	 * 2. **Keyspace rotation across deploys:** bundler minification changes
	 *    `fn.toString()` per build, so every deploy (and each side of a rolling
	 *    deploy) uses a fresh keyspace — doubling origin load mid-rollout.
	 *
	 * Pass a stable, unique `cachePrefix` to avoid both.
	 */
	function createCachedFunction<T extends (...args: any[]) => any>(
		fn: T,
		options?: CacheQueryOptions,
	) {
		if (!options?.cachePrefix && isDevelopment()) {
			logger.warn(
				`[memocache] createCachedFunction("${fn.name || 'anonymous'}") has no explicit cachePrefix; the key is derived from fn.toString(). This collides across closures from the same factory and rotates the keyspace when your bundler minifies. Pass options.cachePrefix for stable, unique keys.`,
			)
		}

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
		): Promise<Awaited<ReturnType<T>>> {
			// we delay the generation of the cache key until the first call
			// so that we can call createCachedFunction syncrhonously

			const cachePrefix = await getCachePrefix()
			return cacheQuery<Awaited<ReturnType<T>>>({
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
