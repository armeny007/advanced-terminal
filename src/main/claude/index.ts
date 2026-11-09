// Интеграция с Claude Code: hooks, статус-машина, сессии, usage, worktrees.
import type { IpcMain } from 'electron'
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import type { ProjectConfig, QuestionAnswer } from '../../shared/types'
import { IPC } from '../../shared/types'
import type { PtyManager, Store } from '../contracts'
import { ADVTERM_DIR, ASK_SCRIPT, BIN_DIR, EVENTS_DIR, HOOK_SCRIPT } from '../paths'
import { ASK_SCRIPT_CONTENT, HOOK_SCRIPT_CONTENT, hooksInstalled, installHooks } from './hooks'
import { answerQuestion } from './questions'
import { listSessions } from './sessions'
import { getUsage } from './usage'
import { startWatcher } from './watcher'
import { createWorktreeTerminal, listWorktrees, removeWorktree, worktreeDiff } from './worktrees'

export function initClaude(ipcMain: IpcMain, store: Store, ptyManager: PtyManager): void {
  mkdirSync(ADVTERM_DIR, { recursive: true })
  mkdirSync(EVENTS_DIR, { recursive: true })

  // hook-скрипт перезаписываем всегда: он должен соответствовать текущей версии приложения
  writeFileSync(HOOK_SCRIPT, HOOK_SCRIPT_CONTENT)
  chmodSync(HOOK_SCRIPT, 0o755)
  mkdirSync(BIN_DIR, { recursive: true })
  writeFileSync(ASK_SCRIPT, ASK_SCRIPT_CONTENT)
  chmodSync(ASK_SCRIPT, 0o755)

  // хуки уже стоят — молча дописываем события, появившиеся в новых версиях (идемпотентно)
  if (hooksInstalled()) installHooks()
  store.setHooksInstalled(hooksInstalled())
  startWatcher(store)

  ipcMain.handle(IPC.claudeListSessions, (_e, projectPath?: string) => listSessions(projectPath))
  ipcMain.handle(IPC.claudeUsage, (_e, projectPath: string, sessionId: string) =>
    getUsage(projectPath, sessionId)
  )
  ipcMain.handle(IPC.claudeInstallHooks, () => {
    const res = installHooks()
    if (res.ok) store.setHooksInstalled(true)
    return res
  })

  ipcMain.handle(IPC.questionAnswer, (_e, id: string, answer: QuestionAnswer) =>
    answerQuestion({ store, pty: ptyManager }, id, answer)
  )
  ipcMain.handle(IPC.questionDismiss, (_e, id: string) => store.removeQuestion(id))

  ipcMain.handle(IPC.wtList, (_e, projectPath: string) => listWorktrees(projectPath))
  ipcMain.handle(
    IPC.wtCreateTerminal,
    (_e, opts: { folderId: string; projectPath: string; branch: string; name?: string }) =>
      createWorktreeTerminal(store, ptyManager, opts)
  )
  ipcMain.handle(IPC.wtRemove, (_e, termId: string) => removeWorktree(store, ptyManager, termId))
  ipcMain.handle(IPC.wtDiff, (_e, termId: string) => worktreeDiff(store, termId))

  ipcMain.handle(IPC.projectConfigGet, (_e, projectPath: string) =>
    store.getProjectConfig(projectPath)
  )
  ipcMain.handle(IPC.projectConfigSet, (_e, cfg: ProjectConfig) => store.setProjectConfig(cfg))
}
