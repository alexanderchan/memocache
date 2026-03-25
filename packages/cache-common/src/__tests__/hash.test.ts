import { describe, expect, it } from 'vitest'

import {
	hashKey,
	hashString,
	isPlainArray,
	isPlainObject,
	partialMatchKey,
} from '@/hash'

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

describe('isPlainObject', () => {
	it('returns true for plain objects', () => {
		expect(isPlainObject({})).toBe(true)
		expect(isPlainObject({ a: 1 })).toBe(true)
	})

	it('returns false for arrays', () => {
		expect(isPlainObject([])).toBe(false)
	})

	it('returns false for null', () => {
		expect(isPlainObject(null)).toBe(false)
	})

	it('returns false for class instances with modified prototype', () => {
		class Foo {}
		expect(isPlainObject(new Foo())).toBe(false)
	})

	it('returns true for objects with no constructor (Object.create(null))', () => {
		expect(isPlainObject(Object.create(null))).toBe(true)
	})

	it('returns false for objects with a constructor whose prototype lacks isPrototypeOf', () => {
		function Custom(this: any) {}
		// Set Custom.prototype to a plain {} and point constructor back to Custom.
		// hasObjectPrototype({}) is true, but Object.hasOwn({}, 'isPrototypeOf') is
		// false (isPrototypeOf lives on Object.prototype, not on a plain {}).
		const proto: any = {}
		proto.constructor = Custom
		Custom.prototype = proto
		expect(isPlainObject(new (Custom as any)())).toBe(false)
	})
})

describe('isPlainArray', () => {
	it('returns true for a normal array', () => {
		expect(isPlainArray([1, 2, 3])).toBe(true)
	})

	it('returns false for non-arrays', () => {
		expect(isPlainArray({})).toBe(false)
		expect(isPlainArray('string')).toBe(false)
	})
})

describe('partialMatchKey', () => {
	it('should match identical primitive values', () => {
		expect(partialMatchKey(['todos'], ['todos'])).toBe(true)
		expect(partialMatchKey(['todos', 1], ['todos', 1])).toBe(true)
	})

	it('should match when filter is a prefix of stored key', () => {
		expect(partialMatchKey(['todos', 1], ['todos'])).toBe(true)
		expect(partialMatchKey(['todos', { status: 'done' }], ['todos'])).toBe(true)
	})

	it('should NOT match when filter is more specific than stored key', () => {
		expect(partialMatchKey(['todos'], ['todos', 1])).toBe(false)
	})

	it('should match when filter object is a subset of stored object', () => {
		expect(
			partialMatchKey(
				['todos', { status: 'done', page: 1 }],
				['todos', { status: 'done' }],
			),
		).toBe(true)
	})

	it('should NOT match when filter object has different value', () => {
		expect(
			partialMatchKey(
				['todos', { status: 'done' }],
				['todos', { status: 'pending' }],
			),
		).toBe(false)
	})

	it('should handle nested objects', () => {
		expect(
			partialMatchKey(
				['q', { filters: { active: true, role: 'admin' } }],
				['q', { filters: { active: true } }],
			),
		).toBe(true)
	})

	it('should return false for different types', () => {
		expect(partialMatchKey(['todos'], [1])).toBe(false)
	})

	it('should match empty array filter against any key', () => {
		expect(partialMatchKey(['todos', 1], [])).toBe(true)
	})

	it('should match identical complex keys', () => {
		const key = ['users', { id: 1, filters: { active: true } }, ['sort', 'asc']]
		expect(partialMatchKey(key, key)).toBe(true)
	})

	it('should match when both values at a position are null', () => {
		expect(partialMatchKey([null], [null])).toBe(true)
	})

	it('should not match when stored value is null but filter is non-null', () => {
		expect(partialMatchKey([null], ['todos'])).toBe(false)
	})

	it('should not match when filter value is null but stored is non-null', () => {
		expect(partialMatchKey(['todos'], [null])).toBe(false)
	})
})
