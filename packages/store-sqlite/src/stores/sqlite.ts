import { DatabaseSync, type StatementSync } from 'node:sqlite'

import {
	type CacheStore,
	defaultLogger,
	type Logger,
	Time,
} from '@alexmchan/memocache-common'
import superjson from 'superjson'

export interface SqliteStoreConfig {
	/**
	 * An existing `node:sqlite` `DatabaseSync` instance to use. When provided it
	 * is treated as caller-owned and is not closed on dispose.
	 */
	database?: DatabaseSync
	/**
	 * Location for a database to open when `database` is not provided. Defaults
	 * to `':memory:'`. Pass a file path (e.g. `'./cache.db'`) for persistence.
	 */
	location?: string
	/** Name of the table to create. Defaults to `cache`. */
	tableName?: string
	/** Interval in milliseconds for cleaning up expired entries. */
	cleanupInterval?: number
	/** Default time-to-live for cache entries in milliseconds. */
	defaultTTL?: number
	logger?: Logger
}

interface SqliteStore extends CacheStore {
	cleanup(): Promise<void>
	startCleanupInterval(): void
}

/**
 * Creates a cache store backed by the Node.js standard-library `node:sqlite`
 * module — zero external dependencies. Requires Node.js >= 24 (the module is
 * available, still marked experimental, and emits a warning on import).
 */
export function createSqliteStore({
	database: databaseProp,
	location = ':memory:',
	tableName = 'cache',
	defaultTTL = 5 * Time.Minute,
	cleanupInterval = 5 * Time.Minute,
	logger = defaultLogger,
}: SqliteStoreConfig = {}): SqliteStore {
	// Validate tableName to prevent SQL injection (it is interpolated into DDL).
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
		throw new Error(
			`Invalid tableName: "${tableName}". Only alphanumeric characters and underscores are allowed.`,
		)
	}

	let cleanupIntervalId: NodeJS.Timeout | undefined

	// Track whether we opened the database ourselves. An injected database is
	// caller-owned and must not be closed on dispose.
	const ownsDatabase = !databaseProp
	const database = databaseProp ?? new DatabaseSync(location)

	// node:sqlite is synchronous, so initialization can happen eagerly at
	// construction — no lazy async init dance needed.
	database.exec(`
		CREATE TABLE IF NOT EXISTS ${tableName} (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			expires INTEGER
		)
	`)
	database.exec(
		`CREATE INDEX IF NOT EXISTS idx_${tableName}_expires ON ${tableName}(expires)`,
	)

	// Prepared statements are reused across calls.
	const setStatement: StatementSync = database.prepare(
		`INSERT OR REPLACE INTO ${tableName} (key, value, expires) VALUES (?, ?, ?)`,
	)
	const getStatement: StatementSync = database.prepare(
		`SELECT value, expires FROM ${tableName} WHERE key = ?`,
	)
	const deleteStatement: StatementSync = database.prepare(
		`DELETE FROM ${tableName} WHERE key = ?`,
	)
	const cleanupStatement: StatementSync = database.prepare(
		`DELETE FROM ${tableName} WHERE expires < ?`,
	)
	const clearStatement: StatementSync = database.prepare(
		`DELETE FROM ${tableName}`,
	)

	const cleanup = async () => {
		cleanupStatement.run(Date.now())
	}

	const dispose = async () => {
		if (cleanupIntervalId) {
			clearInterval(cleanupIntervalId)
			cleanupIntervalId = undefined
		}
		try {
			cleanupStatement.run(Date.now())
		} catch (error) {
			logger.error('Failed to run final SQLite cleanup on dispose:', error)
		}
		// Only close a database we opened; an injected one is caller-owned.
		if (ownsDatabase) {
			database.close()
		}
	}

	const store: SqliteStore = {
		name: 'node-sqlite',
		async set(key: string, value: any, ttl?: number): Promise<void> {
			const expires = Date.now() + (ttl ?? defaultTTL)
			setStatement.run(key, superjson.stringify(value), expires)
		},

		async get(key: string): Promise<any> {
			const row = getStatement.get(key) as
				| { value: string; expires: number | bigint | null }
				| undefined

			if (!row) {
				return undefined
			}

			if (row.expires !== null && Number(row.expires) < Date.now()) {
				// Expired: drop the entry and report a miss. Guarded so a failed
				// delete degrades to a miss instead of throwing.
				try {
					deleteStatement.run(key)
				} catch (error) {
					logger.error('Failed to delete expired SQLite entry:', error)
				}
				return undefined
			}

			return superjson.parse(row.value)
		},

		async delete(key: string) {
			deleteStatement.run(key)
		},

		startCleanupInterval(): void {
			if (cleanupIntervalId) {
				clearInterval(cleanupIntervalId)
			}
			cleanupIntervalId = setInterval(() => {
				this.cleanup().catch(logger.error)
			}, cleanupInterval)
			// Don't let the cleanup timer keep the Node event loop alive.
			cleanupIntervalId.unref?.()
		},
		async clear() {
			clearStatement.run()
		},
		cleanup,
		dispose,
		async [Symbol.asyncDispose]() {
			await dispose()
		},
	}

	store.startCleanupInterval()

	return store
}
