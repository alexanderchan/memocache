// https://github.com/golang/go/blob/b521ebb55a9b26c8824b219376c7f91f7cda6ec2/src/time/time.go#L930
export enum Time {
  Millisecond = 1,
  Second = 1000,
  Minute = 60 * Time.Second,
  Hour = 60 * Time.Minute,
}
