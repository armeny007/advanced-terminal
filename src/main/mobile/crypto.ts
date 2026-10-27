// Шифрование канала с телефоном: AES-256-GCM (ChaCha20 в Electron/BoringSSL недоступен),
// ключ и id комнаты — из секрета сопряжения. Кадр: base64( nonce(12) || ciphertext || tag(16) ).
// Совместимо с @noble/ciphers (gcm) на телефоне.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

export interface Keys {
  encKey: Buffer
  roomId: string
}

export function deriveKeys(secret: Buffer): Keys {
  const encKey = createHash('sha256').update('advterm-enc').update(secret).digest()
  const roomId = createHash('sha256').update('advterm-room').update(secret).digest('hex')
  return { encKey, roomId }
}

export function newSecret(): Buffer {
  return randomBytes(32)
}

export function seal(key: Buffer, plaintext: string): string {
  const nonce = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return Buffer.concat([nonce, body, c.getAuthTag()]).toString('base64')
}

/** null — кадр повреждён или от чужого ключа */
export function open(key: Buffer, frame: string): string | null {
  try {
    const buf = Buffer.from(frame, 'base64')
    if (buf.length < 12 + 16) return null
    const nonce = buf.subarray(0, 12)
    const tag = buf.subarray(buf.length - 16)
    const body = buf.subarray(12, buf.length - 16)
    const d = createDecipheriv('aes-256-gcm', key, nonce)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(body), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** base64url без паддинга — для QR/ссылки сопряжения */
export const toB64Url = (b: Buffer): string => b.toString('base64url')
export const fromB64Url = (s: string): Buffer => Buffer.from(s, 'base64url')
