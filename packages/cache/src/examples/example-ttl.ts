import { createCache } from '@/cache'
import { createTTLStore } from '@/stores'

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
    // really low for testing make these higher
    defaultFresh: 200 * Time.Millisecond,
    defaultTTL: 2 * Time.Second,
  })

  const { createCachedFunction } = cache

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
