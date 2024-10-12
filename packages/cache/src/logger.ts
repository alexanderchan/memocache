export interface Logger {
  debug(...args: any[]): any
  log(...args: any[]): any
  info(...args: any[]): any
  warn(...args: any[]): any
  error(...args: any[]): any
}

export const defaultLogger = {
  debug: console.debug,
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}
