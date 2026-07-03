import type { BrowserWindow } from 'electron'

/** Общее runtime-состояние main-процесса */
export const runtime = {
  mainWin: null as BrowserWindow | null,
  /** окна вынесенных папок: folderId -> окно */
  detached: new Map<string, BrowserWindow>(),
  /** терминал, который сейчас в фокусе у пользователя (для подавления уведомлений) */
  focusedTermId: null as string | null
}

/** Все живые окна приложения (главное + вынесенные) */
export function allWindows(): BrowserWindow[] {
  const out: BrowserWindow[] = []
  if (runtime.mainWin && !runtime.mainWin.isDestroyed()) out.push(runtime.mainWin)
  for (const w of runtime.detached.values()) if (!w.isDestroyed()) out.push(w)
  return out
}

/** Окно, отвечающее за папку: её отдельное окно, иначе главное */
export function windowForFolder(folderId: string): BrowserWindow | null {
  const w = runtime.detached.get(folderId)
  if (w && !w.isDestroyed()) return w
  return runtime.mainWin && !runtime.mainWin.isDestroyed() ? runtime.mainWin : null
}

export function isAnyWindowFocused(): boolean {
  return allWindows().some((w) => w.isFocused())
}

/** Разослать событие во все окна (безопасно, если окно закрыто) */
export function send(channel: string, ...args: unknown[]): void {
  for (const w of allWindows()) w.webContents.send(channel, ...args)
}
