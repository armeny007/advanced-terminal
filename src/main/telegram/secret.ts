// Хранение токена Telegram-бота отдельно от state.json и зашифрованно (safeStorage).
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

const encFile = (): string => join(app.getPath('userData'), 'telegram.token.enc')
const plainFile = (): string => join(app.getPath('userData'), 'telegram.token.txt')

export function saveToken(token: string): void {
  const t = token.trim()
  if (!t) return clearToken()
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(encFile(), safeStorage.encryptString(t))
    rm(plainFile())
  } else {
    // редкий случай (нет Keychain) — пишем открытым текстом с предупреждением
    console.warn('telegram: safeStorage недоступен — токен сохранён без шифрования')
    writeFileSync(plainFile(), t, 'utf8')
    rm(encFile())
  }
}

export function loadToken(): string | null {
  try {
    if (existsSync(encFile()) && safeStorage.isEncryptionAvailable()) {
      const v = safeStorage.decryptString(readFileSync(encFile())).trim()
      if (v) return v
    }
  } catch {
    // повреждён/сменился ключ — считаем, что токена нет
  }
  try {
    if (existsSync(plainFile())) {
      const v = readFileSync(plainFile(), 'utf8').trim()
      if (v) return v
    }
  } catch {
    // игнорируем
  }
  return null
}

export function clearToken(): void {
  rm(encFile())
  rm(plainFile())
}

export function hasToken(): boolean {
  return loadToken() !== null
}

function rm(f: string): void {
  try {
    if (existsSync(f)) unlinkSync(f)
  } catch {
    // игнорируем
  }
}
