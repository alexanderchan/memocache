import { describe, expect, it, vi } from 'vitest'

import { DefaultStatefulContext } from '@/context'

describe('DefaultStatefulContext', () => {
	it('waitUntil + flush lifecycle - single promise', async () => {
		const ctx = new DefaultStatefulContext()
		let resolved = false

		const p = new Promise<void>((resolve) => {
			setTimeout(() => {
				resolved = true
				resolve()
			}, 0)
		})

		ctx.waitUntil(p)
		expect(resolved).toBe(false)

		await ctx.flush()
		expect(resolved).toBe(true)
	})

	it('tracks multiple promises and awaits all of them on flush', async () => {
		const ctx = new DefaultStatefulContext()
		const results: number[] = []

		ctx.waitUntil(Promise.resolve().then(() => results.push(1)))
		ctx.waitUntil(Promise.resolve().then(() => results.push(2)))
		ctx.waitUntil(Promise.resolve().then(() => results.push(3)))

		await ctx.flush()
		expect(results).toHaveLength(3)
		expect(results).toContain(1)
		expect(results).toContain(2)
		expect(results).toContain(3)
	})

	it('clears promises after flush so a second flush does not re-await them', async () => {
		const ctx = new DefaultStatefulContext()
		let callCount = 0

		ctx.waitUntil(Promise.resolve().then(() => callCount++))

		await ctx.flush()
		expect(callCount).toBe(1)

		// second flush — no new promises were added, count must remain 1
		await ctx.flush()
		expect(callCount).toBe(1)
	})

	it('[Symbol.asyncDispose] calls flush', async () => {
		const ctx = new DefaultStatefulContext()
		const flushSpy = vi.spyOn(ctx, 'flush')

		await ctx[Symbol.asyncDispose]()

		expect(flushSpy).toHaveBeenCalledOnce()
	})

	it('drops settled promises so long-running processes do not retain them', async () => {
		const ctx = new DefaultStatefulContext()

		ctx.waitUntil(Promise.resolve('done'))
		ctx.waitUntil(Promise.reject(new Error('intentional failure')))

		// let the finally callbacks run
		await new Promise((resolve) => setTimeout(resolve, 0))

		expect((ctx as any).promises).toHaveLength(0)

		// pending promises are still retained until they settle
		let resolvePending: (() => void) | undefined
		ctx.waitUntil(
			new Promise<void>((resolve) => {
				resolvePending = resolve
			}),
		)
		expect((ctx as any).promises).toHaveLength(1)
		resolvePending?.()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect((ctx as any).promises).toHaveLength(0)
	})

	it('handles rejected promises gracefully (allSettled does not throw)', async () => {
		const ctx = new DefaultStatefulContext()

		ctx.waitUntil(Promise.reject(new Error('intentional failure')))
		ctx.waitUntil(Promise.resolve('ok'))

		// Should not throw
		await expect(ctx.flush()).resolves.toBeUndefined()
	})
})
