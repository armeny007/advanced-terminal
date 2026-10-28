import type { BrowserWindow, IpcMain } from 'electron'
import { IPC } from '../shared/types'

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

/** Попросить у окна, где смонтирован терминал, его буфер xterm (ANSI); null — окна нет / не ответило */
const serializeWaiters = new Map<string, (data: string | null) => void>()
let serializeSeq = 0
export function requestSerialize(ipcMain: IpcMain, folderId: string, termId: string): Promise<string | null> {
  const win = windowForFolder(folderId)
  if (!win) return Promise.resolve(null)
  if (serializeWaiters.size === 0 && serializeSeq === 0) {
    ipcMain.on(IPC.termSerializeRes, (_e, reqId: string, data: string) => {
      serializeWaiters.get(reqId)?.(data || null)
    })
  }
  const reqId = String(++serializeSeq)
  return new Promise((resolve) => {
    const done = (d: string | null): void => {
      clearTimeout(t)
      serializeWaiters.delete(reqId)
      resolve(d)
    }
    const t = setTimeout(() => done(null), 1500)
    serializeWaiters.set(reqId, done)
    win.webContents.send(IPC.termSerializeReq, reqId, termId)
  })
}

/** Разослать событие во все окна (безопасно, если окно закрыто) */
export function send(channel: string, ...args: unknown[]): void {
  for (const w of allWindows()) w.webContents.send(channel, ...args)
}
