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

type Hook = (ev: AttentionEvent) => void

let hook: Hook | null = null // слот Telegram-бота (ставится/снимается при запуске/остановке)
const extra = new Set<Hook>() // прочие подписчики (мобильное приложение)

export function setAttentionHook(cb: Hook | null): void {
  hook = cb
}

/** Добавить подписчика; возвращает функцию отписки */
export function addAttentionHook(cb: Hook): () => void {
  extra.add(cb)
  return () => extra.delete(cb)
}

export function emitAttention(ev: AttentionEvent): void {
  for (const h of [hook, ...extra]) {
    try {
      h?.(ev)
    } catch {
      // подписчик не должен ронять watcher
    }
  }
}
