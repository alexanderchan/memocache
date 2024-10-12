import { createCache } from "@/cache"
import { createSqliteStore } from "@/stores/sqlite"
import { Time } from "@/time"
import { createClient } from "@libsql/client"

let count = 0
function hello({ message }: { message: string }) {
  count++
  return `Hello, ${message}, ${count}!`
}

async function main() {
  const sqliteClient = createClient({
    url: "file::memory:",
  })

  await using sqliteStore = createSqliteStore({
    sqliteClient,
    defaultTTL: 5 * Time.Minute,
    cleanupInterval: 5 * Time.Minute,
  })

  const cache = createCache({
    stores: [sqliteStore],
    defaultOptons: { ttl: 10 * Time.Millisecond, fresh: 5 * Time.Millisecond },
  })

  const { createCachedFunction, cacheQuery, dispose } = cache

  const cachedHello = createCachedFunction(hello)

  await cachedHello.invalidate({ message: "world" })

  console.log(await cachedHello({ message: "world" }))
  console.log(await cachedHello({ message: "world" }))

  await new Promise((resolve) =>
    setTimeout(async () => {
      console.log(await cachedHello({ message: "world" }))
      resolve(null)
    }, 600 * Time.Millisecond),
  )
}

main()
