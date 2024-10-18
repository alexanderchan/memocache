import { describe, expect, it } from 'vitest'

import { hashKey, hashString } from '@/hash'

describe('hashKey function', () => {
  it('should hash a simple query key', () => {
    const queryKey = ['users', 1]
    expect(hashKey(queryKey)).toBe('["users",1]')
  })

  it('should sort object keys in the query key', () => {
    const queryKey = ['users', { age: 30, name: 'John' }]
    expect(hashKey(queryKey)).toBe('["users",{"age":30,"name":"John"}]')
  })

  it('should handle nested objects in the query key', () => {
    const queryKey = ['users', { filters: { age: 30, name: 'John' } }]
    expect(hashKey(queryKey)).toBe(
      '["users",{"filters":{"age":30,"name":"John"}}]',
    )
  })

  it('should be order independent for object keys', () => {
    const queryKey1 = ['users', { age: 30, name: 'John' }]
    const queryKey2 = ['users', { name: 'John', age: 30 }]
    expect(hashKey(queryKey1)).toBe(hashKey(queryKey2))
  })
})

describe('hashString function', () => {
  it('should generate a SHA-256 hash for a simple string', async () => {
    const result = await hashString('hello')
    expect(result).toMatchInlineSnapshot(
      `"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"`,
    )
  })

  it('should generate a consistent hash for the same input', async () => {
    const result1 = await hashString('test string')
    const result2 = await hashString('test string')
    expect(result1).toBe(result2)
  })

  it('should generate different hashes for different inputs', async () => {
    const result1 = await hashString('input1')
    const result2 = await hashString('input2')
    expect(result1).not.toBe(result2)
  })
})
