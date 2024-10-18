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
