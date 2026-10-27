// Шифрование канала — зеркало src/main/mobile/crypto.ts (AES-256-GCM, SHA-256 от секрета).
// Кадр: base64( nonce(12) || ciphertext || tag(16) ).
import { gcm } from '@noble/ciphers/aes.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { getRandomBytes } from 'expo-crypto'

export interface Keys {
  encKey: Uint8Array
  roomId: string
}

export function deriveKeys(secret: Uint8Array): Keys {
  return {
    encKey: sha256(concatBytes(utf8ToBytes('advterm-enc'), secret)),
    roomId: bytesToHex(sha256(concatBytes(utf8ToBytes('advterm-room'), secret)))
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s)
}

export function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return b64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
}

export function seal(key: Uint8Array, plaintext: string): string {
  const nonce = getRandomBytes(12)
  const body = gcm(key, nonce).encrypt(utf8ToBytes(plaintext))
  return bytesToB64(concatBytes(nonce, body))
}

/** null — кадр повреждён или от чужого ключа */
export function open(key: Uint8Array, frame: string): string | null {
  try {
    const buf = b64ToBytes(frame)
    if (buf.length < 12 + 16) return null
    const plain = gcm(key, buf.subarray(0, 12)).decrypt(buf.subarray(12))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
