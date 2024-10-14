export interface Logger {
  debug(...args: any[]): any
  log(...args: any[]): any
  info(...args: any[]): any
  warn(...args: any[]): any
  error(...args: any[]): any
}

export const defaultLogger = {
  // eslint-disable-next-line no-console
  debug: console.debug,
  // eslint-disable-next-line no-console
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}
