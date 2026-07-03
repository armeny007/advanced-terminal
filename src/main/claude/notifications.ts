// Уведомления macOS о смене статуса Claude в терминале.
import { Notification } from 'electron'
import type { ClaudeStatus } from '../../shared/types'
import { IPC } from '../../shared/types'
import { runtime, send } from '../runtime'

const DEFAULT_BODY: Partial<Record<ClaudeStatus, string>> = {
  needs_input: 'Ждёт ввода',
  permission: 'Требуется разрешение',
  idle: 'Задача завершена'
}

export function notifyStatus(
  termId: string,
  termName: string,
  status: ClaudeStatus,
  message?: string
): void {
  // пользователь и так смотрит на этот терминал — не беспокоим
  if (runtime.win?.isFocused() && runtime.focusedTermId === termId) return
  if (!Notification.isSupported()) return

  const n = new Notification({
    title: termName,
    body: message || DEFAULT_BODY[status] || ''
  })
  n.on('click', () => {
    runtime.win?.show()
    runtime.win?.focus()
    send(IPC.uiRevealTerm, termId)
  })
  n.show()
}
