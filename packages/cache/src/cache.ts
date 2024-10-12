import { wrap } from './error'

import { CacheError } from './error/cache-error'
import { hashKey, QueryKey } from './hash-key'
import { createHash } from 'node:crypto'
import { Time } from './time'
import { Context, DefaultStatefulContext } from '@/context'

export interface CacheStore extends AsyncDisposable {
  set(key: string, value: any, ttl?: number): Promise<void>
  get(key: string): Promise<any>
  delete(key: string): Promise<void>

  /** Remove all values from the store */
  clear?(): Promise<void>
  /** dispose of any resources or connections when the cache is no longer in use */
  dispose?(): Promise<void>
  /** For debugging return the entries in the cache */
  entries?(): Promise<any[]>
}

export function hashString(str: string) {
  return createHash('SHA256').update(str).digest('hex')
}

// we need a stable key for the function
function generateFunctionKey(fn: Function): string {
  const functionStr = fn.toString()

  // SHA256 should be node crypto hardware optimized, MD5 is another option
  return hashString(functionStr)
}

type CacheQueryOptions = { ttl?: number; fresh?: number }
interface CacheOptions {
  stores: CacheStore[]
  context?: Context
  defaultOptons?: CacheQueryOptions
}

const DEFAULT_FRESH = 10 * Time.Minute
const DEFAULT_TTL = 5 * Time.Minute

export const createCache = ({
  stores,
  defaultOptons,
  context,
}: CacheOptions) => {
  let _context = context || new DefaultStatefulContext()

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
      ttl: options?.ttl ?? defaultOptons?.ttl ?? DEFAULT_TTL,
      fresh: options?.fresh ?? defaultOptons?.fresh ?? DEFAULT_FRESH,
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
    await Promise.all(
      stores.map((store) =>
        store.set(key, { value: newData, age: Date.now() }, localOptions?.ttl),
      ),
    )
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
    const newData = await wrap(
      await queryFn(),
      (err: Error) => new CacheError({ message: err.message, key: queryKey }),
    )
    if (newData?.err) {
      return
    }

    // update all the stores with the new data
    const storesUpdatedResultsPromise = Promise.allSettled(
      stores.map(
        async (store) =>
          await store.set(
            queryKey,
            { value: newData?.val, age: Date.now() },
            ttl,
          ),
      ),
    )

    const storesUpdatedResults = await storesUpdatedResultsPromise

    _context.waitUntil(storesUpdatedResultsPromise)

    // If any store failed to update, log the error
    storesUpdatedResults.forEach((storeResult) => {
      if (storeResult.status === 'rejected') {
        console.error(
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
  }

  function dispose() {
    return Promise.all(stores.map((store) => store.dispose?.()))
  }

  //  a memoize function that uses the function.toString() to generate a key

  function createCachedFunction<T extends (...args: any[]) => any>(
    fn: T,
    options?: CacheQueryOptions,
  ) {
    const key = generateFunctionKey(fn)

    function cachedFunction(...args: Parameters<T>): Promise<ReturnType<T>> {
      return cacheQuery({
        queryFn: () => fn.apply(undefined, args),
        queryKey: [key, args],
        options,
      })
    }

    cachedFunction.cacheKey = key
    cachedFunction.uncached = fn
    cachedFunction.delete = async (...args: Parameters<T>) => {
      const key = hashKey([generateFunctionKey(fn), args])
      await Promise.all(stores.map((store) => store.delete(key)))
    }

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