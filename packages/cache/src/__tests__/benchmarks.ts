import { createEncryptedStore } from '@/middleware/encryption'
import { createRedisStore, createTTLStore } from '@/stores'
import { Time } from '@/time'
import { performance } from 'perf_hooks'
import { Redis } from 'ioredis'
import { createSqliteStore } from '@/stores/sqlite'
import { createUpstashRedisStore } from '@/stores/upstash-redis'
import { createClient } from '@libsql/client'

// Function to run the benchmark
async function runBenchmark(store: any, iterations: number) {
  const key = 'testKey'
  const value = 'abcdefghijklmnopqrstuv'

  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await store.set(key, value)
    await store.get(key, value)
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

// Main benchmark function
async function benchmark() {
  // Create memoized store
  await using memoizedStore = createEncryptedStore({
    store: createTTLStore({ defaultTTL: 60 * Time.Minute }),
    key: 'testEncryptionKey',
    salt: 'testSalt',
    shouldUseMemoize: true,
  })

  // Create non-memoized store
  await using nonMemoizedStore = createEncryptedStore({
    store: createTTLStore({ defaultTTL: 60 * Time.Minute }),
    key: 'testEncryptionKey',
    salt: 'testSalt',
    shouldUseMemoize: false,
  })

  await using redisStore = createRedisStore({
    redisClient: new Redis({ host: 'localhost', port: 6379 }),
    defaultTTL: 5 * Time.Minute,
  })

  await using ttlStore = createTTLStore({
    defaultTTL: 5 * Time.Minute,
  })

  await using sqliteStore = createSqliteStore({
    defaultTTL: 5 * Time.Minute,
  })

  await using sqliteDiskStore = createSqliteStore({
    sqliteClient: createClient({
      url: 'file:./ignore-test.db',
      concurrency: 2,
    }),
    defaultTTL: 5 * Time.Minute,
  })

  const stores = [
    {
      name: 'TTL store',
      store: ttlStore,
    },
    {
      name: 'SQLite memory store',
      store: sqliteStore,
    },
    {
      name: 'SQLite disk store',
      store: sqliteDiskStore,
    },
    {
      name: 'Redis store',
      store: redisStore,
    },
    {
      name: 'Memoized encrypted TTL store',
      store: memoizedStore,
    },
    {
      name: 'Non-memoized encrypted TTL store',
      store: nonMemoizedStore,
    },
  ]

  if (process.env.UPSTASH_REDIS_REST_URL) {
    const redisRestStore = createUpstashRedisStore({
      defaultTTL: 5 * Time.Minute,
    })

    stores.push({
      name: 'Redis REST store',
      store: redisRestStore,
    })
  }

  async function runAllBenchmarks({ iterations }: { iterations: number }) {
    for (const { name, store } of stores) {
      console.info(`Running benchmark for ${name}...`)
      const results = await runBenchmark(store, iterations)

      // Calculate and print results
      const avgTime = results.reduce((a, b) => a + b, 0) / results.length
      console.info(`${name} average time: ${avgTime.toFixed(3)}ms`)
    }
  }

  await runAllBenchmarks({ iterations: 100_000 })
}

// Run the benchmark
benchmark().catch(console.error)
