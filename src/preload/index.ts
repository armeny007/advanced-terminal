import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { AdvTermApi } from '../shared/types'

/** Подписка на канал main -> renderer; возвращает функцию отписки */
function on(channel: string, cb: (...args: never[]) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    ;(cb as (...a: unknown[]) => void)(...args)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AdvTermApi = {
  // состояние
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  onStateChanged: (cb) => on(IPC.stateChanged, cb as never),

  // папки
  createFolder: (name) => ipcRenderer.invoke(IPC.folderCreate, name),
  renameFolder: (id, name) => ipcRenderer.invoke(IPC.folderRename, id, name),
  updateFolder: (id, patch) => ipcRenderer.invoke(IPC.folderUpdate, id, patch),
  deleteFolder: (id) => ipcRenderer.invoke(IPC.folderDelete, id),
  setActiveFolder: (id) => ipcRenderer.invoke(IPC.folderSetActive, id),

  // терминалы
  createTerminal: (opts) => ipcRenderer.invoke(IPC.termCreate, opts),
  writeTerminal: (id, data) => ipcRenderer.send(IPC.termWrite, id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send(IPC.termResize, id, cols, rows),
  closeTerminal: (id) => ipcRenderer.invoke(IPC.termClose, id),
  restartTerminal: (id) => ipcRenderer.invoke(IPC.termRestart, id),
  renameTerminal: (id, name) => ipcRenderer.invoke(IPC.termRename, id, name),
  moveTerminalToFolder: (id, folderId) => ipcRenderer.invoke(IPC.termMoveToFolder, id, folderId),
  bindSession: (id, sessionId) => ipcRenderer.invoke(IPC.termBindSession, id, sessionId),
  runClaude: (id, mode, sessionId) => ipcRenderer.invoke(IPC.termRunClaude, id, mode, sessionId),
  onTermData: (cb) => on(IPC.termData, cb as never),
  onTermExit: (cb) => on(IPC.termExit, cb as never),

  // claude
  listClaudeSessions: (projectPath) => ipcRenderer.invoke(IPC.claudeListSessions, projectPath),
  getUsage: (projectPath, sessionId) => ipcRenderer.invoke(IPC.claudeUsage, projectPath, sessionId),
  installHooks: () => ipcRenderer.invoke(IPC.claudeInstallHooks),
  onClaudeStatus: (cb) => on(IPC.claudeStatus, cb as never),

  // ui
  setFocusedTerm: (id) => ipcRenderer.send(IPC.uiSetFocusedTerm, id),
  onRevealTerm: (cb) => on(IPC.uiRevealTerm, cb as never),

  // worktrees (V2)
  listWorktrees: (projectPath) => ipcRenderer.invoke(IPC.wtList, projectPath),
  createWorktreeTerminal: (opts) => ipcRenderer.invoke(IPC.wtCreateTerminal, opts),
  removeWorktree: (termId) => ipcRenderer.invoke(IPC.wtRemove, termId),
  worktreeDiff: (termId) => ipcRenderer.invoke(IPC.wtDiff, termId),
  getProjectConfig: (projectPath) => ipcRenderer.invoke(IPC.projectConfigGet, projectPath),
  setProjectConfig: (cfg) => ipcRenderer.invoke(IPC.projectConfigSet, cfg)
}

contextBridge.exposeInMainWorld('api', api)
