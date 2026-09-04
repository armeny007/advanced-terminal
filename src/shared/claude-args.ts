import type { ClaudeLaunchOptions } from './types'

/** Собрать строку аргументов claude из опций запуска (общий код main и renderer) */
export function buildClaudeArgs(o: ClaudeLaunchOptions): string {
  const parts: string[] = []
  if (o.chrome) parts.push('--chrome')
  if (o.autoMode) parts.push('--enable-auto-mode')
  if (o.skipPermissions) parts.push('--dangerously-skip-permissions')
  if (o.verbose) parts.push('--verbose')
  if (o.model) parts.push(`--model ${o.model}`)
  if (o.custom.trim()) parts.push(o.custom.trim())
  return parts.join(' ')
}
