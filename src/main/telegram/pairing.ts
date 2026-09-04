// Разовый код сопряжения: генерится в приложении, вводится в боте через /start <code>.
const TTL_MS = 5 * 60_000

let current: { code: string; expiresAt: number } | null = null

export function generatePairingCode(): { code: string; expiresAt: number } {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  current = { code, expiresAt: Date.now() + TTL_MS }
  return current
}

/** Проверить и погасить код (одноразовый). */
export function consumePairingCode(input: string): boolean {
  if (!current) return false
  if (Date.now() > current.expiresAt) {
    current = null
    return false
  }
  if (current.code !== input.trim()) return false
  current = null
  return true
}
