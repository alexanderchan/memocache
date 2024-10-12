import { BaseError } from "./base-error"

export class CacheError extends BaseError {
  public readonly name = "CacheError"
  public readonly retry = false

  public readonly key: string

  constructor(opts: { key: string; message: string }) {
    super(opts)
    this.name = "CacheError"
    this.key = opts.key
  }
}
