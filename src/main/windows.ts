// Управление окнами: главное окно + вынесенные папки (по окну на папку).
import { BrowserWindow } from 'electron'
import type { IpcMain } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/types'
import type { Store } from './contracts'
import { runtime } from './runtime'

const WIN_OPTS = {
  minWidth: 700,
  minHeight: 500,
  backgroundColor: '#11111b',
  titleBarStyle: 'hiddenInset' as const,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
}

/** Загрузить renderer; hash задаёт режим отдельной папки (#folder=<id>) */
function loadRenderer(win: BrowserWindow, hash?: string): void {
  const base = process.env['ELECTRON_RENDERER_URL']
  if (base) {
    win.loadURL(hash ? `${base}#${hash}` : base)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({ ...WIN_OPTS, width: 1440, height: 900, title: 'Advanced Terminal' })
  loadRenderer(win)
  runtime.mainWin = win
  win.on('closed', () => {
    if (runtime.mainWin === win) runtime.mainWin = null
  })
  return win
}

function detachFolder(store: Store, folderId: string): void {
  const existing = runtime.detached.get(folderId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const folder = store.getState().folders.find((f) => f.id === folderId)
  if (!folder) return

  const win = new BrowserWindow({ ...WIN_OPTS, width: 1100, height: 800, title: folder.name })
  loadRenderer(win, `folder=${folderId}`)
  runtime.detached.set(folderId, win)
  store.setFolderDetached(folderId, true)
  win.on('closed', () => {
    runtime.detached.delete(folderId)
    // папка ещё существует — вернуть её в главное окно
    if (store.getState().folders.some((f) => f.id === folderId)) {
      store.setFolderDetached(folderId, false)
    }
  })
}

function attachFolder(store: Store, folderId: string): void {
  const win = runtime.detached.get(folderId)
  if (win && !win.isDestroyed()) {
    win.close() // обработчик 'closed' снимет пометку detached
  } else {
    store.setFolderDetached(folderId, false)
  }
}

export function initWindows(ipcMain: IpcMain, store: Store): void {
  ipcMain.handle(IPC.folderDetach, (_e, id: string) => detachFolder(store, id))
  ipcMain.handle(IPC.folderAttach, (_e, id: string) => attachFolder(store, id))

  // если удалили папку, вынесенную в окно — закрыть это окно
  store.onChange((s) => {
    for (const [folderId, win] of runtime.detached) {
      if (!s.folders.some((f) => f.id === folderId) && !win.isDestroyed()) win.close()
    }
  })
}
