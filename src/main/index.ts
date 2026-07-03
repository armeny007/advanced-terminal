import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { createStore } from './store'
import { initPty } from './pty'
import { initClaude } from './claude'
import { createMainWindow, initWindows } from './windows'

const APP_NAME = 'Advanced Terminal'

/** Меню приложения: имя вместо «Electron», About с версией, копирование/вставка */
function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `О программе ${APP_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: `Скрыть ${APP_NAME}` },
        { role: 'hideOthers', label: 'Скрыть остальные' },
        { role: 'unhide', label: 'Показать все' },
        { type: 'separator' },
        { role: 'quit', label: `Выйти из ${APP_NAME}` }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полноэкранный режим' }
      ]
    },
    {
      role: 'window',
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'zoom', label: 'Масштаб' },
        { role: 'close', label: 'Закрыть' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// В dev-режиме иконка дока — стандартная иконка Electron; подменяем её нашей.
// В упакованном приложении иконку задаёт .icns из бандла.
function setDevDockIcon(): void {
  if (process.platform !== 'darwin' || app.isPackaged) return
  const img = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'))
  if (!img.isEmpty()) app.dock?.setIcon(img)
}

app.setName(APP_NAME)

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: '',
    copyright: '© 2026'
  })
  buildAppMenu()
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
