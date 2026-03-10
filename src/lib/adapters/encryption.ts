import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const key = process.env.ENCRYPTION_MASTER_KEY
  if (!key) throw new Error('ENCRYPTION_MASTER_KEY is not set')
  const buf = Buffer.from(key, 'base64')
  if (buf.length < KEY_LENGTH) throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 bytes')
  return buf.slice(0, KEY_LENGTH)
}

export function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const iv = randomBytes(IV_LENGTH)
  const key = getMasterKey()
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encryptedData = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([encryptedData, authTag])

  return {
    encrypted: combined.toString('base64'),
    iv: iv.toString('base64'),
  }
}

export function decrypt(encrypted: string, iv: string): string {
  const key = getMasterKey()
  const combined = Buffer.from(encrypted, 'base64')
  const ivBuffer = Buffer.from(iv, 'base64')

  const authTag = combined.slice(-AUTH_TAG_LENGTH)
  const ciphertext = combined.slice(0, -AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}
