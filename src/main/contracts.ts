// Интерфейсы модулей main-процесса. Реализации: store.ts (Store), pty.ts (PtyManager).
import type { AppState, PageInfo, ProjectConfig, TermInfo, WorktreeBinding } from '../shared/types'

export interface Store {
  getState(): AppState

  addPage(p: PageInfo): void
  renamePage(id: string, name: string): void
  /** терминалы удаляемой страницы переносятся на первую оставшуюся */
  deletePage(id: string): void
  setActivePage(id: string): void

  addTerminal(t: TermInfo): void
  updateTerminal(id: string, patch: Partial<TermInfo>): TermInfo | undefined
  removeTerminal(id: string): void
  getTerminal(id: string): TermInfo | undefined
  findTerminalBySession(sessionId: string): TermInfo | undefined

  setHooksInstalled(v: boolean): void

  getProjectConfig(projectPath: string): ProjectConfig
  setProjectConfig(cfg: ProjectConfig): void

  /** подписка на любое изменение состояния (для broadcast в renderer) */
  onChange(cb: (s: AppState) => void): void
}

export interface CreateTerminalOpts {
  pageId: string
  cwd?: string
  name?: string
  worktree?: WorktreeBinding | null
}

export interface PtyManager {
  /** создаёт запись в store и запускает shell */
  createTerminal(opts: CreateTerminalOpts): TermInfo
  writeToTerminal(id: string, data: string): void
  /** убивает pty; запись в store не трогает */
  killTerminal(id: string): void
}
