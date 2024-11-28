import { http } from 'msw'
/**
 * Disables network connections for all HTTP requests that do not have a matching request handler.
 *
 * This function intercepts all HTTP requests and throws an error if no matching request handler is found.
 * It also logs an error message to the console with the URL of the unmatched request.
 *
 * @param request - The intercepted HTTP request object.
 * @throws Will throw an error if no matching request handler is found.
 */
export const disableNetConnectHandler = http.all('*', async ({ request }) => {
  console.error('No matching request handler found for ' + request.url)
  throw new Error('No matching request handler found for ' + request.url)
})
