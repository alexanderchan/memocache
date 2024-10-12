/**
 * Default query & mutation keys hash function.
 * Hashes the value into a stable hash.
 * https://github.com/TanStack/query/blob/69d37f33bdee50d73d0f05256f243113a857a1ee/packages/query-core/src/utils.ts#L177
 */
export type QueryKey = ReadonlyArray<unknown>

export function hashKey(queryKey: QueryKey): string {
  return JSON.stringify(queryKey, (_, val) =>
    isPlainObject(val)
      ? Object.keys(val)
          .sort()
          .reduce((result, key) => {
            result[key] = val[key]
            return result
          }, {} as any)
      : val,
  )
}

function hasObjectPrototype(o: any): boolean {
  return Object.prototype.toString.call(o) === "[object Object]"
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
export function isPlainObject(o: any): o is Object {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has no constructor
  const ctor = o.constructor
  if (ctor === undefined) {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty("isPrototypeOf")) {
    return false
  }

  // Most likely a plain Object
  return true
}

export function isPlainArray(value: unknown) {
  return Array.isArray(value) && value.length === Object.keys(value).length
}
