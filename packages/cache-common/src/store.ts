export interface CacheStore extends AsyncDisposable {
  /** a name for metrics */
  name: string
  /** Set a value in the store, ttl in milliseconds */
  set(key: string, value: any, ttl?: number): Promise<any>
  get(key: string): Promise<any>
  delete(key: string): Promise<unknown>

  /** Remove all values from the store */
  clear?(): Promise<any>
  /** dispose of any resources or connections when the cache is no longer in use */
  dispose?(): Promise<any>
}
