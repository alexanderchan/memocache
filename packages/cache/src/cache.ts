import { Context, DefaultStatefulContext } from '@/context'
import { hashString } from '@/hash-string'
import { defaultLogger, Logger } from '@/logger'

import { CacheError } from './error/cache-error'
import { hashKey, QueryKey } from './hash-key'
import { Time } from './time'

export interface CacheStore extends AsyncDisposable {
  /** a name for metrics */
  name: string
  /** Set a value in the store, ttl in milliseconds */
  set(key: string, value: any, ttl?: number): Promise<any>
  get(key: string): Promise<any>
  delete(key: string): Promise<unknown>

  /** Remove all values from the store */
  clear?(): Promise<any>
  /** dispose of any resources or connections when the cache is no longer in use */
  dispose?(): Promise<any>
}

interface CacheQueryOptions {
  ttl?: number
  fresh?: number
  cachePrefix?: string
}
interface CacheOptions {
  stores: CacheStore[]
  context?: Context
  defaultTTL?: number
  defaultFresh?: number
  logger?: Logger
}

const DEFAULT_FRESH = 30 * Time.Second // when data is fresh we don't revalidate
const DEFAULT_TTL = 5 * Time.Minute // how long to keep data in cache

export const createCache = ({
  stores,
  defaultTTL = DEFAULT_TTL,
  defaultFresh = DEFAULT_FRESH,
  logger = defaultLogger,
  context,
}: CacheOptions) => {
  const _context = context || new DefaultStatefulContext()

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  async function cacheQuery<T extends Function>({
    queryFn,
    queryKey,
    options,
  }: {
    queryFn: () => Promise<T>
    queryKey: QueryKey
    options?: CacheQueryOptions
  }) {
    let result = null
    let isFresh = false
    const key = hashKey(queryKey)

    const localOptions = {
      ttl: options?.ttl ?? defaultTTL,
      fresh: options?.fresh ?? defaultFresh,
      ...options,
    }

    for (const store of stores) {
      result = await store.get(key)

      if (result) {
        const age = result.age ? Date.now() - result.age : 0

        if (age < localOptions.fresh) {
          isFresh = true
          break
        }
      }
    }

    if (isFresh) {
      return result?.value // Data is fresh, return from cache
    }

    // If stale, return from cache and revalidate in the background
    if (result) {
      revalidateInBackground({ queryFn, queryKey: key, ttl: localOptions?.ttl })
      return result.value // Return stale data
    }

    // No data in cache, fetch from the source

    const newData = await queryFn()

    const writeToStoresPromise = Promise.allSettled(
      stores.map((store) =>
        store.set(key, { value: newData, age: Date.now() }, localOptions?.ttl),
      ),
    )

    // kick off the store updates in the background
    context?.waitUntil?.(writeToStoresPromise)

    return newData
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
    let newData: any
    try {
      newData = await queryFn()

      // update all the stores with the new data
      const storesUpdatedResultsPromise = Promise.allSettled(
        stores.map(
          async (store) =>
            await store.set(queryKey, { value: newData, age: Date.now() }, ttl),
        ),
      )

      const storesUpdatedResults = await storesUpdatedResultsPromise

      _context.waitUntil(storesUpdatedResultsPromise)

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
    }
  }

  function dispose() {
    return Promise.allSettled(stores.map((store) => store.dispose?.()))
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
        cachedFunctionSettings.cachePrefix = await hashString(fn?.toString())
      }
      return cachedFunctionSettings.cachePrefix
    }

    async function cachedFunction(
      ...args: Parameters<T>
    ): Promise<ReturnType<T>> {
      // we delay the generation of the cache key until the first call
      // so that we can call createCachedFunction syncrhonously

      const cachePrefix = await getCachePrefix()

      return cacheQuery({
        queryFn: () => fn(...args),
        queryKey: [cachePrefix, args],
        options,
      })
    }

    cachedFunction.invalidate = async (...args: Parameters<T>) => {
      const cachePrefix = await getCachePrefix()
      const key = hashKey([cachePrefix, args])

      await Promise.allSettled(stores.map((store) => store.delete(key)))
    }

    cachedFunction.getCachePrefix = getCachePrefix

    return cachedFunction
  }

  return {
    cacheQuery,
    createCachedFunction,
    dispose,
    context: _context,
    [Symbol.asyncDispose]: async () => {
      // call dispose on all the stores
      await dispose()
    },
  }
}
