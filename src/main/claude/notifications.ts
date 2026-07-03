// Уведомления macOS о смене статуса Claude в терминале.
import { Notification } from 'electron'
import type { ClaudeStatus } from '../../shared/types'
import { IPC } from '../../shared/types'
import type { Store } from '../contracts'
import { isAnyWindowFocused, runtime, send, windowForFolder } from '../runtime'

const DEFAULT_BODY: Partial<Record<ClaudeStatus, string>> = {
  needs_input: 'Ждёт ввода',
  permission: 'Требуется разрешение',
  idle: 'Задача завершена'
}

export function notifyStatus(
  store: Store,
  termId: string,
  termName: string,
  status: ClaudeStatus,
  message?: string
): void {
  // пользователь и так смотрит на этот терминал — не беспокоим
  if (isAnyWindowFocused() && runtime.focusedTermId === termId) return
  if (!Notification.isSupported()) return

  const n = new Notification({
    title: termName,
    body: message || DEFAULT_BODY[status] || ''
  })
  n.on('click', () => {
    // сфокусировать окно, которому принадлежит папка терминала
    const term = store.getTerminal(termId)
    const win = term ? windowForFolder(term.folderId) : runtime.mainWin
    win?.show()
    win?.focus()
    send(IPC.uiRevealTerm, termId)
  })
  n.show()
}
