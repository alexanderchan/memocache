import { createCache } from '@alexmchan/memocache'
import { Time } from '@alexmchan/memocache-common'
import { createClient } from '@libsql/client'

import { createSqliteStore } from '../stores/sqlite.js'

let count = 0
function hello({ message }: { message: string }) {
  count++
  return `Hello, ${message}, call count: ${count}!`
}

async function main() {
  const sqliteClient = createClient({
    url: 'file::memory:',
  })

  await using sqliteStore = createSqliteStore({
    sqliteClient,
    defaultTTL: 5 * Time.Minute,
    cleanupInterval: 5 * Time.Minute,
  })

  const cache = createCache({
    stores: [sqliteStore],
    // really low for testing make these higher
    defaultFresh: 200 * Time.Millisecond,
    defaultTTL: 2 * Time.Second,
  })

  const { createCachedFunction } = cache

  const cachedHello = createCachedFunction(hello)

  await cachedHello.invalidate({ message: 'world' })

  console.log(await cachedHello({ message: 'world' }))
  console.log(await cachedHello({ message: 'world' }))

  // Try with a different message
  console.log(await cachedHello({ message: 'cache enthusiast' }))
  console.log(await cachedHello({ message: 'cache enthusiast' }))

  await new Promise((resolve) =>
    setTimeout(async () => {
      console.log(await cachedHello({ message: 'world' }))
      console.log(await cachedHello({ message: 'cache enthusiast' }))
      resolve(null)
    }, 600 * Time.Millisecond),
  )
}

main()
