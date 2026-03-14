import { describe, expect, it } from 'vitest'

import { CacheError } from '@/error/cache-error'

describe('CacheError', () => {
  it('should create a CacheError with message and key', () => {
    const error = new CacheError({ key: 'test-key', message: 'Test error' })
    expect(error.message).toBe('Test error')
    expect(error.key).toBe('test-key')
    expect(error.name).toBe('CacheError')
    expect(error.retry).toBe(false)
  })

  it('should produce a readable toString', () => {
    const error = new CacheError({ key: 'my-key', message: 'Something failed' })
    const str = error.toString()
    expect(str).toContain('CacheError')
    expect(str).toContain('Something failed')
  })

  it('should be an instance of Error', () => {
    const error = new CacheError({ key: 'k', message: 'msg' })
    expect(error).toBeInstanceOf(Error)
  })

  it('should include cause in toString if provided', () => {
    const cause = new CacheError({ key: 'inner', message: 'inner error' })
    // BaseError accepts cause; cast opts to pass it through
    const outer = new CacheError({ key: 'outer', message: 'outer error', cause } as any)
    const str = outer.toString()
    expect(str).toContain('inner error')
  })
})
