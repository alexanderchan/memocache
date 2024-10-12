export interface Context {
  waitUntil: (p: Promise<unknown>) => void
}

export class DefaultStatefulContext implements Context {
  lastPromise: Promise<unknown> = Promise.resolve()

  public waitUntil<TPromise = unknown>(_p: Promise<TPromise>) {
    // a placeholder for an actual implementation of waitUtil that would be provided by the runtime environment
    // https://vercel.com/docs/functions/edge-middleware/middleware-api#waituntil
    this.lastPromise = _p
  }

  async flush() {
    await this.lastPromise
  }

  [Symbol.asyncDispose]() {
    return this.flush()
  }
}
