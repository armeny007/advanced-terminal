import type { BrowserWindow } from 'electron'

/** Общее runtime-состояние main-процесса */
export const runtime = {
  win: null as BrowserWindow | null,
  /** терминал, который сейчас в фокусе у пользователя (для подавления уведомлений) */
  focusedTermId: null as string | null
}

/** Отправить событие в renderer (безопасно, если окно закрыто) */
export function send(channel: string, ...args: unknown[]): void {
  const w = runtime.win
  if (w && !w.isDestroyed()) w.webContents.send(channel, ...args)
}
