import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { runtime } from './runtime'
import { createStore } from './store'
import { initPty } from './pty'
import { initClaude } from './claude'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Advanced Terminal',
    backgroundColor: '#11111b',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  const store = createStore()
  runtime.win = createWindow()

  const ptyManager = initPty(ipcMain, store)
  initClaude(ipcMain, store, ptyManager)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      runtime.win = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
