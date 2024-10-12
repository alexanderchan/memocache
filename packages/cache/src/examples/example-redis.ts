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

class LocalContext implements Context {
  public waitables: Promise<unknown>[] = []

  constructor() {}

  waitUntil(p: Promise<unknown>) {
    this.waitables.push(p)
  }

  async wait() {
    await Promise.all(this.waitables)
  }
}

const localContext = new LocalContext()

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

  await localContext.wait()
  await dispose()
}

main()
