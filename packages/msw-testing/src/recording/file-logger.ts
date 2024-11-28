import { dirname } from 'path'

import { RequestLogItem } from '@/recording/request-recorder'

let appendFileSync: typeof import('fs').appendFileSync
let existsSync: typeof import('fs').existsSync
let mkdirSync: typeof import('fs').mkdirSync
let writeFileSync: typeof import('fs').writeFileSync

/**
 * Creates a logger function that appends MSW (Mock Service Worker) requests to a specified file.
 *
 * @param {Object} [options] - Configuration options for the logger.
 * @param {string} [options.filenameWithPath=process.cwd() + '/tmp/msw-recorder.ts'] - The file path where the MSW requests will be logged.
 * @returns {(requestString: string, requestLogItem: RequestLogItem) => void} A function that logs MSW requests to the specified file.
 *
 * @example
 * const logger = createMswFileLogger({ filenameWithPath: '/path/to/logfile.ts' });
 * logger('requestString', requestLogItem);
 */
export async function createMswFileLogger({
  filenameWithPath = process.cwd() + '/tmp/msw-recorder.ts',
} = {}) {
  if (typeof (global as any).window !== 'undefined') {
    throw new Error(
      'createMswFileLogger can only be used in a Node.js environment',
    )
  }

  // Dynamically import 'fs' module so that we can also import this module in the browser more easily
  const fs = await import('fs')
  appendFileSync = fs.appendFileSync
  existsSync = fs.existsSync
  mkdirSync = fs.mkdirSync
  writeFileSync = fs.writeFileSync

  console.info(`🔴 Appending MSW requests to ${filenameWithPath}`)

  // check if the file exists, if not create it
  try {
    const dir = dirname(filenameWithPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    if (!existsSync(filenameWithPath)) {
      writeFileSync(filenameWithPath, '')
    }
  } catch (e) {
    console.error('Error creating file', e)
  }

  return (requestString: string, requestLogItem: RequestLogItem) => {
    try {
      appendFileSync(filenameWithPath, requestString + ',\n')
    } catch (e) {
      console.error('Error writing to file', e)
      console.info(requestString, requestLogItem)
    }
  }
}
