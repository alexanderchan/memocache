import { describe, expect, it } from 'vitest'

import { getTimeInMs } from '@/time'

describe('getTimeInMs', () => {
  it('handles milliseconds', () => {
    expect(getTimeInMs('1ms')).toBe(1)
    expect(getTimeInMs('2 milliseconds')).toBe(2)
  })

  it('handles minutes', () => {
    expect(getTimeInMs('1minute')).toBe(60000)
    expect(getTimeInMs('2 mins')).toBe(120000)
  })

  it('handles days', () => {
    expect(getTimeInMs('1day')).toBe(86400000)
    expect(getTimeInMs('1 d')).toBe(86400000)
  })

  it('handles hours', () => {
    expect(getTimeInMs('1h')).toBe(3600000)
    expect(getTimeInMs('2 hours')).toBe(7200000)
  })

  it('handles decimal hours', () => {
    expect(getTimeInMs('2.5hours')).toBe(9000000)
  })

  it('handles numeric input', () => {
    expect(getTimeInMs(5000)).toBe(5000)
  })

  it('throws error for invalid time unit', () => {
    expect(() => getTimeInMs('1 month')).toThrow('Unknown time unit: month')
  })

  it('throws error for invalid format', () => {
    expect(() => getTimeInMs('invalid')).toThrow('Invalid time format')
  })
})
