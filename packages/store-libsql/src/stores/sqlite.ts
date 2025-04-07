import {
  CacheStore,
  defaultLogger,
  Logger,
  Time,
} from '@alexmchan/memocache-common'
import { Client as SqliteClient, createClient } from '@libsql/client'
import superjson from 'superjson'

export interface SqliteStoreConfig {
  /** libSql SQLite client configuration
   *  https://docs.turso.tech/sdk/ts/reference
   */
  sqliteClient?: SqliteClient
  /** Name of the table to create defaults to `cache` */
  tableName?: string
  /** Cleanup interval */
  cleanupInterval?: number
  /** Default time-to-live for cache entries */
  defaultTTL?: number
  logger?: Logger
}

interface SqliteStore extends CacheStore {
  cleanup(): Promise<void>
  startCleanupInterval(): void
}

/**
 * Creates an sqlite store
 */
export function createSqliteStore({
  sqliteClient: sqliteClientProp,
  tableName = 'cache',
  defaultTTL = 5 * Time.Minute,
  cleanupInterval = 5 * Time.Minute,
  logger = defaultLogger,
}: SqliteStoreConfig = {}): SqliteStore {
  let cleanupIntervalId: NodeJS.Timeout
  let hasInitializedDb = false

  const sqliteClient =
    sqliteClientProp ||
    createClient({
      url: 'file::memory:',
    })

  const initDb = async () => {
    try {
      await sqliteClient.execute(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              expires INTEGER
            )
          `)
    } catch (error) {
      logger.error('Failed to initialize SQLite store:', error)
    }

    try {
      await sqliteClient.execute(`
            CREATE INDEX IF NOT EXISTS idx_${tableName}_expires ON ${tableName}(expires)
          `)
    } catch (error) {
      logger.error('Failed to create index on SQLite store:', error)
    }
  }

  const lazyInit = async () => {
    if (!hasInitializedDb) {
      await initDb()
      hasInitializedDb = true
    }
  }

  const cleanup = async () => {
    await lazyInit()
    await sqliteClient.execute({
      sql: `DELETE FROM ${tableName} WHERE expires < ?`,
      args: [Date.now()],
    })
  }

  const dispose = async () => {
    if (cleanupIntervalId) {
      cleanup().catch(logger.error)
      clearInterval(cleanupIntervalId)
    }
  }

  const store: SqliteStore = {
    name: 'sqlite',
    async set(key: string, value: any, ttl?: number): Promise<void> {
      await lazyInit()
      const _ttl = ttl ?? defaultTTL
      const expires = Date.now() + _ttl

      await sqliteClient.execute({
        sql: `INSERT OR REPLACE INTO ${tableName} (key, value, expires) VALUES (?, ?, ?)`,
        args: [key, superjson.stringify(value), expires],
      })
    },

    async get(key: string): Promise<any | null> {
      await lazyInit()
      const result = await sqliteClient.execute({
        sql: `SELECT value, expires FROM ${tableName} WHERE key = ?`,
        args: [key],
      })

      if (result.rows.length === 0) {
        return undefined
      }

      const row = result.rows[0]
      if (row.expires && Number(row.expires) < Date.now()) {
        // If expired, delete the entry and return null
        // we don't need to wait for the delete to finish
        this.delete(key)
        return undefined
      }

      return superjson.parse(row.value as string)
    },

    async delete(key: string) {
      await lazyInit()

      return sqliteClient.execute({
        sql: `DELETE FROM ${tableName} WHERE key = ?`,
        args: [key],
      })
    },

    startCleanupInterval(): void {
      if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId)
      }
      cleanupIntervalId = setInterval(() => {
        this.cleanup().catch(logger.error)
      }, cleanupInterval)
    },
    clear: async () => {
      await sqliteClient.execute(`DELETE FROM ${tableName}`)
    },
    cleanup,
    dispose,
    async [Symbol.asyncDispose]() {
      await dispose()
    },
  }

  // Start the cleanup interval
  store.startCleanupInterval()

  return store
}
