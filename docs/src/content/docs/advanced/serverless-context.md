---
title: Serverless Context
description: Use cache background work safely in serverless and edge environments.
---

# Serverless context

memocache uses a context object to run non-blocking cache work such as background writes, backfills, and stale revalidation.

If you do not provide one, memocache creates a default stateful context internally. In serverless environments, you may want to pass a platform-specific `waitUntil()` implementation instead.

## Context shape

```ts
export interface Context {
  waitUntil: (p: Promise<unknown>) => void
}
```

## Example with Vercel

```ts
import { createCache } from '@alexmchan/memocache'
import { waitUntil } from '@vercel/functions'

const cache = createCache({
  context: {
    waitUntil,
    [Symbol.asyncDispose]() {
      // optional cleanup
    },
  },
})
```

This lets cache maintenance continue after the response has been sent, subject to the platform's runtime limits.

## Example of a simple flushable context

```ts
function createSimpleContext() {
  const waitables: Promise<unknown>[] = []

  return {
    waitUntil(p: Promise<unknown>) {
      waitables.push(p)
    },
    async flushCache() {
      await Promise.allSettled(waitables)
      waitables.length = 0
    },
    async [Symbol.asyncDispose]() {
      await this.flushCache()
    },
  }
}
```

This pattern is useful when you need explicit control over when pending cache writes finish.

## Platform references

- [Vercel Serverless](https://vercel.com/docs/functions/functions-api-reference#waituntil)
- [Vercel Edge and Middleware](https://vercel.com/docs/functions/edge-middleware/middleware-api#waituntil)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/context/)
- [AWS response streaming](https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming/)
- [AWS Lambda event loops](https://dev.to/dvddpl/event-loops-and-idle-connections-why-is-my-lambda-not-returning-and-then-timing-out-2oo7)
