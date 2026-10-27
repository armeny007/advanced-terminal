// Хранение секретов (токен бота, ключ сопряжения) отдельно от state.json и зашифрованно (safeStorage).
import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface SecretStore {
  save(value: string): void
  load(): string | null
  clear(): void
  has(): boolean
}

export function createSecretStore(name: string): SecretStore {
  const encFile = (): string => join(app.getPath('userData'), `${name}.enc`)
  const plainFile = (): string => join(app.getPath('userData'), `${name}.txt`)

  function rm(f: string): void {
    try {
      if (existsSync(f)) unlinkSync(f)
    } catch {
      // игнорируем
    }
  }
  function clear(): void {
    rm(encFile())
    rm(plainFile())
  }
  function save(value: string): void {
    const t = value.trim()
    if (!t) return clear()
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(encFile(), safeStorage.encryptString(t))
      rm(plainFile())
    } else {
      // редкий случай (нет Keychain) — пишем открытым текстом с предупреждением
      console.warn(`${name}: safeStorage недоступен — секрет сохранён без шифрования`)
      writeFileSync(plainFile(), t, 'utf8')
      rm(encFile())
    }
  }
  function load(): string | null {
    try {
      if (existsSync(encFile()) && safeStorage.isEncryptionAvailable()) {
        const v = safeStorage.decryptString(readFileSync(encFile())).trim()
        if (v) return v
      }
    } catch {
      // повреждён/сменился ключ — считаем, что секрета нет
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
  return { save, load, clear, has: () => load() !== null }
}
