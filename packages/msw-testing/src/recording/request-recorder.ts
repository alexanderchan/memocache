import { bypass, http, HttpResponse } from 'msw'

import { convertLogItemToCode } from '@/recording/convert-log-item-to-code'

export interface RequestLogItem {
  request: {
    method: string
    url: string
    requestBody?: string
    requestJson?: unknown
  }
  response: {
    status?: number
    headers?: Record<string, string>
    responseBody?: string
    responseJson?: unknown
    statusText?: string
    type?: HttpResponse['type']
  }
}

const requestLog: RequestLogItem[] = []

/**
 * Create an MSW recorder that logs all requests and responses in msw handler format
 */
/**
 * Creates an MSW (Mock Service Worker) recorder that logs HTTP requests and responses.
 *
 * @param {Object} options - Configuration options for the MSW recorder.
 * @param {Function} [options.logging=console.info] - Optional logging function to log request and response details.
 *
 * @returns {Function} - A function that handles all HTTP requests and logs their details.
 *
 * The recorder captures the following details:
 * - Request method
 * - Request URL
 * - Request body (as text and JSON, if possible)
 * - Response status
 * - Response headers
 * - Response body (as text and JSON, if possible)
 *
 * If an error occurs during the request or response processing, it logs the error and returns a 500 status response.
 */
export function createMswRecorderHandler({
  logging = console.info,
}: {
  logging?: (requestString: string, requestLogItem: RequestLogItem) => void
} = {}) {
  return http.all('*', async ({ request }) => {
    try {
      const requestClone = request.clone()
      const method = requestClone.method
      const url = requestClone.url

      let requestBody
      try {
        requestBody = await requestClone.text()
      } catch (e) {
        requestBody = ''
        console.error(e)
      }

      let requestJson = undefined
      try {
        requestJson = JSON.parse(requestBody)
      } catch {
        requestJson = undefined
      }

      const requestLogItem: RequestLogItem = {
        request: {
          method,
          url,
          requestBody,
          requestJson,
        },
        response: {
          status: undefined,
          headers: undefined,
          responseBody: '',
          responseJson: undefined,
        },
      }

      requestLog.push(requestLogItem)

      let actualResponse: Response
      try {
        actualResponse = await fetch(bypass(request))
      } catch (e) {
        console.error(e)

        requestLogItem.response.status = 500
        requestLogItem.response.statusText = `Error ${e}`

        logging(await convertLogItemToCode({ requestLogItem }), requestLogItem)

        return new Response(`Error in request to ${request.url} ${e}`, {
          status: 500,
        })
      }

      requestLogItem.response.status = actualResponse.status
      try {
        const responseBody = await actualResponse.text()
        requestLogItem.response.responseBody = responseBody

        try {
          requestLogItem.response.responseJson = JSON.parse(responseBody)
        } catch {
          requestLogItem.response.responseJson = undefined
        }
      } catch (e) {
        console.error(e)
      }

      const headersObj: Record<string, string> = {}
      actualResponse.headers?.forEach((value, key) => {
        headersObj[key] = value
      })
      requestLogItem.response.headers = headersObj

      // content encoding messes with the response, something tries to unzip it
      if (requestLogItem.response.headers['content-encoding'] === 'gzip') {
        delete requestLogItem.response.headers['content-encoding']
      }

      logging(await convertLogItemToCode({ requestLogItem }), requestLogItem)

      return HttpResponse.text(requestLogItem.response.responseBody, {
        status: requestLogItem.response.status,
        headers: requestLogItem.response.headers,
        statusText: actualResponse.statusText,
        type: actualResponse.type,
      })
    } catch (e) {
      console.error(e)
      return new Response(`Error ${e}`, { status: 500 })
    }
  })
}
