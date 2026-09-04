// Точка расширения «Claude ждёт тебя»: watcher вызывает emitAttention при
// событии, требующем внимания (needs_input / permission / завершение задачи).
// Подписчик — Telegram-бот (регистрируется в initTelegram). Развязка, чтобы
// watcher/claude не зависели от модуля telegram.
import type { ClaudeStatus } from '../shared/types'

export interface AttentionEvent {
  termId: string
  status: ClaudeStatus
  /** текст вопроса Claude из Notification-хука, если был */
  message?: string
  /** true — задача завершена (Stop после working) */
  completed: boolean
}

let hook: ((ev: AttentionEvent) => void) | null = null

export function setAttentionHook(cb: ((ev: AttentionEvent) => void) | null): void {
  hook = cb
}

export function emitAttention(ev: AttentionEvent): void {
  try {
    hook?.(ev)
  } catch {
    // подписчик не должен ронять watcher
  }
}
