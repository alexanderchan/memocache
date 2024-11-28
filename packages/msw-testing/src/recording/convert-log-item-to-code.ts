import * as prettier from 'prettier'

import { RequestLogItem } from './request-recorder'
/**
 * Converts a request log item to a code string that represents an MSW (Mock Service Worker) handler.
 *
 * @param {Object} params - The parameters object.
 * @param {RequestLogItem} params.requestLogItem - The request log item to convert.
 * @returns {Promise<string>} A promise that resolves to a formatted string of the MSW handler code.
 *
 * @example
 * const requestLogItem = {
 *   request: {
 *     method: 'GET',
 *     url: 'https://api.example.com/data',
 *   },
 *   response: {
 *     status: 200,
 *     responseJson: { key: 'value' },
 *     headers: { 'Content-Type': 'application/json' },
 *   },
 * }
 *
 * const code = await convertLogItemToCode({ requestLogItem })
 * console.log(code)
 * // Output:
 * // http.get("https://api.example.com/data", async () => {
 * //   return HttpResponse.json({
 * //     "key": "value"
 * //   }, { status: 200, headers: {
 * //     "Content-Type": "application/json"
 * //   } })
 * // })
 */
export async function convertLogItemToCode({
  requestLogItem,
}: {
  requestLogItem: RequestLogItem
}) {
  let responseCode = ''

  if (requestLogItem.response.responseJson) {
    responseCode = `HttpResponse.json(${JSON.stringify(requestLogItem.response.responseJson, null, 2)}, { status: ${requestLogItem.response.status}, headers: ${JSON.stringify(requestLogItem.response.headers, null, 2)} })`
  } else {
    responseCode = `HttpResponse.text(\`${requestLogItem.response.responseBody}\`, { status: ${requestLogItem.response.status}, headers: ${JSON.stringify(requestLogItem.response.headers, null, 2)}})`
  }

  const mswMockCode = `
    http.${requestLogItem.request.method?.toLowerCase()}("${requestLogItem.request.url}", async () => {
      return ${responseCode}
    })`

  return await prettier.format(mswMockCode, {
    parser: 'typescript',
    semi: false,
  })
}
