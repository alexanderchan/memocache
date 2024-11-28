---
title: MSW Testing utils
description: Recording with msw
---

# @alexmchan/msw-testing

A utility library for [Mock Service Worker (MSW)](https://mswjs.io/) that provides request recording, logging, and network control capabilities for testing HTTP interactions.

## Features

- 📝 Record HTTP requests and responses automatically
- 💾 Log recorded requests to files in MSW handler format
- 🔒 Control network connections during tests
- 🔄 Convert recorded requests to reusable MSW handlers

## Installation

```bash
npm install @alexmchan/msw-testing msw prettier
# or
yarn add @alexmchan/msw-testing msw prettier
```

## Usage

### Recording HTTP Requests

The request recorder captures all HTTP interactions and can log them to a file in MSW handler format:

```typescript
import { http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import {
  createMswRecorderHandler,
  createMswFileLogger,
  disableNetConnectHandler,
} from '@alexmchan/msw-testing'

// Create a file logger
const logging = await createMswFileLogger({
  filenameWithPath: './test/recorded-handlers.ts',
})

// Create the recorder handler
const recorderHandler = createMswRecorderHandler({
  logging,
})

// Define your handlers array
export const handlers = [
  // Allow local requests to pass through
  http.all('http://127.0.0.1*', () => passthrough()),

  // Your mock handlers
  http.get('https://api.example.com/users', () => {
    return new HttpResponse(JSON.stringify({ users: [] }))
  }),

  // Record all other requests
  recorderHandler,

  // Optionally block unhandled requests
  disableNetConnectHandler,
]

// Set up MSW server with handlers
const mockServer = setupServer(...handlers)

// In your test setup
beforeAll(() => {
  mockServer.listen()
})

afterEach(() => {
  // Reset handlers between tests
  mockServer.restoreHandlers()
})

afterAll(() => {
  mockServer.close()
})
```

### Disabling Network Connections

To ensure all HTTP requests are properly mocked during testing, add the `disableNetConnectHandler` as the last handler:

```typescript
import { http } from 'msw'
import { setupServer } from 'msw/node'
import { disableNetConnectHandler } from '@alexmchan/msw-testing'

const mockServer = setupServer([
  // Your mock handlers first
  http.get('https://api.example.com/data', () => {
    return new HttpResponse(JSON.stringify({ data: 'test' }))
  }),

  // Disable unmocked requests last
  disableNetConnectHandler,
])
```

This will throw an error for any request that doesn't match your defined handlers, helping identify missing mocks.

### Example Output

When using the recorder, it generates MSW v2 handlers in this format:

```typescript
http.get('https://api.example.com/users', () => {
  return new HttpResponse(
    JSON.stringify({
      users: [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ],
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    },
  )
})
```

### Complete Example with Tests

Here's a complete example showing how to use the library in a test file:

```typescript
import { http, HttpResponse, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import {
  createMswRecorderHandler,
  createMswFileLogger,
  disableNetConnectHandler,
} from '@alexmchan/msw-testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import supertest from 'supertest'

// Create logger and recorder
const logging = await createMswFileLogger()
const recorderHandler = createMswRecorderHandler({
  logging,
})

// Define handlers
const handlers = [
  // Allow local requests to pass through
  http.all('http://127.0.0.1*', () => passthrough()),

  // Example mock handler
  http.get('https://api.example.com/products/:id', ({ params }) => {
    return new HttpResponse(
      JSON.stringify({ id: params.id, name: 'Test Product' }),
      { status: 200 },
    )
  }),

  // Record unhandled requests
  recorderHandler,

  // Block any other requests
  disableNetConnectHandler,
]

const mockServer = setupServer(...handlers)

// Test setup
beforeAll(() => mockServer.listen())
afterEach(() => mockServer.restoreHandlers())
afterAll(() => mockServer.close())

// Example test
it('should handle product not found', async () => {
  // Add a temporary handler for this test
  mockServer.use(
    http.get('https://api.example.com/products/not-found', () => {
      return new HttpResponse(null, {
        status: 404,
        statusText: 'Not found',
      })
    }),
  )

  const response = await fetch('https://api.example.com/products/not-found')
  expect(response.status).toBe(404)
})
```

## API Reference

### createMswRecorderHandler

Creates an MSW handler that records all HTTP requests and responses.

```typescript
function createMswRecorderHandler({
  logging?: (requestString: string, requestLogItem: RequestLogItem) => void
}): HttpHandler
```

### createMswFileLogger

Creates a logger function that writes recorded requests to a file.

```typescript
function createMswFileLogger({
  filenameWithPath?: string // defaults to process.cwd() + '/tmp/msw-recorder.ts'
}): Promise<(requestString: string, requestLogItem: RequestLogItem) => void>
```

### disableNetConnectHandler

An MSW handler that blocks all unmatched HTTP requests and writes them out.

```typescript
const disableNetConnectHandler: HttpHandler
```

## Types

### RequestLogItem

```typescript
type RequestLogItem = {
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
```

## Diagram
