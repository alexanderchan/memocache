import { createCache } from '@/cache'
import { Context } from '@/context'
import { createEncryptedStore } from '@/middleware/encryption'
import { Redis } from 'ioredis'

import { createRedisStore } from '@/stores'
import { Time } from '@/time'

const redisStore = createRedisStore({
  redisClient: new Redis({
    host: 'localhost',
    port: 6379,
  }),
  defaultTTL: 5 * Time.Minute,
})

const encryptedRedisStore = createEncryptedStore({
  store: redisStore,
  key: 'my-secret',
  salt: 'my-salt',
})

//**----------------------------------------------------
/* This is a simple context and only for serverless environments
/* where the list of waitables won't grow indefinitely
/*--------------------------------------------------**/
class SimpleContext implements Context {
  public waitables: Promise<unknown>[] = []

  constructor() {}

  waitUntil(p: Promise<unknown>) {
    this.waitables.push(p)
  }

  async flushCache() {
    await Promise.allSettled(this.waitables)
    this.waitables = []
  }

  [Symbol.asyncDispose]() {
    return this.flushCache()
  }
}

const localContext = new SimpleContext()

export const { createCachedFunction, cacheQuery, dispose } = createCache({
  stores: [encryptedRedisStore],
  defaultOptons: { ttl: 2 * Time.Second, fresh: 200 * Time.Millisecond },
  context: localContext,
})

let count = 0
function hello({ message }: { message: string }) {
  count++
  return `Hello, ${message}, ${count}!`
}

const cachedHello = createCachedFunction(hello)

async function main() {
  cachedHello.delete({ message: 'world' })

  console.log(await cachedHello({ message: 'world' }))
  console.log(await cachedHello({ message: 'world' }))

  await new Promise((resolve) =>
    setTimeout(async () => {
      console.log(await cachedHello({ message: 'world' }))
      resolve(null)
    }, 2000 * Time.Millisecond),
  )

  await localContext.flushCache()
  await dispose()
}

main()
