import { DatabaseSync } from 'node:sqlite'

import { createCache } from '@alexmchan/memocache'
import { Time } from '@alexmchan/memocache-common'

import { createSqliteStore } from '../stores/sqlite.js'

let count = 0
function hello({ message }: { message: string }) {
	count++
	return `Hello, ${message}, call count: ${count}!`
}

async function main() {
	// Bring your own database (file-backed for persistence)...
	const database = new DatabaseSync(':memory:')

	await using sqliteStore = createSqliteStore({
		database,
		defaultTTL: 5 * Time.Minute,
		cleanupInterval: 5 * Time.Minute,
	})

	// ...or let the store open one: createSqliteStore({ location: './cache.db' })

	const cache = createCache({
		stores: [sqliteStore],
		// really low for testing make these higher
		defaultFresh: 200 * Time.Millisecond,
		defaultTTL: 400 * Time.Millisecond,
	})

	const { createCachedFunction } = cache

	const cachedHello = createCachedFunction(hello, {
		cachePrefix: '/example/hello',
	})

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
