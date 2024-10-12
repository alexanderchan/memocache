import { createCache } from '@/cache'
import { createTTLStore } from '@/stores'
import { createSqliteStore } from '@/stores/sqlite'
import { Time } from '@/time'

let count = 0
function hello({ message }: { message: string }) {
  count++
  return `Hello, ${message}, ${count}!`
}

async function main() {
  const store = createTTLStore({
    defaultTTL: 5 * Time.Minute,
  })

  await using cache = createCache({
    stores: [store],
    defaultOptons: { ttl: 10 * Time.Millisecond, fresh: 5 * Time.Millisecond },
  })

  const { createCachedFunction, cacheQuery, dispose } = cache

  const cachedHello = createCachedFunction(hello)

  await cachedHello.invalidate({ message: 'world' })

  console.log(await cachedHello({ message: 'world' }))
  console.log(await cachedHello({ message: 'world' }))

  await new Promise((resolve) =>
    setTimeout(async () => {
      console.log(await cachedHello({ message: 'world' }))
      resolve(null)
    }, 600 * Time.Millisecond),
  )
}

main()
