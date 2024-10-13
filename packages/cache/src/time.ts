/* eslint-disable @typescript-eslint/prefer-literal-enum-member */
// https://github.com/golang/go/blob/b521ebb55a9b26c8824b219376c7f91f7cda6ec2/src/time/time.go#L930
export enum Time {
  Millisecond = 1,
  Second = 1000,
  Minute = 60 * Time.Second,
  Hour = 60 * Time.Minute,
  // for caching purposes it's nice to have these even if they're not exact across daylight savings or leap years
  Day = 24 * Time.Hour,
  Week = 7 * Time.Day,
  Month = 30 * Time.Day,
  Year = 365 * Time.Day,
}

type TimeUnit =
  | 'ms'
  | 'millisecond'
  | 'milliseconds'
  | 'second'
  | 's'
  | 'seconds'
  | 'minute'
  | 'min'
  | 'mins'
  | 'minutes'
  | 'hour'
  | 'h'
  | 'hours'
  | 'day'
  | 'd'
  | 'days'

const timeMultipliers: Record<TimeUnit, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  second: 1000,
  seconds: 1000,
  min: 60000,
  mins: 60000,
  minute: 60000,
  minutes: 60000,
  h: 3600000,
  hour: 3600000,
  hours: 3600000,
  d: 86400000,
  day: 86400000,
  days: 86400000,
}

export function getTimeInMs(time?: string | number): number {
  if (typeof time === 'number') {
    return time
  }

  if (!time) {
    return 0
  }

  const match = time.match(/^(\d+(?:\.\d+)?)\s*(.+)$/)
  if (!match) {
    throw new Error('Invalid time format')
  }

  const [, value, unit] = match
  const numericValue = parseFloat(value)
  const normalizedUnit = unit.toLowerCase() as TimeUnit

  console.log({ normalizedUnit: `"${normalizedUnit}" "${unit}` })
  if (!timeMultipliers[normalizedUnit]) {
    throw new Error(`Unknown time unit: ${unit}`)
  }

  return Math.round(numericValue * timeMultipliers[normalizedUnit])
}
