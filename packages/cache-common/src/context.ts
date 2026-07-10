export interface Context {
	waitUntil: (p: Promise<unknown>) => void
}

export class DefaultStatefulContext implements Context {
	private promises: Promise<unknown>[] = []

	public waitUntil<TPromise = unknown>(_p: Promise<TPromise>) {
		// a placeholder for an actual implementation of waitUtil that would be provided by the runtime environment
		// https://vercel.com/docs/functions/edge-middleware/middleware-api#waituntil
		this.promises.push(_p)

		// drop settled promises so long-running processes don't retain them forever
		_p.finally(() => {
			const index = this.promises.indexOf(_p)
			if (index !== -1) {
				this.promises.splice(index, 1)
			}
		}).catch(() => {
			// the finally-derived promise re-rejects; swallow to avoid an unhandled rejection
		})
	}

	async flush() {
		await Promise.allSettled(this.promises)
		this.promises = []
	}

	[Symbol.asyncDispose]() {
		return this.flush()
	}
}
