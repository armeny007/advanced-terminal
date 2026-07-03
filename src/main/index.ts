import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { join } from 'path'
import { createStore } from './store'
import { initPty } from './pty'
import { initClaude } from './claude'
import { createMainWindow, initWindows } from './windows'

// В dev-режиме иконка дока — стандартная иконка Electron; подменяем её нашей.
// В упакованном приложении иконку задаёт .icns из бандла.
function setDevDockIcon(): void {
  if (process.platform !== 'darwin' || app.isPackaged) return
  const img = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (!img.isEmpty()) app.dock?.setIcon(img)
}

app.whenReady().then(() => {
  setDevDockIcon()
  const store = createStore()
  createMainWindow()

  const ptyManager = initPty(ipcMain, store)
  initClaude(ipcMain, store, ptyManager)
  initWindows(ipcMain, store)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
