// node-pty: жизненный цикл shell-процессов + IPC состояния/папок/терминалов/ui.
import { app } from 'electron'
import type { IpcMain } from 'electron'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { IPC } from '../shared/types'
import type { FolderInfo, FolderPatch, RunClaudeMode, TermInfo } from '../shared/types'
import type { CreateTerminalOpts, PtyManager, Store } from './contracts'
import { FOLDER_COLORS } from './store'
import { EVENTS_DIR } from './paths'
import { runtime, send } from './runtime'

export function initPty(ipcMain: IpcMain, store: Store): PtyManager {
  const ptys = new Map<string, IPty>()

  function spawnShell(id: string, cwd: string): void {
    const shell = process.env.SHELL || '/bin/zsh'
    const p = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        ADVTERM_TERM_ID: id,
        ADVTERM_EVENTS_DIR: EVENTS_DIR,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    })
    ptys.set(id, p)
    p.onData((data) => send(IPC.termData, id, data))
    p.onExit(({ exitCode }) => {
      // если терминал уже перезапущен/закрыт, этот exit — от старого процесса
      if (ptys.get(id) !== p) return
      ptys.delete(id)
      store.updateTerminal(id, { alive: false, status: 'none' })
      send(IPC.termExit, id, exitCode)
    })
  }

  function killTerminal(id: string): void {
    const p = ptys.get(id)
    if (!p) return
    ptys.delete(id) // до kill, чтобы onExit не трогал store
    p.kill()
  }

  function createTerminal(opts: CreateTerminalOpts): TermInfo {
    const id = randomUUID()
    const term: TermInfo = {
      id,
      folderId: opts.folderId,
      name: opts.name || `Терминал ${store.getState().terminals.length + 1}`,
      cwd: opts.cwd || homedir(),
      claudeSessionId: null,
      status: 'none',
      worktree: opts.worktree ?? null,
      createdAt: Date.now(),
      alive: true
    }
    store.addTerminal(term)
    spawnShell(id, term.cwd)
    return term
  }

  function writeToTerminal(id: string, data: string): void {
    ptys.get(id)?.write(data)
  }

  store.onChange((s) => send(IPC.stateChanged, s))

  // восстановление раскладки после перезапуска приложения: те же id, новые shell'ы
  for (const t of store.getState().terminals) {
    spawnShell(t.id, t.cwd)
    store.updateTerminal(t.id, { alive: true })
  }

  // --- состояние ---
  ipcMain.handle(IPC.stateGet, () => store.getState())

  // --- папки ---
  ipcMain.handle(IPC.folderCreate, (_e, name: string): FolderInfo => {
    // цвет по кругу из палитры, чтобы новые папки визуально различались
    const color = FOLDER_COLORS[store.getState().folders.length % FOLDER_COLORS.length]
    const folder: FolderInfo = { id: randomUUID(), name, color }
    store.addFolder(folder)
    return folder
  })
  ipcMain.handle(IPC.folderRename, (_e, id: string, name: string) => store.renameFolder(id, name))
  ipcMain.handle(IPC.folderUpdate, (_e, id: string, patch: FolderPatch) =>
    store.updateFolder(id, patch)
  )
  ipcMain.handle(IPC.folderDelete, (_e, id: string) => store.deleteFolder(id))
  ipcMain.handle(IPC.folderSetActive, (_e, id: string) => store.setActiveFolder(id))

  // --- терминалы ---
  ipcMain.handle(IPC.termCreate, (_e, opts: CreateTerminalOpts) => createTerminal(opts))
  ipcMain.on(IPC.termWrite, (_e, id: string, data: string) => writeToTerminal(id, data))
  ipcMain.on(IPC.termResize, (_e, id: string, cols: number, rows: number) => {
    try {
      ptys.get(id)?.resize(cols, rows)
    } catch {
      // pty мог умереть между проверкой и resize
    }
  })
  ipcMain.handle(IPC.termClose, (_e, id: string) => {
    killTerminal(id)
    store.removeTerminal(id)
  })
  ipcMain.handle(IPC.termRestart, (_e, id: string): TermInfo | undefined => {
    const t = store.getTerminal(id)
    if (!t) return undefined
    killTerminal(id)
    spawnShell(id, t.cwd)
    return store.updateTerminal(id, { alive: true, status: 'none' })
  })
  ipcMain.handle(IPC.termRename, (_e, id: string, name: string) => {
    store.updateTerminal(id, { name })
  })
  ipcMain.handle(IPC.termMoveToFolder, (_e, id: string, folderId: string) => {
    store.updateTerminal(id, { folderId })
  })
  ipcMain.handle(IPC.termBindSession, (_e, id: string, sessionId: string | null) => {
    store.updateTerminal(id, { claudeSessionId: sessionId })
  })
  ipcMain.handle(
    IPC.termRunClaude,
    (_e, id: string, mode: RunClaudeMode, sessionId?: string) => {
      const p = ptys.get(id)
      if (!p) return
      if (mode === 'new') {
        const sid = randomUUID()
        store.updateTerminal(id, { claudeSessionId: sid })
        p.write(`claude --session-id ${sid}\r`)
      } else if (mode === 'resume') {
        if (!sessionId) return
        store.updateTerminal(id, { claudeSessionId: sessionId })
        p.write(`claude --resume ${sessionId}\r`)
      } else {
        // привязка сессии придёт позже через hook SessionStart
        p.write('claude --continue\r')
      }
    }
  )

  // --- ui / настройки ---
  ipcMain.on(IPC.uiSetFocusedTerm, (_e, id: string | null) => {
    runtime.focusedTermId = id
  })
  ipcMain.handle(IPC.settingsSetAutoResume, (_e, v: boolean) => store.setAutoResumeSessions(v))

  app.on('before-quit', () => {
    for (const p of ptys.values()) p.kill()
    ptys.clear()
  })

  return { createTerminal, writeToTerminal, killTerminal }
}
