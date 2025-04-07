import { createCache } from '@alexmchan/memocache'
import { Context, Time } from '@alexmchan/memocache-common'
import { Redis } from 'ioredis'

import { createRedisStore } from '../stores/redis.js'

//**----------------------------------------------------
/* This is a simple context and only for serverless environments
/* where the list of waitables won't grow indefinitely
/*--------------------------------------------------**/
class SimpleContext implements Context {
  public waitables: Promise<unknown>[] = []

  waitUntil(p: Promise<unknown>) {
    this.waitables.push(p)

    if (this.waitables.length > 1000) {
      this.flushCache()
    }
  }

  async flushCache() {
    await Promise.allSettled(this.waitables)
    this.waitables = []
  }

  [Symbol.asyncDispose]() {
    return this.flushCache()
  }
}

async function main() {
  const redisStore = createRedisStore({
    redisClient: new Redis({
      host: 'localhost',
      port: 6379,
    }),
    defaultTTL: 5 * Time.Minute,
  })

  const localContext = new SimpleContext()

  const cache = createCache({
    stores: [redisStore],
    // really low for testing make these higher
    defaultFresh: 200 * Time.Millisecond,
    defaultTTL: 2 * Time.Second,
    context: localContext,
  })

  const { createCachedFunction } = cache

  let count = 0
  function hello({ message }: { message: string }) {
    count++
    return `Hello, ${message}, ${count}!`
  }

  const cachedHello = createCachedFunction(hello)

  await cachedHello.invalidate({ message: 'world' })

  console.log(await cachedHello({ message: 'world' }))
  console.log(await cachedHello({ message: 'world' }))

  await new Promise((resolve) =>
    setTimeout(async () => {
      console.log(await cachedHello({ message: 'world' }))
      resolve(null)
    }, 2000 * Time.Millisecond),
  )

  await localContext.flushCache()
  await cache.dispose()
}

main()
