import { CacheStore, defaultLogger } from '@alexmchan/memocache-common'

// Define the Logger interface
interface Logger {
  log(message: string, data: any): void
}

// Define the Metric type
type Metric =
  | {
      metric: 'cache.read'
      key: string
      hit: boolean
      latency: number
      store: string
    }
  | {
      metric: 'cache.miss'
      key: string
      hit: boolean
      latency: number | undefined
      store: string
    }
  | {
      metric: 'cache.write'
      key: string
      latency: number
      store: string
    }
  | {
      metric: 'cache.delete'
      key: string
      latency: number
      store: string
    }

// Create the middleware function
export function createMetricsStore({
  logger = defaultLogger,
  store,
}: {
  logger?: Logger
  store: CacheStore
}) {
  return new StoreWithMetrics({ store, logger })
}

export class StoreWithMetrics implements CacheStore {
  private store: CacheStore
  private logger: Logger
  name: string

  constructor({ store, logger }: { store: CacheStore; logger: Logger }) {
    this.name = store.name
    this.store = store
    this.logger = logger
  }

  async get(key: string): Promise<any> {
    const start = performance.now()
    let result
    let latency
    try {
      result = await this.store.get(key)
      latency = Math.round(performance.now() - start)
    } catch (e) {
      latency = Math.round(performance.now() - start)
      this.logger.log('Metric', {
        metric: 'cache.miss',
        key,
        hit: false,
        latency,
        store: this.name,
      } satisfies Metric)

      throw e
    }

    this.logger.log('Metric', {
      metric: 'cache.read',
      key,
      hit: result !== undefined,
      latency,
      store: this.name,
    } satisfies Metric)

    return result
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const start = performance.now()
    await this.store.set(key, value, ttl)
    const latency = Math.round(performance.now() - start)

    this.logger.log('Metric', {
      metric: 'cache.write',
      key,
      latency,
      store: this.name,
    } satisfies Metric)
  }

  async delete(key: string): Promise<void> {
    const start = performance.now()
    await this.store.delete(key)
    const latency = Math.round(performance.now() - start)

    this.logger.log('Metric', {
      metric: 'cache.delete',
      key,
      latency,
      store: this.name,
    } satisfies Metric)
  }

  async dispose() {
    return this.store.dispose?.()
  }

  async [Symbol.asyncDispose]() {
    return this.dispose()
  }
}
