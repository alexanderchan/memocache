import { Time } from '@alexmchan/memocache-common'
import { createClient } from '@libsql/client'

import { createCache } from '@/cache'
import { createMetricsStore } from '@/middleware'
import { createSqliteStore } from '@/stores/sqlite'

let count = 0
function hello({ message }: { message: string }) {
  count++
  return `Hello, ${message}, ${count}!`
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

  const metricsSqliteStore = createMetricsStore({
    store: sqliteStore,
  })

  const cache = createCache({
    stores: [metricsSqliteStore],
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
