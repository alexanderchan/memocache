import { CacheStore } from '@/cache'
import superjson from 'superjson'
import memoizeLast from 'just-memoize-last'

// we memozie only the last one because this will be
// only needed for the use case of store1.set => store2.set
// and this will be the most common use case
const encryptMemoized = memoizeLast(
  encrypt,
  // approximately 4x faster than the encryption
  (lastValue, value) =>
    superjson.stringify(lastValue) === superjson.stringify(value),
)

export function createEncryptedStore({
  store,
  key,
  salt,
  shouldUseMemoize = true,
}: {
  store: CacheStore
  /** Some reasonably lengthed key */
  key: string
  /** The salt helps protect us from rainbow attacks */
  salt: string
  /** Should we memoize the encryption? Useful if multiple encrypted stores are using the same key/salt combination */
  shouldUseMemoize?: boolean
}) {
  let initialized = false
  let cryptoKey: CryptoKey
  let keyHash: ArrayBuffer
  let buildCacheKey: (originalKey: string) => string
  let keyHashBase64: string

  if (key.length < 8) {
    throw new Error('Key must be at least 8 characters long')
  }

  // Function to build the cache key
  async function lazyInitialize() {
    if (initialized) {
      return
    }

    const encoder = new TextEncoder()
    // Derive a 256-bit key from the provided key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey'],
    )

    const encodedSalt = encoder.encode(salt) // You might want to store this salt securely

    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encodedSalt,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )

    cryptoKey = derivedKey

    // Generate a hash of the key
    keyHash = await crypto.subtle.digest('SHA-256', encoder.encode(key))

    keyHashBase64 = btoa(String.fromCharCode(...new Uint8Array(keyHash)))

    // Function to build the cache key
    buildCacheKey = (originalKey: string) => `${originalKey}#${keyHashBase64}`

    initialized = true
  }

  return {
    ...store,
    async get(key: string) {
      await lazyInitialize()

      const encryptedData = await store.get(buildCacheKey(key))
      if (!encryptedData) return undefined

      const { iv, ciphertext } = encryptedData as {
        iv: string
        ciphertext: string
      }
      return decrypt(iv, ciphertext, cryptoKey)
    },
    async set(key: string, value: any, ttl: number) {
      await lazyInitialize()

      // need to benchmark to see if serialization vs re-encrypting is faster
      // most likely depends on data size
      const encryptedData = shouldUseMemoize
        ? await encryptMemoized(value, cryptoKey)
        : await encrypt(value, cryptoKey)

      return store.set(buildCacheKey(key), encryptedData, ttl)
    },
    async delete(key: string) {
      await lazyInitialize()

      return store.delete(buildCacheKey(key))
    },
  } satisfies CacheStore
}

// Encryption function
async function encrypt(
  data: any,
  cryptoKey: CryptoKey,
): Promise<{ iv: string; ciphertext: string }> {
  const encoder = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encodedData = encoder.encode(superjson.stringify(data))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encodedData,
  )
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  }
}

// Decryption function
async function decrypt(
  iv: string,
  ciphertext: string,
  cryptoKey: CryptoKey,
): Promise<any> {
  const decodedIv = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0))
  const decodedCiphertext = Uint8Array.from(atob(ciphertext), (c) =>
    c.charCodeAt(0),
  )
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodedIv },
    cryptoKey,
    decodedCiphertext,
  )

  const decoder = new TextDecoder()
  const decryptedText = decoder.decode(decryptedBuffer)
  return superjson.parse(decryptedText)
}
