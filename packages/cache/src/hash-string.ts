export async function hashString(str: string): Promise<string> {
  // in order to support edge functions we need to use the web crypto api instead of the simpler synchronous
  // import { createHash } from 'node:crypto'
  // createHash('SHA256').update(str).digest('hex')
  // https://github.com/vercel/examples/blob/main/edge-middleware/crypto/pages/api/crypto.ts
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(str))
  const hashArray = Array.from(new Uint8Array(digest)) // convert buffer to byte array
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('') // convert bytes to hex string

  return hashHex
}
